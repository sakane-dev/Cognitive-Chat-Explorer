import sqlite3
import os
from janome.tokenizer import Tokenizer

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chatlogs.db")
tokenizer = Tokenizer()

def tokenize_text(text: str) -> str:
    tokens = []
    try:
        for token in tokenizer.tokenize(text):
            pos = token.part_of_speech.split(',')[0]
            if pos in ['名詞', '動詞', '形容詞', '副詞', '未知語']:
                word = token.base_form if token.base_form != '*' else token.surface
                tokens.append(word)
    except Exception:
        pass
    return " ".join(tokens)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

print("Dropping old FTS table...")
cursor.execute("DROP TABLE IF EXISTS messages_fts")

print("Creating new FTS table...")
cursor.execute("""
    CREATE VIRTUAL TABLE messages_fts USING fts5(
        content_tokens
    )
""")

print("Rebuilding FTS index from messages table. This might take a minute or two...")
cursor.execute("SELECT rowid, content FROM messages")
rows = cursor.fetchall()
total = len(rows)

for i, (rowid, content) in enumerate(rows):
    if i % 5000 == 0:
        print(f"Processed {i}/{total} messages...")

    if content:
        tokens_str = tokenize_text(content)
        cursor.execute("INSERT INTO messages_fts(rowid, content_tokens) VALUES(?, ?)", (rowid, tokens_str))

conn.commit()
conn.execute("INSERT INTO messages_fts(messages_fts) VALUES('optimize')")
conn.close()
print("FTS index rebuild complete!")
