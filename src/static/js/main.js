document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const resultsList = document.getElementById('resultsList');
    const resultCount = document.getElementById('resultCount');
    const topWordsList = document.getElementById('topWordsList');
    const highlightsList = document.getElementById('highlightsList');
    const highlightPopup = document.getElementById('highlightPopup');

    const historyToggle = document.getElementById('historyToggle');
    const historyPanel = document.getElementById('historyPanel');
    const historyList = document.getElementById('historyList');
    const historyBadge = document.getElementById('historyBadge');
    const historyLoadMore = document.getElementById('historyLoadMore');

    let chartInstance = null;
    let selectedTextInfo = null; // { text, element }
    let historyOffset = 0;
    const historyLimit = 20;

    // message_id -> [text1, text2, ...] のマップ（DB上の保存済みハイライトをキャッシュする）
    let highlightMap = {};

    // 初期ロード時に全体の傾向を取得
    fetchAnalysis();
    fetchRecentHighlights();
    fetchHistory(); // 履歴の初期取得

    // --- 統計データ/共起語タグからのドリルダウン検索 (Event Delegation) ---
    document.addEventListener('click', (e) => {
        const tag = e.target.closest('.word-tag');
        const snippet = e.target.closest('.usage-snippet');

        if (tag) {
            // タグ内のテキスト（単語部分のみ）を取得
            // .word-countの内容を除去したクリーンな単語を取得する
            let word = "";
            const nodes = tag.childNodes;
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].nodeType === Node.TEXT_NODE) {
                    word += nodes[i].textContent.trim();
                } else if (!nodes[i].classList.contains('word-count')) {
                    // count以外の要素があればそのテキストも（念のため）
                    word += nodes[i].innerText.trim();
                }
            }
            if (word) {
                searchInput.value = word;
                performSearch();
            }
            return;
        }

        if (snippet) {
            const msgId = snippet.dataset.msgid;
            const convId = snippet.dataset.convid;
            const query = searchInput.value.trim();

            // 1. まず中央のタイムラインにあるか探す
            const targetCard = document.querySelector(`.message-card[data-msgid="${msgId}"]`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetCard.style.outline = "2px solid #a371f7";
                setTimeout(() => { targetCard.style.outline = "none"; }, 2000);
            } else {
                // 2. なければスレッドモーダルを開く
                openThreadModal(convId, msgId, query);
            }
            return;
        }

        // --- Semantic Intelligence の根拠スニペットのクリックでスレッドモーダルへジャンプ ---
        const evidenceItem = e.target.closest('.sem-evidence-item');
        if (evidenceItem) {
            const msgId = evidenceItem.dataset.msgid;
            const convId = evidenceItem.dataset.convid;
            const query = searchInput.value.trim();
            openThreadModal(convId, msgId, query);
            return;
        }

        // --- Semantic Intelligence のキーワードクリックでドリルダウン検索 ---
        const kwEl = e.target.closest('.llm-keyword');
        if (kwEl) {
            const kw = kwEl.dataset.kw;
            if (kw) {
                searchInput.value = kw;
                performSearch();
            }
            return;
        }
    });

    // 検索イベント
    const performSearch = () => {
        const query = searchInput.value.trim();
        if (query) {
            fetchSearch(query);
            fetchContext(query);
            fetchSemanticContext(query);
            fetchAnalysis(query);
            fetchRecentHighlights();
        } else {
            // クエリが空なら初期状態に
            resultsList.innerHTML = `<div class="empty-state"><p>Search for keywords to explore your past thoughts.</p></div>`;
            document.getElementById('coOccurringWords').innerHTML = `<div class="empty-state" style="font-size:0.8rem;">Search to see context network.</div>`;
            document.getElementById('snippetsList').innerHTML = '';
            resultCount.textContent = "0 found";
            fetchAnalysis();
            fetchRecentHighlights();
        }
    };

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // ソートボタンの切り替え制御
    const sortHistoryBtn = document.getElementById('sortHistoryBtn');
    if (sortHistoryBtn) {
        sortHistoryBtn.addEventListener('click', (e) => {
            const currentSort = sortHistoryBtn.dataset.sort;
            const newSort = currentSort === 'desc' ? 'asc' : 'desc';

            sortHistoryBtn.dataset.sort = newSort;
            sortHistoryBtn.innerHTML = newSort === 'desc' ? '🔽 最新順' : '🔼 古い順';

            fetchHistory(false); // ソート変更時は最初から読み直し
        });
    }

    // 更新ボタンの制御
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', (e) => {
            fetchHistory(false);
        });
    }

    // History Load More
    historyLoadMore.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchHistory(true);
    });

    async function fetchSearch(query) {
        const searchMode = document.querySelector('input[name="searchMode"]:checked').value;
        const apiEndpoint = searchMode === 'semantic' ? '/api/semantic_search' : '/api/search';

        resultsList.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
        try {
            const res = await fetch(`${apiEndpoint}?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (data.error) {
                console.error("Search Error:", data.error);
                resultsList.innerHTML = `<div class="empty-state"><p style="color:#f85149;">${escapeHTML(data.error)}</p></div>`;
                return;
            }

            resultCount.textContent = `${data.count} found`;

            if (data.results && data.results.length > 0) {
                // Determine search words to highlight
                const termsToHighlight = data.query ? data.query.split(' ').map(t => t.replace(/["']/g, '')) : [];

                resultsList.innerHTML = data.results.map(msg => {
                    const date = new Date(msg.create_time * 1000).toLocaleString();
                    let escapedContent = escapeHTML(msg.content);

                    // ---------------------------------------------------
                    // 1) 条件分岐による動的ハイライト処理（キーワード/セマンティック）
                    // ---------------------------------------------------
                    let contentStyle = '';
                    let badgeHtml = '';

                    if (searchMode === 'lexical') {
                        termsToHighlight.forEach(term => {
                            if (term.length > 0) {
                                const regex = new RegExp(`(${escapeHTML(term)})`, 'gi');
                                escapedContent = escapedContent.replace(regex, '<span class="highlight-match">$1</span>');
                            }
                        });
                    } else {
                        if (msg.contains_keyword) {
                            badgeHtml = '<span class="result-badge badge-exact">✓ キーワード含む</span>';
                            const regex = new RegExp(`(${escapeHTML(query)})`, 'gi');
                            escapedContent = escapedContent.replace(regex, '<span class="highlight-match">$1</span>');
                        } else {
                            badgeHtml = '<span class="result-badge badge-semantic">〜 意味的に近い</span>';
                            contentStyle = 'background: rgba(138, 43, 226, 0.06); border-radius: 4px; padding: 6px; border-left: 2px solid rgba(138,43,226,0.4);';
                        }
                    }

                    // ---------------------------------------------------
                    // 2) DB保存済みハイライトをカードにも再適用（永続表示）
                    // ---------------------------------------------------
                    const savedTexts = highlightMap[msg.id] || [];
                    savedTexts.forEach(savedText => {
                        if (savedText.length < 3) return;
                        const escapedSaved = escapeHTML(savedText);
                        const safePattern = escapedSaved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(${safePattern})`, 'g');
                        escapedContent = escapedContent.replace(regex, '<span class="highlighted-text">$1</span>');
                    });

                    return `
                        <div class="message-card" data-msgid="${msg.id}" data-convid="${msg.conversation_id}">
                            <div class="message-header">
                                <span class="role ${msg.author_role}">${msg.author_role.toUpperCase()}</span>
                                <span class="date">${date} ${msg.score ? `(Score: ${msg.score})` : ''}</span>
                            </div>
                            <div class="message-title" style="font-size:0.8rem; color:#848d97; margin-bottom: 0.5rem;">
                                Chat: ${msg.title || 'Unknown Doc'}
                                ${badgeHtml}
                            </div>
                            <div class="message-content collapsed" style="${contentStyle}">${escapedContent}</div>
                        </div>
                    `;
                }).join('');
            } else {
                resultsList.innerHTML = `<div class="empty-state"><p>No results found for "${query}"</p></div>`;
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchHistory(append = false) {
        const sortBtn = document.getElementById('sortHistoryBtn');
        const sortOrder = sortBtn ? sortBtn.dataset.sort : 'desc';

        if (!append) {
            historyOffset = 0;
            historyList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">Loading...</div>';
        }

        try {
            const res = await fetch(`/api/conversations?limit=${historyLimit}&offset=${historyOffset}&sort=${sortOrder}`);
            const data = await res.json();

            if (data.error) {
                console.error("History Error:", data.error);
                return;
            }

            const results = data.results || [];

            if (results.length > 0) {
                const html = results.map(conv => {
                    const d = new Date(conv.create_time * 1000);
                    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    return `
                        <div class="history-item" data-convid="${conv.id}" style="padding: 10px; border-radius: 6px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.03); display: flex; flex-direction: column; transition: background 0.2s;">
                            <div style="font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); margin-bottom: 4px;">
                                ${escapeHTML(conv.title || "Untitled Chat")}
                            </div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                                <span>${dateStr}</span>
                                <span>💬 ${conv.message_count}</span>
                            </div>
                        </div>
                    `;
                }).join('');

                if (append) {
                    historyList.insertAdjacentHTML('beforeend', html);
                } else {
                    historyList.innerHTML = html;
                }

                historyOffset += results.length;
                historyBadge.textContent = historyOffset;

                historyLoadMore.style.display = results.length === historyLimit ? 'block' : 'none';
            } else if (!append) {
                historyList.innerHTML = '<div class="empty-state" style="font-size: 0.75rem;">No history found.</div>';
                historyBadge.textContent = '0';
                historyLoadMore.style.display = 'none';
            }
        } catch (e) {
            console.error("Fetch History Error:", e);
            if (!append) {
                historyList.innerHTML = '<div style="padding:10px; color:#ff7b72; font-size:0.85rem;">履歴の取得に失敗しました</div>';
            }
        }
    }

    async function fetchAnalysis(query = "") {
        try {
            const url = query ? `/api/analyze?q=${encodeURIComponent(query)}` : `/api/analyze`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.error) {
                console.error("Analyzer Error:", data.error);
                return;
            }

            const topWords = data.top_words || [];

            // Render Tags
            topWordsList.innerHTML = topWords.map(t =>
                `<li class="word-tag">${escapeHTML(t.word)} <span class="word-count">${t.count}</span></li>`
            ).join('');

            // Render Chart
            renderChart(topWords);

        } catch (e) {
            console.error(e);
        }
    }

    async function fetchContext(query) {
        try {
            const coOccurringWords = document.getElementById('coOccurringWords');
            const snippetsList = document.getElementById('snippetsList');

            // 以前の結果を即座に消さず、読み込み中であることを視覚的に示す（不透明度調整）
            coOccurringWords.style.opacity = '0.5';
            // snippetsList は件数が多いためクリアして Loading 表示
            snippetsList.innerHTML = '<div style="text-align:center; padding:10px; color:#848d97; font-size:0.8rem;">Loading related snippets...</div>';

            const res = await fetch(`/api/context?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            coOccurringWords.style.opacity = '1';

            if (data.error) {
                coOccurringWords.innerHTML = '';
                return;
            }

            if (data.co_occurring_words) {
                coOccurringWords.innerHTML = data.co_occurring_words.map(t =>
                    `<span class="word-tag" style="font-size:0.8rem; background: rgba(138,43,226,0.15); color: #c9a0f5;">${escapeHTML(t.word)} <span class="word-count">${t.count}</span></span>`
                ).join('');
            }

            if (data.snippets) {
                // Determine search words to highlight
                const termsToHighlight = data.query ? data.query.split(' ').map(t => t.replace(/["']/g, '')) : [];

                snippetsList.innerHTML = data.snippets.map(s => {
                    let escapedContent = escapeHTML(s.snippet);
                    // Highlight logic
                    termsToHighlight.forEach(term => {
                        if (term.length > 0) {
                            const escapedTerm = escapeHTML(term);
                            const regex = new RegExp(`(${escapedTerm})`, "gi");
                            escapedContent = escapedContent.replace(regex, `<span class="highlight-match">$1</span>`);
                        }
                    });

                    const dateStr = new Date(s.date * 1000).toLocaleDateString();

                    return `
                        <div class="usage-snippet" data-msgid="${s.message_id}" data-convid="${s.conversation_id}" 
                             style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 0.82rem; border-left: 3px solid #8a2be2; cursor: pointer; transition: background 0.2s;">
                            <div style="display: flex; justify-content: space-between; color: #848d97; font-size: 0.7rem; margin-bottom: 4px;">
                                <span>${escapeHTML(s.title || 'Untitled')}</span>
                                <span style="font-family: monospace;">${dateStr}</span>
                            </div>
                            <div style="color: #c9d1d9; line-height: 1.4;">${escapedContent}</div>
                        </div>
                    `;
                }).join('');
            }
        } catch (e) { console.error(e); }
    }

    async function fetchSemanticContext(query) {
        const llmAnalysisContent = document.getElementById('llmAnalysisContent');

        // ローディング中はステータスメッセージを先頭に表示し、既存内容を薄くする
        const statusEl = document.createElement('div');
        statusEl.id = 'llmStatus';
        statusEl.innerHTML = '<span style="color:#a371f7; font-size: 0.8rem; font-weight:600;">🤖 LLM analyzing semantic context...</span>';
        statusEl.style.marginBottom = '10px';
        const oldStatus = document.getElementById('llmStatus');
        if (oldStatus) oldStatus.remove();
        llmAnalysisContent.style.opacity = '0.5';
        llmAnalysisContent.prepend(statusEl);

        try {
            const res = await fetch(`/api/semantic_context?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            llmAnalysisContent.style.opacity = '1';
            const currentStatus = document.getElementById('llmStatus');
            if (currentStatus) currentStatus.remove();

            if (data.error) {
                llmAnalysisContent.innerHTML = `<span style="color:#f85149; font-size:0.8rem;">${escapeHTML(data.error)}</span>`;
                return;
            }

            const analysis = data.analysis || {};
            const snippets = data.snippets || [];

            // --- ヘルパー: テキストをキーワードスパンでラップする ---
            // セグメントに分割し、5文字以上の語句を .llm-keyword でラップ
            function wrapKeywords(text) {
                if (!text) return '';
                // 「、」「。」「・」「（」「）」「「」「」」「 」「/」で区切る
                return escapeHTML(text).replace(/([^、。・（）「」\s\/]{5,})/g, (match) => {
                    // ひらがなのみはスキップ（意味的でない語を排除）
                    if (/^[\u3041-\u3096]+$/.test(match)) return match;
                    return `<span class="llm-keyword" data-kw="${match}">${match}</span>`;
                });
            }

            // --- ヘルパー: セクション用コピーボタンHTML ---
            function copyBtnHtml(label) {
                return `<button class="sem-copy-btn" data-copy-label="${escapeHTML(label)}">📋</button>`;
            }

            let analysisHtml = '';

            if (analysis.error) {
                analysisHtml = `<div style="color:#f85149; font-size:0.8rem;">${escapeHTML(analysis.error)}</div>`;
            } else {
                // 全体コピーボタン
                analysisHtml += `
                    <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                        <button id="semCopyAll" style="background:rgba(88,166,255,0.1); border:1px solid rgba(88,166,255,0.3); color:var(--accent); border-radius:6px; padding:3px 10px; font-size:0.72rem; cursor:pointer; transition:0.2s;">
                            📋 全体コピー
                        </button>
                    </div>`;

                if (analysis.overall_context) {
                    analysisHtml += `
                        <div class="sem-section" style="border-left-color: rgba(88,166,255,0.4);" data-section-text="${escapeHTML(analysis.overall_context)}">
                            ${copyBtnHtml('Overall Context')}
                            <div style="font-size:0.7rem; font-weight:600; color:#58a6ff; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">📌 Overall Context</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.6;">${wrapKeywords(analysis.overall_context)}</div>
                        </div>`;
                }
                if (analysis.dichotomy_and_relations) {
                    analysisHtml += `
                        <div class="sem-section" style="border-left-color: rgba(163,113,247,0.4);" data-section-text="${escapeHTML(analysis.dichotomy_and_relations)}">
                            ${copyBtnHtml('Dichotomy & Relations')}
                            <div style="font-size:0.7rem; font-weight:600; color:#a371f7; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">⚡ Dichotomy & Relations</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.6;">${wrapKeywords(analysis.dichotomy_and_relations)}</div>
                        </div>`;
                }
                if (analysis.new_definitions) {
                    analysisHtml += `
                        <div class="sem-section" style="border-left-color: rgba(63,185,80,0.4);" data-section-text="${escapeHTML(analysis.new_definitions)}">
                            ${copyBtnHtml('New Definitions')}
                            <div style="font-size:0.7rem; font-weight:600; color:#3fb950; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">🔬 New Definitions</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.6;">${wrapKeywords(analysis.new_definitions)}</div>
                        </div>`;
                }

                // --- 根拠スニペット（Evidence Source）---
                if (snippets.length > 0) {
                    analysisHtml += `
                        <div style="margin-top:14px; border-top:1px solid var(--panel-border); padding-top:10px;">
                            <div style="font-size:0.7rem; font-weight:600; color:#848d97; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">
                                📚 根拠（Evidence Source）<span style="font-weight:normal; font-size:0.65rem; margin-left:6px;">${snippets.length}件の会話から生成</span>
                            </div>
                            ${snippets.map(s => {
                                const dateStr = new Date(s.date * 1000).toLocaleDateString();
                                return `
                                <div class="sem-evidence-item" data-msgid="${s.message_id}" data-convid="${s.conversation_id}">
                                    <div style="display:flex; justify-content:space-between; color:#848d97; font-size:0.68rem; margin-bottom:3px;">
                                        <span>${escapeHTML(s.title || 'Untitled')}</span>
                                        <span style="font-family:monospace;">${dateStr}</span>
                                    </div>
                                    <div style="color:#8b949e; line-height:1.4; font-size:0.75rem;">${escapeHTML(s.snippet)}</div>
                                </div>`;
                            }).join('')}
                        </div>`;
                }
            }

            llmAnalysisContent.innerHTML = analysisHtml || '<span style="color:#848d97; font-size:0.8rem;">No semantic analysis available.</span>';

            // --- 全体コピーボタンのイベント ---
            const copyAllBtn = document.getElementById('semCopyAll');
            if (copyAllBtn) {
                copyAllBtn.addEventListener('click', async () => {
                    const parts = [];
                    if (analysis.overall_context) parts.push(`## 📌 Overall Context\n${analysis.overall_context}`);
                    if (analysis.dichotomy_and_relations) parts.push(`## ⚡ Dichotomy & Relations\n${analysis.dichotomy_and_relations}`);
                    if (analysis.new_definitions) parts.push(`## 🔬 New Definitions\n${analysis.new_definitions}`);
                    const md = `# Semantic Intelligence: ${escapeHTML(query)}\n\n` + parts.join('\n\n---\n\n') + `\n\n*Generated by Cognitive Knowledge Engine*`;
                    try {
                        await navigator.clipboard.writeText(md);
                        copyAllBtn.textContent = '✅ コピー済';
                        setTimeout(() => { copyAllBtn.textContent = '📋 全体コピー'; }, 2000);
                    } catch(e) { console.error(e); }
                });
            }

            // --- 個別セクションコピーボタンのイベント ---
            llmAnalysisContent.querySelectorAll('.sem-copy-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const section = btn.closest('.sem-section');
                    const text = section ? section.dataset.sectionText : '';
                    if (!text) return;
                    try {
                        await navigator.clipboard.writeText(text);
                        btn.textContent = '✅';
                        setTimeout(() => { btn.textContent = '📋'; }, 1800);
                    } catch(e) { console.error(e); }
                });
            });

        } catch(e) {
            llmAnalysisContent.innerHTML = `<span style="color:#f85149; font-size:0.8rem;">Error loading semantic context.</span>`;
            console.error(e);
        }
    }

    function renderChart(topWords) {
        const ctx = document.getElementById('keywordChart').getContext('2d');
        const labels = topWords.slice(0, 10).map(t => t.word);
        const counts = topWords.slice(0, 10).map(t => t.count);

        if (chartInstance) {
            chartInstance.destroy();
        }

                    chartInstance = new Chart(ctx, {
                        type: 'polarArea',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Frequency',
                                data: counts,
                                backgroundColor: [
                                    'rgba(88, 166, 255, 0.6)',
                                    'rgba(138, 43, 226, 0.6)',
                                    'rgba(63, 185, 80, 0.6)',
                                    'rgba(240, 136, 62, 0.6)',
                                    'rgba(248, 81, 73, 0.6)',
                                    'rgba(163, 113, 247, 0.6)',
                                    'rgba(47, 129, 247, 0.6)',
                                    'rgba(210, 153, 34, 0.6)',
                                    'rgba(46, 160, 67, 0.6)',
                                    'rgba(255, 123, 114, 0.6)'
                                ],
                                borderColor: 'rgba(22, 27, 34, 1)',
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                r: {
                                    ticks: { display: false },
                                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                                }
                            },
                            plugins: {
                                legend: {
                                    position: 'right',
                                    labels: { color: '#848d97', font: { family: "'Outfit', sans-serif" } }
                                }
                            },
                            // 3.3. 統計データからのドリルダウン検索
                            onClick: (event, elements) => {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = labels[index];
                                    searchInput.value = label;
                                    performSearch();
                                }
                            }
                        }
                    });
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    //---------------------------------------------------------
    // Glasp-like Text Highlighting
    //---------------------------------------------------------
    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // Hide if nothing selected or clicked inside popup
        if (highlightPopup.contains(e.target)) return;

        if (text.length > 0) {
            // Check if selection is within a message content
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === 3 ? container.parentElement : container;
            // 分析エリア（#localContextAnalysisArea）もハイライト対象として許可
            const messageContainer = element.closest('.message-card') || element.closest('.message-skeleton') || element.closest('#localContextAnalysisArea');

            if (messageContainer) {
                const rect = range.getBoundingClientRect();

                // Viewport基準の絶対座標計算
                let popX = rect.left + (rect.width / 2) - 40;
                let popY = rect.top - 40;

                // 画面上部を突き抜ける場合の安全装置（テキストの下へ配置）
                if (popY < 10) {
                    popY = rect.bottom + 10;
                }

                // 強制的なFixed配置と最前面Z-index
                highlightPopup.style.position = 'fixed';
                highlightPopup.style.left = `${popX}px`;
                highlightPopup.style.top = `${popY}px`;
                highlightPopup.style.zIndex = '2147483647';
                highlightPopup.style.display = 'block';

                selectedTextInfo = {
                    text: text,
                    element: element,
                    msgId: messageContainer.dataset.msgid || null,
                    convId: messageContainer.dataset.convid || null,
                    range: range
                };

                // デバッグ用: IDが欠落している場合は警告
                if (!selectedTextInfo.msgId || !selectedTextInfo.convId) {
                    console.warn("Highlight selection detected but IDs are missing:", selectedTextInfo);
                }
                return;
            }
        }
        highlightPopup.style.display = 'none';
        selectedTextInfo = null;
    });

    highlightPopup.addEventListener('click', async () => {
        if (!selectedTextInfo) return;

        const savedInfo = { ...selectedTextInfo }; // クロージャ汚染防止のためコピー

        // DOM上への即時視覚フィードバック（同一ノード内のみ安全に実行）
        try {
            const span = document.createElement('span');
            span.className = 'highlighted-text';
            savedInfo.range.surroundContents(span);
        } catch(e) { /* 複数ノードにまたがる選択時は無視 */ }

        // ポップアップを「保存中...」表示に切替
        highlightPopup.textContent = '💾 保存中...';
        highlightPopup.style.pointerEvents = 'none';
        selectedTextInfo = null;

        try {
            // IDが無効な場合は保存を中断
            if (!savedInfo.msgId || !savedInfo.convId || savedInfo.convId === 'undefined') {
                highlightPopup.textContent = '❌ エラー: スレッド情報なし';
                setTimeout(() => {
                    highlightPopup.style.display = 'none';
                    highlightPopup.textContent = '🌟 ハイライトとして保存';
                    highlightPopup.style.pointerEvents = 'auto';
                }, 2000);
                return;
            }

            const res = await fetch('/api/highlights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: savedInfo.msgId,
                    conversation_id: savedInfo.convId,
                    text_content: savedInfo.text
                })
            });
            const data = await res.json();

            if (data.status === 'ok') {
                // highlightMapにも即時反映（再検索前でもモーダルで参照できるよう）
                if (!highlightMap[savedInfo.msgId]) highlightMap[savedInfo.msgId] = [];
                highlightMap[savedInfo.msgId].push(savedInfo.text);

                // 完了フィードバック
                const label = data.nlp_skipped
                    ? '⚠️ 保存済(NLPスキップ)'
                    : '✅ 保存完了！';
                highlightPopup.textContent = label;
                setTimeout(() => {
                    highlightPopup.style.display = 'none';
                    highlightPopup.textContent = '🌟 ハイライトとして保存';
                    highlightPopup.style.pointerEvents = 'auto';
                }, 1800);

                fetchRecentHighlights();
            } else {
                highlightPopup.textContent = '❌ 保存失敗';
                setTimeout(() => {
                    highlightPopup.style.display = 'none';
                    highlightPopup.textContent = '🌟 ハイライトとして保存';
                    highlightPopup.style.pointerEvents = 'auto';
                }, 2000);
            }
        } catch(e) {
            console.error('Highlight save error', e);
            highlightPopup.textContent = '❌ ネットワークエラー';
            setTimeout(() => {
                highlightPopup.style.display = 'none';
                highlightPopup.textContent = '🌟 ハイライトとして保存';
                highlightPopup.style.pointerEvents = 'auto';
            }, 2000);
        }
        window.getSelection().removeAllRanges();
    });

    async function fetchRecentHighlights() {
        try {
            const res = await fetch('/api/highlights');
            const data = await res.json();
            if (data.results) {
                // --- highlightMapを再構築（DB上の全ハイライトを message_id でインデックス化）---
                highlightMap = {};
                data.results.forEach(h => {
                    if (!highlightMap[h.message_id]) highlightMap[h.message_id] = [];
                    if (h.text_content) highlightMap[h.message_id].push(h.text_content);
                });

                if (data.results.length === 0) {
                    highlightsList.innerHTML = '<div class="empty-state"><p>No highlights yet.</p></div>';
                } else {
                    highlightsList.innerHTML = data.results.map(h => {
                        let tagHtml = '';
                        if (h.nlp_tags) {
                            try {
                                const parsed = JSON.parse(h.nlp_tags);
                                const hasNlp = parsed.tags || parsed.context || parsed.intent;
                                if (hasNlp) {
                                    tagHtml = `
                                        ${parsed.tags ? `<div class="tags">🏷️ ${escapeHTML(parsed.tags)}</div>` : ''}
                                        ${parsed.context ? `<div style="font-size: 0.75rem; color: #848d97; margin-top: 5px; line-height: 1.3;">Context: ${escapeHTML(parsed.context)}</div>` : ''}
                                        ${parsed.intent ? `<div style="font-size: 0.75rem; color: #a371f7; margin-top: 2px; line-height: 1.3;">Intent: ${escapeHTML(parsed.intent)}</div>` : ''}
                                    `;
                                } else {
                                    tagHtml = `<div style="font-size:0.72rem; color:#848d97; margin-top:4px;">⚠️ NLP未解析（Ollama停止中に保存）</div>`;
                                }
                            } catch(e) {
                                tagHtml = `<div class="tags">🏷️ ${escapeHTML(h.nlp_tags)}</div>`;
                            }
                        }

                        return `
                            <div class="highlight-card" data-msgid="${h.message_id}" data-convid="${h.conversation_id}">
                                <div class="highlight-content" style="margin-bottom: 8px;">"${escapeHTML(h.text_content)}"</div>
                                ${tagHtml}
                                <div class="highlight-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                                    <button class="highlight-action-btn copy-highlight" title="Copy to clipboard">
                                        📋 Copy
                                    </button>
                                    <button class="highlight-action-btn jump-to-source" title="Open source thread">
                                        🌐 Open Thread
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (e) { console.error('Error fetching highlights', e); }
    }

    //---------------------------------------------------------
    // Thread Context Modal & Lazy Rendering
    //---------------------------------------------------------
    const threadModal = document.getElementById('threadModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalThreadTitle = document.getElementById('modalThreadTitle');
    const modalThreadMeta = document.getElementById('modalThreadMeta');
    const threadContent = document.getElementById('threadContent');
    const localContextArea = document.getElementById('localContextAnalysisArea');
    const localContextContent = document.getElementById('localContextAnalysisContent');

    let currentThreadMessages = [];
    let globalQuery = "";

    closeModalBtn.addEventListener('click', () => {
        threadModal.style.display = 'none';
        threadContent.innerHTML = '';
        localContextArea.style.display = 'none';
        localContextContent.innerHTML = '';
    });

    threadModal.addEventListener('click', (e) => {
        if(e.target === threadModal) {
            closeModalBtn.click();
        }
    });

    // Delegation for clicking message card or history item to open thread modal
    document.addEventListener('click', async (e) => {
        const historyItem = e.target.closest('.history-item');
        const card = e.target.closest('.message-card');

        if (historyItem) {
            const convid = historyItem.dataset.convid;
            const query = searchInput.value.trim();
            // 履歴からのジャンプ時は特定のメッセージをハイライトせず、スレッド全体を表示
            openThreadModal(convid, null, query);
            return;
        }

        // --- 3.4. Recent NLP Highlights: 個別エクスポート (Copy) ---
        const copyBtn = e.target.closest('.copy-highlight');
        if (copyBtn) {
            const card = copyBtn.closest('.highlight-card');
            copyHighlightToClipboard(card);
            return;
        }

        // --- 3.4. Recent NLP Highlights: コンテキスト・ドリルダウン (Open Thread) ---
        const jumpBtn = e.target.closest('.jump-to-source');
        if (jumpBtn) {
            const card = jumpBtn.closest('.highlight-card');
            const convid = card.dataset.convid;
            const msgid = card.dataset.msgid;
            const query = searchInput.value.trim();
            openThreadModal(convid, msgid, query);
            return;
        }

        if(!card) return;
        // Ignore if selecting text (for Glasp highlight)
        if(window.getSelection().toString().trim().length > 0) return;

        // Ignore if clicking highlight popup or analyze button
        if(e.target.closest('#highlightPopup') || e.target.closest('.context-analyze-btn')) return;

        const convId = card.dataset.convid;
        const msgId = card.dataset.msgid;
        const query = document.getElementById('searchInput').value.trim();
        globalQuery = query;
        if(!convId) return;

        openThreadModal(convId, msgId, query);
    });

    async function openThreadModal(convId, highlightMsgId, query) {
        if (!convId || convId === 'undefined') {
            threadModal.style.display = 'flex';
            modalThreadTitle.textContent = "Error";
            threadContent.innerHTML = `<div style="color:#ff7b72; padding: 20px; text-align: center;">
                <p>スレッドIDが無効です。このハイライトにはソーススレッド情報が紐付けられていません。</p>
                <p style="font-size: 0.7rem; color: var(--text-muted);">ID: ${convId}</p>
            </div>`;
            return;
        }

        threadModal.style.display = 'flex';
        modalThreadTitle.textContent = "Loading...";
        modalThreadMeta.textContent = "";
        threadContent.innerHTML = '<div class="empty-state">Fetching thread context from local db...</div>';
        localContextArea.style.display = 'none';
        localContextContent.innerHTML = '';
        currentThreadMessages = [];
        // triggerLocalAnalysis 内での conversation_id フォールバック用に保存
        localContextArea.dataset._openedConvId = convId;

        try {
            const res = await fetch(`/api/conversations/${convId}?highlight_id=${encodeURIComponent(highlightMsgId)}`);
            const data = await res.json();
            if(data.error) {
                threadContent.innerHTML = `<div style="color:red">Error: ${escapeHTML(data.error)}</div>`;
                return;
            }

            const meta = data.meta;
            const messages = data.messages;
            currentThreadMessages = messages;

            modalThreadTitle.textContent = meta.title || "Untitled Chat";
            modalThreadMeta.textContent = `${meta.total_messages} messages | ${new Date(meta.start_time * 1000).toLocaleString()} - ${new Date(meta.end_time * 1000).toLocaleString()}`;

            threadContent.innerHTML = '';

            // 1. Create Skeletons
            const skeletons = [];
            messages.forEach((msg, idx) => {
                const skel = document.createElement('div');
                skel.className = 'message-skeleton';
                skel.dataset.index = idx;
                skel.dataset.msgid = msg.id;
                skel.dataset.convid = convId;

                // スケルトンにプレースホルダーとしての最低高さと、圧縮防止（flex-shrink: 0）を付与
                skel.style.minHeight = '120px';
                skel.style.flexShrink = '0';
                skel.style.marginBottom = '1rem';
                skel.style.width = '100%';


                if(meta.highlight_index !== null && idx === meta.highlight_index) {
                    skel.classList.add('highlighted-anchor');
                }

                // Add analyze button
                if(meta.highlight_index !== null && idx === meta.highlight_index && query) {
                    const btn = document.createElement('button');
                    btn.className = 'context-analyze-btn';
                    btn.innerHTML = '✨ Analyze Local Context <span style="font-size:0.6rem;opacity:0.8;">(LLM)</span>';
                    btn.onclick = (e) => { e.stopPropagation(); triggerLocalAnalysis(idx, query); };
                    skel.appendChild(btn);
                }

                threadContent.appendChild(skel);
                skeletons.push(skel);
            });

            // 2. Immediate Parse & Scroll for anchor
            if(meta.highlight_index !== null && skeletons[meta.highlight_index]) {
                const anchorSkel = skeletons[meta.highlight_index];
                parseSkeleton(anchorSkel, messages[meta.highlight_index]);
                anchorSkel.dataset.parsed = "true";
                // setTimeout helps browser calculate layout before scrolling
                setTimeout(() => {
                    anchorSkel.scrollIntoView({ block: "center" });
                }, 50);
            }

            // 3. Intersection Observer (1500px margin for pre-fetching)
            const io = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if(entry.isIntersecting) {
                        const skel = entry.target;
                        const idx = parseInt(skel.dataset.index);
                        if(skel.dataset.parsed !== "true") {
                            parseSkeleton(skel, messages[idx]);
                            skel.dataset.parsed = "true";
                        }
                    }
                });
            }, {
                root: threadContent,
                rootMargin: "1500px 0px"
            });

            skeletons.forEach(skel => io.observe(skel));

        } catch(e) {
            console.error(e);
            threadContent.innerHTML = `<div style="color:red">Connection Error</div>`;
        }
    }

    function parseSkeleton(skel, msgData) {
        const btn = skel.querySelector('.context-analyze-btn');
        skel.innerHTML = '';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '0.5rem';
        header.style.fontSize = '0.8rem';
        header.style.color = 'var(--text-secondary)';

        const role = document.createElement('span');
        role.className = `role ${msgData.author_role}`;
        role.textContent = msgData.author_role;
        if(msgData.author_role === 'user') role.style.color = 'var(--accent)';
        if(msgData.author_role === 'assistant') role.style.color = '#3fb950';

        const date = document.createElement('span');
        // * 1000 を追加してミリ秒に変換
        date.textContent = new Date(msgData.create_time * 1000).toLocaleString();

        header.appendChild(role);
        header.appendChild(date);

        const content = document.createElement('div');
        content.className = 'markdown-body';
        try {
            content.innerHTML = marked.parse(msgData.content);
        } catch(e) {
            content.textContent = msgData.content;
        }

        // --- DB保存済みハイライトをモーダル内コンテンツにも再適用 ---
        const savedTexts = highlightMap[msgData.id] || [];
        if (savedTexts.length > 0) {
            let html = content.innerHTML;
            savedTexts.forEach(savedText => {
                if (savedText.length < 3) return;
                // マークダウンがレンダリングされたHTML内のテキストに対しても安全にマッチする
                const safePattern = savedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safePattern})`, 'g');
                html = html.replace(regex, '<span class="highlighted-text">$1</span>');
            });
            content.innerHTML = html;
        }

        skel.appendChild(header);
        skel.appendChild(content);
        if(btn) {
            btn.style.marginTop = '1rem';
            skel.appendChild(btn);
        }

        skel.style.border = '1px solid rgba(255,255,255,0.05)';
        if(skel.classList.contains('highlighted-anchor')) {
            skel.style.borderLeft = '4px solid #a371f7';
            skel.style.background = 'rgba(163, 113, 247, 0.05)';
        } else {
            skel.style.background = 'rgba(255, 255, 255, 0.02)';
        }
    }

    async function triggerLocalAnalysis(anchorIndex, query) {
        if(!query) return;

        const btns = threadContent.querySelectorAll('.context-analyze-btn');
        btns.forEach(b => { b.textContent = "Analyzing..."; b.disabled = true; });

        localContextArea.style.display = 'block';

        // 【設計漏れ修正】分析の起点となったメッセージのIDをエリアに埋め込む
        // anchorMsg.conversation_id が未定義の場合は openThreadModal に渡された convId をフォールバックとして使用する
        const anchorMsg = currentThreadMessages[anchorIndex];
        const resolvedConvId = anchorMsg.conversation_id || localContextArea.dataset._openedConvId || "";
        localContextArea.dataset.convid = resolvedConvId;
        localContextArea.dataset.msgid = anchorMsg.id;

        localContextContent.innerHTML = '<span style="color:var(--text-muted)">Analyzing local context via Qwen3...</span>';

        localContextContent.scrollIntoView({ behavior: 'smooth', block: 'end' });

        // Retrieve +/- 10 messages from frontend cache (stateless)
        const start = Math.max(0, anchorIndex - 10);
        const end = Math.min(currentThreadMessages.length, anchorIndex + 11);
        const slice = currentThreadMessages.slice(start, end);

        const contextText = slice.map(m => `[${m.author_role}]\n${m.content}`).join("\n\n---\n\n");

        try {
            const res = await fetch("/api/analyze_local_context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query, context_text: contextText })
            });
            const data = await res.json();
            if(data.error) {
                localContextContent.innerHTML = `<span style="color:red">Error: ${escapeHTML(data.error)}</span>`;
            } else if(data.analysis) {
                const ana = data.analysis;
                let html = "";

                const isTask = (ana._category === "task_execution");
                const badgeHtml = isTask
                    ? `<div style="margin-bottom:1rem;"><span style="padding: 2px 8px; font-size: 0.7rem; background: rgba(88, 166, 255, 0.2); color: var(--accent); border-radius: 12px; border: 1px solid var(--accent);">🛠️ Task / Prompt Execution</span></div>`
                    : `<div style="margin-bottom:1rem;"><span style="padding: 2px 8px; font-size: 0.7rem; background: rgba(163, 113, 247, 0.2); color: #a371f7; border-radius: 12px; border: 1px solid #a371f7;">🧠 Conceptual Exploration</span></div>`;
                html += badgeHtml;

                if (isTask) {
                    if(ana.execution_purpose && Array.isArray(ana.execution_purpose)) {
                        html += `<div><strong style="color:var(--text-primary)">1. 実行目的と制約 (Execution Purpose):</strong><ul style="margin-top:0.2rem">`;
                        ana.execution_purpose.forEach(p => html += `<li>${escapeHTML(p)}</li>`);
                        html += `</ul></div>`;
                    }
                    if(ana.structural_approach && Array.isArray(ana.structural_approach)) {
                        html += `<div style="margin-top:0.8rem"><strong style="color:var(--text-primary)">2. 構造的アプローチ (Structural Approach):</strong><ul style="margin-top:0.2rem">`;
                        ana.structural_approach.forEach(p => html += `<li>${escapeHTML(p)}</li>`);
                        html += `</ul></div>`;
                    }
                    if(ana.improvement_opportunities) {
                        html += `<div style="margin-top:0.8rem"><strong style="color:var(--text-primary)">3. 改善の余地 (Improvement Opportunities):</strong><p style="margin-top:0.2rem">${escapeHTML(ana.improvement_opportunities)}</p></div>`;
                    }
                } else {
                    if(ana.implicit_premises && Array.isArray(ana.implicit_premises)) {
                        html += `<div><strong style="color:var(--text-primary)">1. 暗黙の前提 (Implicit Premises):</strong><ul style="margin-top:0.2rem">`;
                        ana.implicit_premises.forEach(p => html += `<li>${escapeHTML(p)}</li>`);
                        html += `</ul></div>`;
                    }
                    if(ana.binary_oppositions && Array.isArray(ana.binary_oppositions)) {
                        html += `<div style="margin-top:0.8rem"><strong style="color:var(--text-primary)">2. 概念の二項対立 (Binary Oppositions):</strong><ul style="margin-top:0.2rem">`;
                        ana.binary_oppositions.forEach(p => html += `<li>${escapeHTML(p)}</li>`);
                        html += `</ul></div>`;
                    }
                    if(ana.emergent_concepts) {
                        html += `<div style="margin-top:0.8rem"><strong style="color:var(--text-primary)">3. 新しい定義と展望 (Emergent Concepts):</strong><p style="margin-top:0.2rem">${escapeHTML(ana.emergent_concepts)}</p></div>`;
                    }
                }

                localContextContent.innerHTML = html;
            }
        } catch(e) {
            console.error(e);
            localContextContent.innerHTML = `<span style="color:red">Network Error</span>`;
        } finally {
            btns.forEach(b => { b.innerHTML = '✨ Re-analyze Local Context <span style="font-size:0.6rem;opacity:0.8;">(LLM)</span>'; b.disabled = false; });
        }
    }

    // ==========================================
    // 3.2. Markdownエクスポート機能（統合・最適化版）
    // ==========================================

    // メモリ上の配列からMarkdown文字列を生成
    function generateMarkdownFromThread() {
        if (!currentThreadMessages || currentThreadMessages.length === 0) return "";

        const titleEl = document.getElementById('modalThreadTitle');
        const metaEl = document.getElementById('modalThreadMeta');
        const title = (titleEl ? titleEl.textContent : "Untitled Thread") || "Untitled Thread";
        const meta = (metaEl ? metaEl.textContent : "") || "";
        const exportDate = new Date().toLocaleString();

        let md = `# ${title}\n\n`;
        md += `Exported from Cognitive Knowledge Engine | Exported: ${exportDate}\n`;
        if (meta) md += `> ${meta}\n`;
        md += `\n---\n\n`;

        currentThreadMessages.forEach(msg => {
            // ロールを大文字に (USER / ASSISTANT)
            const role = msg.author_role.toUpperCase();
            const dateStr = new Date(msg.create_time * 1000).toLocaleString();

            md += `### ${role} (${dateStr})\n\n`;
            md += `${msg.content}\n\n`;
            md += `---\n\n`;
        });

        md += "\n*Generated by Cognitive Knowledge Engine*\n";
        return md;
    }

    // 📋 クリップボードへコピー
    const exportCopyBtn = document.getElementById('exportCopyBtn');
    if (exportCopyBtn) {
        exportCopyBtn.addEventListener('click', async (e) => {
            // ★修正: awaitの前にボタンのDOM参照を安全に確保しておく
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;

            const md = generateMarkdownFromThread();
            if (!md) {
                alert("エクスポートするデータがありません。");
                return;
            }

            try {
                // クリップボード書き込み
                await navigator.clipboard.writeText(md);

                // UIの成功フィードバック
                btn.innerHTML = '✅ Copied!';
                btn.style.color = '#7ee787';
                btn.style.borderColor = '#7ee787';

                // 2秒後に元の見た目に戻す
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.style.color = '#3fb950';
                    btn.style.borderColor = 'rgba(63, 185, 80, 0.3)';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                alert('クリップボードへのアクセスがブラウザに拒否されたか、エラーが発生しました。');
            }
        });
    }

    // 📥 .md ファイルとしてダウンロード
    const exportDownloadBtn = document.getElementById('exportDownloadBtn');
    if (exportDownloadBtn) {
        exportDownloadBtn.addEventListener('click', () => {
            try {
                const md = generateMarkdownFromThread();
                if (!md) {
                    alert("エクスポートするデータがありません。");
                    return;
                }

                // ファイル名のサニタイズ
                const titleEl = document.getElementById('modalThreadTitle');
                const rawTitle = (titleEl ? titleEl.textContent : "Thread") || "Thread";
                const safeTitle = rawTitle.replace(/[\\/:*?"<>| ]/g, '_');

                // ★修正: サイレントクラッシュを防ぐ安全なID抽出
                let convId = "export";
                if (typeof currentThreadMessages !== 'undefined' && currentThreadMessages && currentThreadMessages.length > 0) {
                    const rawId = currentThreadMessages[0].conversation_id;
                    if (rawId) {
                        convId = String(rawId).substring(0, 8);
                    }
                }
                const filename = `${safeTitle}_${convId}.md`;

                // Blobを利用してブラウザ内でファイルを動的生成
                const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);

                // 仮想リンクによるダウンロード発火
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();

                // メモリのクリーンアップ
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('Download error: ', err);
                alert('ファイルの生成中にエラーが発生しました。\n' + err.message);
            }
        });
    }

    // 3.4. ハイライト個別のコピー機能
    async function copyHighlightToClipboard(card) {
        const content = card.querySelector('.highlight-content').textContent.replace(/^"|"$/g, '');
        const tags = card.querySelector('.tags') ? card.querySelector('.tags').textContent : '';
        const metaDivs = card.querySelectorAll('div[style*="font-size: 0.75rem"]');
        let context = '';
        let intent = '';

        metaDivs.forEach(div => {
            if (div.textContent.startsWith('Context:')) context = div.textContent;
            if (div.textContent.startsWith('Intent:')) intent = div.textContent;
        });

        const copyBtn = card.querySelector('.copy-highlight');
        const originalText = copyBtn.innerHTML;

        let md = `> ${content}\n\n`;
        if (tags) md += `- ${tags}\n`;
        if (context) md += `- ${context}\n`;
        if (intent) md += `- ${intent}\n`;
        md += `\n*Source: Cognitive Knowledge Engine*`;

        try {
            await navigator.clipboard.writeText(md);
            copyBtn.innerHTML = '✅ Copied!';
            copyBtn.style.color = '#7ee787';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy highlight:', err);
        }
    }
});
