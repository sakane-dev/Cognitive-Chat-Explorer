import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chatlogs.db")
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

# Show sample of tokens in DB
print(conn.execute("SELECT content_tokens FROM messages_fts LIMIT 3").fetchall())

# Test query for '形式 AND 知'
q = "形式 AND 知"
rows = conn.execute("SELECT rowid, content_tokens FROM messages_fts WHERE messages_fts MATCH ? LIMIT 3", (q,)).fetchall()
print(f"Results for '{q}':", len(rows))
for r in rows:
    print(r['rowid'], r['content_tokens'][:50])
