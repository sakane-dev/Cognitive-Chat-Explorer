@echo off
chcp 65001 > nul

echo ===================================================
echo Cognitive Chat-Explorer: Shutdown Sequence
echo ===================================================

REM --- uvicorn (FastAPI) プロセスの強制終了 ---
echo [1/2] Stopping FastAPI (uvicorn)...
taskkill /F /IM python.exe /T > nul 2>&1
if %errorlevel% == 0 (
    echo       [OK] Python/uvicorn processes terminated.
) else (
    echo       [INFO] No Python process found (already stopped).
)

REM --- Ollama サービスの停止 ---
echo [2/2] Stopping Ollama service...

REM まず ollama stop コマンドで正常終了を試みる
"C:\Users\yasuy\AppData\Local\Programs\Ollama\ollama.exe" stop > nul 2>&1

REM 次に ollama.exe プロセス自体を強制終了
taskkill /F /IM ollama.exe /T > nul 2>&1
if %errorlevel% == 0 (
    echo       [OK] Ollama process terminated.
) else (
    echo       [INFO] No Ollama process found (already stopped).
)

echo.
echo ===================================================
echo  All services stopped.
echo ===================================================
echo.
pause
