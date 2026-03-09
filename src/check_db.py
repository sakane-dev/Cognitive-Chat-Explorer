import sqlite3
import os

# 確実に1つ上の階層（プロジェクトルート）のDBを指定
db_path = os.path.join(os.path.dirname(__file__), '..', 'chatlogs.db')

try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    # 総スレッド数と最古のタイムスタンプを取得
    cur.execute("SELECT COUNT(*), datetime(MIN(create_time), 'unixepoch', 'localtime') FROM conversations")
    res = cur.fetchone()

    print("=" * 40)
    print(f"Total Threads : {res[0]} 件")
    print(f"Oldest Date   : {res[1]}")
    print("=" * 40)

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
