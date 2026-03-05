# アーキテクチャ構成設計 (Architecture)

## 1. 全体アーキテクチャ図

クライアントレイヤ（ブラウザ）からバックエンドAPIを呼び出し、DBから情報を取得する3層アーキテクチャ。

1. **Frontend (UI層)**
   - HTML5, Vanilla JavaScript, CSS (Glassmorphism & Dark Mode)
   - Chart.js等によるインサイト表示
   - `/static/` (CSS/JS等), `/templates/` (index.html)
2. **Backend (API層, Python)**
   - **FastAPI**: 非常に高速なPython Webフレームワーク
   - `/api/search` : 検索エンドポイント
   - `/api/analyze` : 分析用エンドポイント
   - `/api/highlights`: NLPによるテキストハイライト保存・タグ付与、および一覧取得エンドポイント
3. **Database (データ層)**
   - **SQLite3 + FTS5**: `chatlogs.db`
   - 各メッセージデータを格納。「メッセージID」「親ID」「会話ID」「発信者 (user/assistant)」「生成時間」「本文」「分かち書きインデックス」など。

## 2. データベース・スキーマ設計概念
### テーブル: `conversations`
- `id`: PK (会話ID)
- `title`: 会話タイトル
- `create_time`: 会話開始時間
- `update_time`: 会話更新時間

### テーブル: `messages`
- `id`: PK
- `conversation_id`: FK
- `role`: user or assistant or system
- `content`: メッセージ本文
- `create_time`: 作成時間

### テーブル: `highlights`
- `id`: PK (AUTOINCREMENT)
- `message_id`: 元メッセージへの参照
- `conversation_id`: 会話IDへの参照
- `text_content`: マークアップされた抽出テキスト
- `nlp_tags`: Janomeにより付与された自動タグカテゴリ（カンマ区切り）
- `create_time`: 保存時間

### 仮想テーブル: `messages_fts` (SQLite FTS5)
- 分かち書き済みの `content_tokens` を保存し、MATCH検索を行うためのFTS5仮想テーブル。

## 3. NLPパイプライン処理 (Janome)
- インポートフェーズにおいて、メッセージ `content` をJanomeで形態素解析する。
- 名詞や動詞の基本形を抽出し、スペース区切り文字列として `messages_fts` に保存し、検索と集計の両方に使用可能にする。
