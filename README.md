# Cognitive-Chat-Explorer

A powerful local LLM-based search engine for chat archives. It seamlessly integrates FTS5 lexical search with high-dimensional semantic vector search via Ollama, enabling deep cognitive exploration of past conversational contexts.

ChatGPTの過去の会話ログから、単なるキーワード一致を超えた「意味」や「コンテキスト」のレベルで知見を探索・分析するためのローカルWebアプリケーションです。

## 主な機能
1. **Semantic Vector Search (意味的探索)**: Ollamaと強力な多言語エンベディングモデルを活用した、表現の揺らぎを吸収する文脈検索。
2. **Cognitive Analysis (LLMメタ分析)**: 検索結果に対してローカルLLMがオンザフライで意味論的分析・概念抽出を実行。
3. **Full-Text Retrieval (語彙検索)**: SQLiteのFTS5とJanomeを組み合わせた高速なキーワードマッチ。
4. **Context-Aware UI**: 語彙の一致（緑色）と意味的近傍（紫色）をバッジとハイライトで視覚的に区別する認知科学的デザイン。

## 技術スタック
- **バックエンド**: Python 3, FastAPI, SQLite3 (FTS5)
- **AI & Embedding**: Ollama (`qwen3` for generation, `snowflake-arctic-embed2` for vectors)
- **フロントエンド**: HTML5, Vanilla CSS, JS (Chart.js)

## セットアップ

### 1. 依存ライブラリのインストール
```bash
pip install -r requirements.txt
```

### 2. データベースの構築
エクスポートしたJSONファイルがあるディレクトリパスを指定し、DBを構築します。
```bash
python src/build_db.py --data-dir "f:\chatgpt\chatgpt_export_20260304"
```

### 3. アプリケーションの起動
```bash
uvicorn src.app:app --reload
```
起動後、ブラウザで `http://127.0.0.1:8000` にアクセスしてください。
