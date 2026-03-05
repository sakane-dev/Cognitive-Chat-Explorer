import sqlite3
import os
import json
import urllib.request
import argparse

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chatlogs.db")
GRAPH_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "knowledge_graph.db")

def init_graph_db():
    conn = sqlite3.connect(GRAPH_DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            type TEXT,
            description TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_entity_id INTEGER,
            target_entity_id INTEGER,
            relation_type TEXT,
            context_id TEXT, -- message_id
            description TEXT,
            FOREIGN KEY(source_entity_id) REFERENCES entities(id),
            FOREIGN KEY(target_entity_id) REFERENCES entities(id)
        )
    """)
    conn.commit()
    conn.close()

def extract_entities_and_relations(text: str, model_name: str, api_url: str):
    prompt = f"""
あなたは高度な知識グラフ（Knowledge Graph）抽出AIです。
以下のテキストから、重要な「エンティティ（Entity）」と「関係性（Relationship）」を抽出し、JSONフォーマットのみで出力してください。

# 抽出のルール:
- エンティティ(entities): 名前(name)、タイプ(type: "概念", "技術", "人物", "組織", "課題"など)、説明(description)
- 関係性(relationships): 元エンティティ名(source)、先エンティティ名(target)、関係タイプの動詞(relation: "requires", "solves", "is_a", "implements", "opposes" など)、文脈の説明(description)

# テキスト:
{text}

# 出力フォーマット例:
{{
  "entities": [
    {{"name": "形式知", "type": "概念", "description": "言語化・構造化された知識"}},
    {{"name": "暗黙知", "type": "概念", "description": "経験や直感に基づく言語化されていない知識"}}
  ],
  "relationships": [
    {{"source": "形式知", "target": "暗黙知", "relation": "opposes", "description": "形式知は暗黙知の対立概念として論じられている"}}
  ]
}}
出力は必ずJSONのみとし、余計な説明文を含めないでください。
"""
    data = json.dumps({
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1
        }
    }).encode('utf-8')

    req = urllib.request.Request(f"{api_url}/api/generate", data=data, headers={'Content-Type': 'application/json'})

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return json.loads(result.get("response", "{}"))
    except Exception as e:
        print(f"Ollama API Error: {e}")
        return None

def process_messages(limit: int, model: str, api_url: str):
    init_graph_db()

    conn_logs = sqlite3.connect(DB_PATH)
    conn_logs.row_factory = sqlite3.Row
    conn_graph = sqlite3.connect(GRAPH_DB_PATH)

    # 最近の長めのユーザー発言をサンプリング
    messages = conn_logs.execute("""
        SELECT id, content FROM messages
        WHERE author_role = 'user' AND length(content) > 100
        ORDER BY create_time DESC LIMIT ?
    """, (limit,)).fetchall()

    for msg in messages:
        msg_id = msg['id']
        content = msg['content']

        print(f"\n--- Processing Message ID: {msg_id} ---")
        print(f"Text Snippet: {content[:100]}...")

        graph_data = extract_entities_and_relations(content, model, api_url)
        if not graph_data:
            continue

        print(f"Extracted: {len(graph_data.get('entities', []))} entities, {len(graph_data.get('relationships', []))} relationships")

        c = conn_graph.cursor()

        # Insert Entities
        entity_map = {}
        for ent in graph_data.get("entities", []):
            name = ent.get("name")
            if not name: continue

            try:
                c.execute("INSERT OR IGNORE INTO entities (name, type, description) VALUES (?, ?, ?)",
                          (name, ent.get("type", "unknown"), ent.get("description", "")))
                # Update description if it was ignored
                c.execute("UPDATE entities SET description = ? WHERE name = ? AND description = ''",
                          (ent.get("description", ""), name))

                # Fetch ID
                c.execute("SELECT id FROM entities WHERE name = ?", (name,))
                eid = c.fetchone()[0]
                entity_map[name] = eid
            except Exception as e:
                print(f"Entity DB Error: {e}")

        # Insert Relationships
        for rel in graph_data.get("relationships", []):
            src_name = rel.get("source")
            tgt_name = rel.get("target")

            src_id = entity_map.get(src_name)
            tgt_id = entity_map.get(tgt_name)

            if src_id and tgt_id:
                try:
                    c.execute("""
                        INSERT INTO relationships (source_entity_id, target_entity_id, relation_type, context_id, description)
                        VALUES (?, ?, ?, ?, ?)
                    """, (src_id, tgt_id, rel.get("relation", ""), msg_id, rel.get("description", "")))
                except Exception as e:
                    print(f"Relationship DB Error: {e}")

        conn_graph.commit()

    conn_logs.close()
    conn_graph.close()
    print("\nKnowledge Graph Extraction Complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser("Ollama-based GraphRAG Extractor")
    parser.add_argument("--limit", type=int, default=5, help="Number of messages to process")
    parser.add_argument("--model", type=str, default="llama3", help="Ollama model name (e.g. llama3, qwen, command-r)")
    parser.add_argument("--api-url", type=str, default="http://localhost:11434", help="Ollama API base URL")

    args = parser.parse_args()
    process_messages(args.limit, args.model, args.api_url)
