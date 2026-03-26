@echo off
chcp 65001 > nul

echo ===================================================
echo Cognitive Chat-Explorer: Restart Sequence
echo ===================================================

REM =====================================================
REM STEP 1: 既存プロセスの決定論的クリーンスタート
REM （環境変数の継承不一致を防ぐため既存プロセスを無条件でkill）
REM =====================================================
echo [1/4] Stopping existing FastAPI (uvicorn)...
taskkill /F /IM python.exe /T > nul 2>&1
if %errorlevel% == 0 (
    echo       [OK] Python/uvicorn terminated.
) else (
    echo       [INFO] No Python process found.
)

echo [2/4] Terminating Ollama to prevent env mismatch...
taskkill /F /IM ollama.exe /T > nul 2>&1
if %errorlevel% == 0 (
    echo       [OK] Ollama terminated.
) else (
    echo       [INFO] No Ollama process found.
)

REM ポートが解放されるまで待機
echo       Waiting for ports to be released...
timeout /t 3 /nobreak > nul

REM =====================================================
REM STEP 2: 環境変数の注入（新プロセスに確実に引き継ぐ）
REM =====================================================
echo [3/4] Injecting environment variables...

set OLLAMA_KEEP_ALIVE=5m
set OLLAMA_MAX_VRAM=12G
set PYTHONPATH=%~dp0
set OLLAMA_EMBED_MODEL=snowflake-arctic-embed2:latest
set OLLAMA_MODEL=qwen3:latest

echo       [INFO] Embedding Model : %OLLAMA_EMBED_MODEL%
echo       [INFO] Inference Model : %OLLAMA_MODEL%

REM =====================================================
REM STEP 3: Ollamaをenv付きバックグラウンドプロセスとして再生成
REM =====================================================
echo [4/4] Starting Ollama with injected env, then FastAPI...
start "Ollama Service" /MIN ollama serve
echo       Waiting 3 seconds for Ollama API to become available...
timeout /t 3 /nobreak > nul

REM warm-up完了後にアクセスされるよう15秒後にブラウザを開く
start "" cmd /c "timeout /t 15 /nobreak > nul && start http://127.0.0.1:8000"

echo.
echo ===================================================
echo  Cognitive Chat-Explorer is restarting...
echo  (lifespan warm-up in progress... ~10-60 sec)
echo  Access: http://127.0.0.1:8000
echo ===================================================
echo.

REM lifespan機構によりモデルウォームアップ完了後にリクエスト受付が開始される
.\venv\Scripts\python.exe -m uvicorn src.app:app --reload

pause
