# Cognitive Knowledge Engine (CKE) 🧠💎

検索を超えた、思考の再発見。
Cognitive Knowledge Engine (CKE) は、過去のチャットログや思考ログを「意味」と「文脈」のレベルで探索し、LLM（ローカルLLM）を用いた認識論的分析によって新たな知見を抽出するための、ハイエンドなローカル・ナレッジ・インフラストラクチャです。

---

## 🏗️ システム・アーキテクチャ (3-Column Interface)

CKEは、情報の「一覧性」「流動性」「深度」を両立させる、モダンな3カラム構成のインターフェースを採用しています。

1.  **左ペイン: 📚 History Sidebar**
    *   全スレッドを最新順/古い順で管理。
    *   メッセージ数や作成日時を即座に確認し、過去のコンテキストへ瞬時にアクセス。
2.  **中央ペイン: 🌐 Conversations Timeline**
    *   「Hybrid Search (語彙 + 意味)」の結果を時系列で表示。
    *   キーワード一致（緑）と意味的近傍（紫）をバッジで視覚的に区別。
3.  **右ペイン: 🧬 Semantic Dashboard**
    *   LLMによる意味論的インサイト、共起語分析、頻出エンティティ、グローバルトピックス（Chart.js）を統合表示。

---

## 🔎 データフロー & テクニカル・レイヤー

### 1. データ構築レイヤー (Database & Vector DB)
*   **Relational DB**: SQLite3 (FTS5) を使用。日本語の形態素解析（Janome）を組み込み、高速な全文検索を実現。
*   **Vector DB**: `bge-m3` モデル（Ollama経由）を用い、全メッセージの高次元ベクトルを `vectors.npz` に保存。
*   **Hybrid Retrieval**: コサイン類似度による「意味検索」と、BM25ライクな「語彙検索」を統合し、検索意図に最も近いコンテキストをランク付けします。

### 2. コンテキスト分析レイヤー (Cognitive Analysis)
*   **Dynamic Prompting**: 与えられたコンテキストを「概念探求型 (Conceptual)」と「タスク実行型 (Task Execution)」に自動分類。
*   **Epistemological Analysis**: 
    *   **暗黙の前提**: 議論の根底にあるパラダイムの抽出。
    *   **概念の二項対立**: 思想の対立構造の可視化。
    *   **創発的概念**: 対立を超えた新しい視座の提示。

### 3. ハードウェア最適化 (Inference Optimization)
*   **VRAM完結型推論**: RTX 3060 (12GB) の性能をフルに引き出すため、全レイヤーをGPUにロード。PCIeバスのボトルネックを排除。
*   **OS呼吸領域の確保**: `num_thread: 8` の制約を課すことで、i7-10700K などのマルチコア環境において、推論中もシステム（エクスプローラー等）のレスポンスを維持します。

---

## 📁 ファイル構成と相関関係

```text
CKE/
├── src/
│   ├── app.py             # FastAPI バックエンドサーバー、Ollama API連携、DB検索ロジック
│   ├── build_db.py        # SQLite3 (FTS5) へのデータインポートと形態素解析
│   ├── build_vector_db.py # エンべディング生成と vectors.npz の構築
│   ├── templates/
│   │   └── index.html      # Glassmorphism UI、3カラムレイアウト、モーダル構造
│   └── static/
│       ├── js/main.js      # 非同期通信、History管理、Markdown生成、Chart描画
│       └── css/style.css   # ダークモード、ガラスモーフィズム、レスポンシブデザイン
├── chatlogs.db             # 会話データ、メッセージ、ハイライト、検索インデックス
└── vectors.npz             # 高次元ベクトルEmbeddingデータ
```

---

## 💾 知識のポータビリティ (Markdown Export)

CKEは「知識を留める場所」ではなく「知識を循環させる場所」です。
スレッド単位での **Markdownエクスポート** 機能を搭載し、外部ツール（Obsidian, Notion, Zettelkasten等）へのシームレスな移行をサポートします。
*   **📋 Copy MD**: クリップボードへ瞬時に Markdown 形式でコピー。
*   **📥 Download**: Blob方式による高速な物理ファイル保存。

---

## ⚡ セットアップ & 実行

### 1. 依存関係のインストール
```bash
pip install -r requirements.txt
```

### 2. データベースとベクトルの構築
```bash
# JSONデータからDBを構築
python src/build_db.py --data-dir "path/to/export"
# ベクトルエンべディングを生成 (workers数は環境に合わせて調整)
python src/build_vector_db.py --workers 4
```

### 3. サーバー起動
```bash
uvicorn src.app:app --host 127.0.0.1 --port 8000 --reload
```

---

## 🛠️ ハードウェア要件 (推奨)
*   **GPU**: NVIDIA VRAM 12GB以上 (RTX 3060等)
*   **RAM**: 32GB以上 (64GB推奨)
*   **CPU**: 8コア/16スレッド以上 (Core i7-10700K等)
*   **Runtime**: Ollama, CUDA

---

*CKEは、あなたの過去の断片的な記憶を、未来のための強固な知識基盤へと変容させます。*
