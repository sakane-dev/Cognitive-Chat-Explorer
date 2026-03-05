@app.get("/api/context")
def analyze_context(q: str = Query(..., description="文脈抽出対象のキーワード")):
    conn = get_db_connection()
    try:
        # FTSクエリの構築（既存ロジックを流用）
        parts = q.split()
        query_parts = []
        for part in parts:
            tokens = [t.surface for t in tokenizer.tokenize(part) if t.part_of_speech.split(',')[0] in ['名詞', '動詞', '形容詞', '未知語']]
            if len(tokens) > 1:
                query_parts.append('"' + ' '.join(tokens) + '"')
            elif len(tokens) == 1:
                query_parts.append(tokens[0])
        fts_query = " AND ".join(query_parts) if query_parts else q

        # LLMのコンテキストウィンドウに収まる範囲（上位15件程度）のメッセージを取得
        sql = """
            SELECT m.content, c.title, m.create_time
            FROM messages_fts f
            JOIN messages m ON f.rowid = m.rowid
            JOIN conversations c ON m.conversation_id = c.id
            WHERE messages_fts MATCH ?
            LIMIT 15
        """
        rows = conn.execute(sql, (fts_query,)).fetchall()

        if not rows:
            return {"query": q, "analysis": {}, "snippets": []}

        # 分析用にテキストを結合
        aggregated_text = "\n---\n".join([row["content"] for row in rows])
        snippets = [{"title": row["title"], "snippet": row["content"][:100] + "...", "date": row["create_time"]} for row in rows]

        # LLMによる文脈のメタ分析プロンプト
        prompt = f"""
        以下のテキストは、検索キーワード「{q}」が含まれる過去の対話ログの集合です。
        これらの対話を統合的に読み解き、以下のJSON形式で分析結果を出力してください。

        "overall_context": 全体として、どのような学際的テーマやビジネス課題の中で議論されているか。
        "dichotomy_and_relations": 別の概念との二項対立（例：暗黙知と形式知など）や、関連する概念との論理的接続がどう語られているか。
        "new_definitions": 既存の枠組みを超えた新しい定義や、本質的な意味階層の模索が行われていればその内容。

        対話ログ:
        {aggregated_text}
        """

        model_name = os.getenv("OLLAMA_MODEL", "qwen3:latest")
        data = json.dumps({
            "model": model_name,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2}
        }).encode('utf-8')

        req = urllib.request.Request("http://localhost:11434/api/generate", data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode('utf-8'))
            analysis_json = json.loads(result.get("response", "{}"))

        return {
            "query": q,
            "analysis": analysis_json,
            "snippets": snippets
        }

    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()
