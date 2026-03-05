import json
import os
import sqlite3
import glob
from argparse import ArgumentParser
from janome.tokenizer import Tokenizer

def tokenize_text(text: str, tokenizer: Tokenizer) -> str:
    """Janomeを用いてテキストを形態素解析し、名詞・動詞・形容詞等をスペース区切りで返す"""
    if not isinstance(text, str):
        return ""

    # 簡単なフィルタ: 名詞、動詞、形容詞などを抽出
    # FTS5での検索目的のため、活用語は基本形にするのがベストだが、ここではシンプルに表層形をスペース区切りにする
    tokens = []
    try:
        for token in tokenizer.tokenize(text):
            pos = token.part_of_speech.split(',')[0]
            if pos in ['名詞', '動詞', '形容詞', '副詞', '未知語']:
                # 原形(base_form)が取得できればそれを、できなければ表層形(surface)を使用
                word = token.base_form if token.base_form != '*' else token.surface
                tokens.append(word)
    except Exception:
        # エラーが発生した場合はフォールバックとして元のテキストの一部を使う等でも良いが
        pass

    return " ".join(tokens)

def build_db(data_dir: str, db_path: str):
    print(f"データベースを構築中... data_dir: {data_dir}, db_path: {db_path}")

    # 既存のDBがあれば削除
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # テーブル作成
    cursor.execute("""
        CREATE TABLE conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            create_time REAL,
            update_time REAL
        )
    """)

    cursor.execute("""
        CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            parent_id TEXT,
            author_role TEXT,
            content TEXT,
            create_time REAL
        )
    """)

    # ハイライト（保存済みの興味深い文章）テーブル
    cursor.execute("""
        CREATE TABLE highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT,
            conversation_id TEXT,
            text_content TEXT,
            nlp_tags TEXT,
            create_time REAL
        )
    """)

    # FTS5仮想テーブル作成（日本語検索用）
    # content_tokens にJanomeで分かち書きした文字列を入れる
    cursor.execute("""
        CREATE VIRTUAL TABLE messages_fts USING fts5(
            content_tokens,
            content="messages",
            content_rowid="rowid"
        )
    """)

    tokenizer = Tokenizer()

    # conversations*.json ファイルを検索
    json_pattern = os.path.join(data_dir, "conversations-*.json")
    files = glob.glob(json_pattern)

    if not files:
        # 古いエクスポート形式の場合 (conversations.json)
        legacy_file = os.path.join(data_dir, "conversations.json")
        if os.path.exists(legacy_file):
            files = [legacy_file]

    print(f"見つかったJSONファイル: {len(files)}件")

    for file_path in files:
        print(f"処理中: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            conversations = json.load(f)

        for conv in conversations:
            conv_id = conv.get("id")
            title = conv.get("title", "")
            create_time = conv.get("create_time", 0.0)
            update_time = conv.get("update_time", 0.0)

            cursor.execute("""
                INSERT OR IGNORE INTO conversations (id, title, create_time, update_time)
                VALUES (?, ?, ?, ?)
            """, (conv_id, title, create_time, update_time))

            mapping = conv.get("mapping", {})
            for node_id, node in mapping.items():
                message = node.get("message")
                parent = node.get("parent", "")

                if not message:
                    continue

                author_role = message.get("author", {}).get("role", "")
                content_dict = message.get("content", {})
                parts = content_dict.get("parts", [])

                # 文字列のみのpartsを結合（画像等は無視）
                text_parts = [str(p) for p in parts if isinstance(p, str)]
                content_text = "\\n".join(text_parts).strip()

                msg_create_time = message.get("create_time", 0.0)

                if not content_text:
                    continue

                try:
                    cursor.execute("""
                        INSERT OR IGNORE INTO messages (id, conversation_id, parent_id, author_role, content, create_time)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (node_id, conv_id, parent, author_role, content_text, msg_create_time))

                    # 挿入された行のrowidを取得
                    rowid = cursor.lastrowid

                    # NLPトークナイズ (分かち書き)
                    content_tokens = tokenize_text(content_text, tokenizer)

                    # FTS仮想テーブルに挿入
                    cursor.execute("""
                        INSERT INTO messages_fts (rowid, content_tokens)
                        VALUES (?, ?)
                    """, (rowid, content_tokens))
                except Exception as e:
                    print(f"メッセージ挿入中にエラー: {e}")

    conn.commit()
    conn.close()
    print("データベースの構築が完了しました！")

if __name__ == "__main__":
    parser = ArgumentParser(description="JSONログをSQLiteにインデックス化するスクリプト")
    parser.add_argument("--data-dir", required=True, help="会話ログ(conversations-*.json)があるディレクトリ")
    parser.add_argument("--db-path", default="chatlogs.db", help="生成するSQLiteデータベースのパス")

    args = parser.parse_args()
    build_db(args.data_dir, args.db_path)
