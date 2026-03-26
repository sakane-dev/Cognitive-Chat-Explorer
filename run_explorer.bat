@echo off
REM ターミナルの文字コードをUTF-8に強制し、ログの文字化けを防止
chcp 65001 > nul

echo ===================================================
echo Cognitive Chat-Explorer: Boot Sequence Initiated
echo ===================================================

REM -------------------------------------------------------
REM [決定論的クリーンスタート]
REM トレイ常駐等で既に起動しているOllamaプロセスには
REM このセッションの環境変数が一切引き継がれないため、
REM 無条件でkillし、確実にenv付きで再生成する。
REM -------------------------------------------------------
echo [INFO] Terminating existing Ollama processes to prevent env mismatch...
taskkill /F /IM ollama.exe > nul 2>&1
timeout /t 2 /nobreak > nul

REM --- 環境変数の注入（新プロセスに確実に引き継ぐ） ---
set OLLAMA_KEEP_ALIVE=5m
set OLLAMA_MAX_VRAM=12G
set PYTHONPATH=%~dp0
set OLLAMA_EMBED_MODEL=snowflake-arctic-embed2:latest
set OLLAMA_MODEL=qwen3:latest

echo [INFO] Embedding Model : %OLLAMA_EMBED_MODEL%
echo [INFO] Inference Model : %OLLAMA_MODEL%

REM --- Ollamaをenv付きのバックグラウンドプロセスとして再生成 ---
echo [INFO] Starting Ollama with injected environment variables...
start "Ollama Service" /MIN ollama serve
echo [INFO] Waiting 3 seconds for Ollama API to become available...
timeout /t 3 /nobreak > nul

echo [INFO] Starting FastAPI Server (with model warm-up lifespan)...

REM warm-up完了後にアクセスされるよう15秒後にブラウザを開く
start "" cmd /c "timeout /t 15 /nobreak > nul && start http://127.0.0.1:8000"

REM Uvicornによるアプリケーションの起動
REM lifespan機構によりモデルのウォームアップが完了してからリクエスト受付が開始される
.\venv\Scripts\python.exe -m uvicorn src.app:app --reload

pause
