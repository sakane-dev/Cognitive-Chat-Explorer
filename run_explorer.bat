@echo off
REM ターミナルの文字コードをUTF-8に強制し、ログの文字化けを防止
chcp 65001 > nul

echo ===================================================
echo Cognitive Chat-Explorer: Boot Sequence Initiated
echo ===================================================

REM 認識論的分析およびセマンティック検索のための環境変数を決定論的に注入
set OLLAMA_EMBED_MODEL=snowflake-arctic-embed2:latest
set OLLAMA_MODEL=qwen3:latest

echo [INFO] Embedding Model : %OLLAMA_EMBED_MODEL%
echo [INFO] Inference Model : %OLLAMA_MODEL%
echo [INFO] Starting FastAPI Server...

REM サーバー起動の直前に、既定のブラウザでローカルホストを非同期に開く
start "" http://127.0.0.1:8000

REM Uvicornによるアプリケーションの起動
uvicorn src.app:app --reload

pause
