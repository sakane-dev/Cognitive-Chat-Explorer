import sqlite3
import os
import json
import urllib.request
import argparse
import numpy as np
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chatlogs.db")
VECTOR_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "vectors.npz")

def get_embedding(args: tuple) -> tuple:
    """Ollama APIを使ってテキストの埋め込みベクトルを取得する（並列実行対応）"""
    msg_id, text, model_name, api_url = args
    data = json.dumps({
        "model": model_name,
        "prompt": text,
    }).encode('utf-8')
    req = urllib.request.Request(
        f"{api_url}/api/embeddings",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            embedding = result.get("embedding", [])
            if embedding:
                return (msg_id, embedding)
            return (msg_id, None)
    except Exception as e:
        print(f"  [Error] ID={msg_id}: {e}")
        return (msg_id, None)

def build_vector_db(model_name: str, api_url: str, limit: int, workers: int, resume: bool):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # 既存ベクトルDBが存在する場合、resumeモードでは処理済みIDをスキップする
    existing_ids = set()
    existing_embeddings = []
    existing_id_list = []

    if resume and os.path.exists(VECTOR_DB_PATH):
        data = np.load(VECTOR_DB_PATH)
        existing_id_list = data['ids'].tolist()
        existing_embeddings = list(data['embeddings'])
        existing_ids = set(existing_id_list)
        print(f"[Resume] Loaded {len(existing_ids)} existing embeddings.")

    query = "SELECT id, content FROM messages WHERE length(content) > 30"
    if limit > 0:
        query += f" LIMIT {limit}"

    cursor = conn.cursor()
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    # 未処理の行だけフィルタリング（resumeモード）。
    # 十分な文脈を保持できるよう、先頭3000文字でクリップする
    pending_rows = [(row["id"], row["content"][:3000], model_name, api_url)
                    for row in rows if row["id"] not in existing_ids]

    total = len(pending_rows)
    already_done = len(existing_ids)
    print(f"Total messages in DB: {len(rows)}")
    print(f"Already embedded:     {already_done}")
    print(f"Remaining to process: {total}")
    print(f"Workers (parallel):   {workers}")

    if total == 0:
        print("All messages are already embedded. Done!")
        return

    ids = list(existing_id_list)
    embeddings = list(existing_embeddings)

    start_time = time.time()
    done_count = 0
    checkpoint_interval = 500  # 500件ごとに中間保存

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(get_embedding, task): task for task in pending_rows}

        for future in as_completed(futures):
            msg_id, vector = future.result()
            done_count += 1

            if vector:
                ids.append(msg_id)
                embeddings.append(vector)

            # 進捗表示
            if done_count % 100 == 0:
                elapsed = time.time() - start_time
                pct = done_count / total * 100
                speed = done_count / elapsed if elapsed > 0 else 0
                eta_min = (total - done_count) / (speed * 60) if speed > 0 else 0
                print(f"  [{done_count}/{total} | {pct:.1f}% | {elapsed:.0f}s elapsed | ETA: {eta_min:.1f}min]")

            # チェックポイント保存（途中クラッシュ対策）
            if done_count % checkpoint_interval == 0 and embeddings:
                _save(ids, embeddings)
                print(f"  [Checkpoint saved: {len(embeddings)} total embeddings]")

    # 最終保存
    _save(ids, embeddings)
    total_time = time.time() - start_time
    print(f"\nCompleted! {len(embeddings)} embeddings saved in {total_time:.0f}s")

def _save(ids: list, embeddings: list):
    """ベクトルをnpzに正規化して保存（コサイン類似度計算用）"""
    embeddings_np = np.array(embeddings, dtype=np.float32)
    norms = np.linalg.norm(embeddings_np, axis=1, keepdims=True)
    norms[norms == 0] = 1e-10
    embeddings_np = embeddings_np / norms
    np.savez_compressed(
        VECTOR_DB_PATH,
        embeddings=embeddings_np,
        ids=np.array(ids, dtype=str)
    )

if __name__ == "__main__":
    parser = argparse.ArgumentParser("Ollama-based Vector Embedding Builder")
    parser.add_argument("--model", type=str, default="snowflake-arctic-embed2",
                        help="Ollama embedding model (e.g., snowflake-arctic-embed2, bge-m3)")
    parser.add_argument("--api-url", type=str, default="http://localhost:11434",
                        help="Ollama API base URL")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit number of messages to process (0 = all)")
    parser.add_argument("--workers", type=int, default=4,
                        help="Number of parallel embedding workers (default: 4)")
    parser.add_argument("--resume", action="store_true",
                        help="Resume from existing vectors.npz (skip already embedded IDs)")

    args = parser.parse_args()
    build_vector_db(args.model, args.api_url, args.limit, args.workers, args.resume)
