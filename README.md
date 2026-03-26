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
    *   スニペットをクリックするとタイムライン上の該当メッセージへスクロール、またはスレッドモーダルを起動。

3.  **右ペイン: 🧬 Semantic Intelligence Dashboard**
    *   **Semantic Intelligence (LLM Analysis)**: LLMによる3軸の意味論的インサイト（Overall Context / Dichotomy & Relations / New Definitions）を表示。各セクションはコピー可能、テキスト内の概念語はクリックでドリルダウン検索。
    *   **根拠表示（Evidence Source）**: 各分析の生成根拠となったメッセージをスニペットで提示。クリックでソーススレッドへジャンプ。
    *   **Co-occurring Words**: 検索語と共起する上位語をタグ表示。クリックでドリルダウン検索。
    *   **Usage Snippets**: 検索語の用例を時系列順で表示。クリックで発言元の文脈へジャンプ。
    *   **Global Topics (Chart.js)**: 全会話の頻出語を Polar Area Chart で可視化。セグメントクリックでドリルダウン。
    *   **Top Frequent Entities**: 頻出エンティティをタグ一覧で表示。クリックでドリルダウン検索。
    *   **Recent NLP Highlights**: 保存済みハイライトをカード形式で表示。元スレッドへの回帰とMarkdownエクスポートに対応。

---

## 🔎 データフロー & テクニカル・レイヤー

### 1. データ構築レイヤー (Database & Vector DB)
*   **Relational DB**: SQLite3 (FTS5) を使用。日本語の形態素解析（Janome）を組み込み、高速な全文検索を実現。
*   **Vector DB**: `bge-m3` モデル（Ollama経由）を用い、全メッセージの高次元ベクトルを `vectors.npz` に保存。
*   **Hybrid Retrieval**: コサイン類似度による「意味検索」と、BM25ライクな「語彙検索」を統合し、検索意図に最も近いコンテキストをランク付け。

### 2. コンテキスト分析レイヤー (Cognitive Analysis)
*   **Semantic Intelligence**: 検索クエリに紐づく会話群をLLMが統合分析し、3つの知的視点で出力。
    *   **Overall Context**: 議論されている学際的テーマ・課題の要約。
    *   **Dichotomy & Relations**: 概念の二項対立および論理的接続の抽出。
    *   **New Definitions**: 既存の定義を超えた新しい意味の再構成。
*   **Local Context Analysis (オンデマンド)**: スレッドモーダル内から発動。周辺メッセージを「概念探求型」「タスク実行型」に自動分類し、暗黙の前提・二項対立・創発的概念を構造化出力。
*   **NLP Highlight**: テキスト選択で発動。NLPによってタグ・コンテキスト・意図を抽出して保存。

### 3. ハードウェア最適化 (Inference Optimization)
*   **VRAM完結型推論**: RTX 3060 (12GB) の性能をフルに引き出すため、全レイヤーをGPUにロード。
*   **OS呼吸領域の確保**: `num_thread: 8` の制約により、推論中もシステムのレスポンスを維持。

---

## 📁 ファイル構成と相関関係

```text
CKE/
├── src/
│   ├── app.py             # FastAPI バックエンド、Ollama API連携、DB検索/分析ロジック
│   ├── build_db.py        # SQLite3 (FTS5) へのデータインポートと形態素解析
│   ├── build_vector_db.py # エンべディング生成と vectors.npz の構築
│   ├── templates/
│   │   └── index.html     # Glassmorphism UI、3カラムレイアウト、スレッドモーダル
│   └── static/
│       ├── js/main.js     # 非同期通信、History管理、Semantic分析、Chart描画、イベント委譲
│       └── css/style.css  # ダークモード、ガラスモーフィズム、インタラクションスタイル
├── docs/
│   ├── fsd_20260307.md    # 機能仕様書 v1（第1〜2工期）
│   └── fsd_20260326.md    # 機能仕様書 v2（最新版、UI設計原則含む）
├── chatlogs.db            # 会話データ、メッセージ、ハイライト、検索インデックス
└── vectors.npz            # 高次元ベクトルEmbeddingデータ
```

---

## 💾 知識のポータビリティ (Export & Copy)

CKEは「知識を留める場所」ではなく「知識を循環させる場所」です。

*   **スレッドエクスポート**: 📋 Copy MD / 📥 Download でスレッド全文をMarkdown形式で外部へ持ち出し。
*   **Semantic Intelligence コピー**: 各分析セクションまたは全体をMarkdown形式でコピー。
*   **NLP Highlight エクスポート**: タグ・コンテキスト・意図を含むハイライトをMarkdown形式でコピー。

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
# ベクトルエンべディングを生成
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

## 🗺️ ロードマップ

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | フロントエンド高度化・ポータビリティ確立 | ✅ 完了 |
| Phase 2 | マルチLLMセマンティック統合パイプライン | 🔄 進行中 |
| Phase 3 | 思考の継続的インテグレーション（完全自動化） | 📋 計画中 |
| Phase 4 | グラフRAG（Neo4j）+ 意味空間ビジュアライザー | 📋 設計中 |

---

*CKEは、あなたの過去の断片的な記憶を、未来のための強固な知識基盤へと変容させます。*
