# [Implementation Plan] UI Bug Fix: Disappearing Word List

The user reports that the "word group" (top words like "and 334", "the 246") disappears shortly after starting a search, and the right pane's state seems inconsistent during the ~3-second window while the LLM is analyzing.

## User Review Required

> [!IMPORTANT]
> この修正により、検索開始時に右ペインの古いデータが「Loading...」状態で上書きされる挙動を、より洗練された「スケルトン表示」または「現在のデータを保持したままローディング中を表示」する形式に変更します。

## Proposed Changes

### [Component] Frontend (JavaScript/HTML)

#### [MODIFY] [main.js](file:///c:/dev/cognitive-knowledge-engine/src/static/js/main.js)
- `fetchContext` と `fetchSemanticContext` のローディング表示を改善し、前の検索結果を安易に消去せず、オーバーレイなどで「処理中」であることを示すように調整します。
- あるいは、全ての関連データ（Top Words, Co-occurring Words, LLM Analysis）が揃うまで、右ペインの表示更新を同期させる検討をします（ただしUX的には非同期の方が良いため、ローディングインジケータの一貫性を重視します）。

#### [MODIFY] [index.html](file:///c:/dev/cognitive-knowledge-engine/src/templates/index.html)
- 右ペインの各セクションに一貫したローディングプレースホルダー（スケルトン）を追加します。

### [Component] Backend (Python)

#### [MODIFY] [app.py](file:///c:/dev/cognitive-knowledge-engine/src/app.py)
- `analyze` 関数が `author_role = 'user'` のみに限定されているのを、検索時は `assistant` も含めるように変更し、より豊かな共起語/頻出語が表示されるようにします。

---

## Verification Plan

### Automated Tests
- なし（UIの挙動とAPIの返り値の修正が主目的のため）

### Manual Verification
1. アプリケーションを起動し、初期ロードで「Top Frequent Entities」が表示されることを確認。
2. 検索キーワード（例: "threat"）を入力して検索。
3. 検索中（Center TimelineがLoading中）に、右ペインの単語群が不自然に消えたり、ラベルが混乱したりしないことを確認。
4. 約3秒後にLLMの分析結果が表示され、その際も他のセクション（Top Frequent Entities等）が正しく残っていることを確認。
