# ChatLog Search & NLP Analyzer

ChatGPTの過去の会話ログ（エクスポートされたJSONデータ）から、知見を検索・分析するためのローカルWebアプリケーションです。

## 主な機能
1. **全文検索機能 (Full-Text Search)**: SQLiteのFTS5とJanome（形態素解析）を組み合わせた日本語の高速全文検索。
2. **自然言語処理 (NLP) 分析**: 会話履歴から頻出キーワード・トピックを抽出し、ダッシュボード上に可視化。
3. **モダンで直感的なUI**: グラスモーフィズムやダークモードを採用した、プレミアムなシングルページアプリケーション (SPA)。

## 技術スタック
- **バックエンド**: Python 3, FastAPI, SQLite3
- **NLP手法**: Janome (日本語形態素解析)
- **フロントエンド**: HTML5, Vanilla CSS, JS (Chart.js など)

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
