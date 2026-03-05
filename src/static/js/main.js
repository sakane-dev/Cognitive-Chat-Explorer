document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const resultsList = document.getElementById('resultsList');
    const resultCount = document.getElementById('resultCount');
    const topWordsList = document.getElementById('topWordsList');
    const highlightsList = document.getElementById('highlightsList');
    const highlightPopup = document.getElementById('highlightPopup');

    let chartInstance = null;
    let selectedTextInfo = null; // { text, element }

    // 初期ロード時に全体の傾向を取得
    fetchAnalysis();
    fetchRecentHighlights();

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
                    // 条件分岐による動的ハイライト処理
                    // ---------------------------------------------------
                    let contentStyle = '';
                    let badgeHtml = '';

                    if (searchMode === 'lexical') {
                        // === Keyword (FTS5) モード ===
                        // 語彙的に一致する語を正規表現でオレンジ強調
                        termsToHighlight.forEach(term => {
                            if (term.length > 0) {
                                const regex = new RegExp(`(${escapeHTML(term)})`, 'gi');
                                escapedContent = escapedContent.replace(regex, '<span class="highlight-match">$1</span>');
                            }
                        });

                    } else {
                        // === Semantic Vector モード ===
                        if (msg.contains_keyword) {
                            // 完全一致バッジ + オレンジハイライト
                            badgeHtml = '<span class="result-badge badge-exact">✓ キーワード含む</span>';
                            const regex = new RegExp(`(${escapeHTML(query)})`, 'gi');
                            escapedContent = escapedContent.replace(regex, '<span class="highlight-match">$1</span>');
                        } else {
                            // 意味的近傍バッジ + 文章全体のアンビエント強調
                            // 特定単語への依存なく「コンテキスト全体を提示」するUI
                            badgeHtml = '<span class="result-badge badge-semantic">〜 意味的に近い</span>';
                            contentStyle = 'background: rgba(138, 43, 226, 0.06); border-radius: 4px; padding: 6px; border-left: 2px solid rgba(138,43,226,0.4);';
                        }
                    }

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

                // Add click event to expand/collapse content on cards
                document.querySelectorAll('.message-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        // Ignore if selecting text to avoid toggling when highlighting
                        if (window.getSelection().toString().trim().length > 0) return;

                        const content = card.querySelector('.message-content');
                        if (content) {
                            content.classList.toggle('collapsed');
                            content.classList.toggle('expanded');
                        }
                    });
                });
            } else {
                resultsList.innerHTML = `<div class="empty-state"><p>No results found for "${query}"</p></div>`;
            }
        } catch (e) {
            console.error(e);
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
            coOccurringWords.innerHTML = 'Loading context...';
            snippetsList.innerHTML = '';

            const res = await fetch(`/api/context?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (data.error) return;

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

                    return `
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem; border-left: 3px solid #8a2be2;">
                            <div style="color: #848d97; font-size: 0.75rem; margin-bottom: 4px;">${escapeHTML(s.title || 'Unknown Doc')}</div>
                            <div style="color: #c9d1d9;">${escapedContent}</div>
                        </div>
                    `;
                }).join('');
            }
        } catch (e) { console.error(e); }
    }

    async function fetchSemanticContext(query) {
        // proto.pyベースの /api/semantic_context を呼び出し、LLMによるメタ分析結果を右ペインに表示する
        const coOccurringWords = document.getElementById('coOccurringWords');
        // LLMが分析中であることをコンテキストエリアに表示
        coOccurringWords.innerHTML = '<span style="color:#848d97; font-size: 0.8rem;">🤖 LLM analyzing semantic context...</span>';

        try {
            const res = await fetch(`/api/semantic_context?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (data.error) {
                coOccurringWords.innerHTML = `<span style="color:#f85149; font-size:0.8rem;">${escapeHTML(data.error)}</span>`;
                return;
            }

            const analysis = data.analysis || {};

            let analysisHtml = '';

            if (analysis.error) {
                analysisHtml = `<div style="color:#f85149; font-size:0.8rem;">${escapeHTML(analysis.error)}</div>`;
            } else {
                if (analysis.overall_context) {
                    analysisHtml += `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size:0.7rem; font-weight:600; color: #58a6ff; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">📌 Overall Context</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.5;">${escapeHTML(analysis.overall_context)}</div>
                        </div>`;
                }
                if (analysis.dichotomy_and_relations) {
                    analysisHtml += `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size:0.7rem; font-weight:600; color:#a371f7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">⚡ Dichotomy & Relations</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.5;">${escapeHTML(analysis.dichotomy_and_relations)}</div>
                        </div>`;
                }
                if (analysis.new_definitions) {
                    analysisHtml += `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size:0.7rem; font-weight:600; color:#3fb950; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">🔬 New Definitions</div>
                            <div style="font-size:0.82rem; color:#c9d1d9; line-height:1.5;">${escapeHTML(analysis.new_definitions)}</div>
                        </div>`;
                }
            }

            coOccurringWords.innerHTML = analysisHtml || '<span style="color:#848d97; font-size:0.8rem;">No semantic analysis available.</span>';

        } catch(e) {
            coOccurringWords.innerHTML = `<span style="color:#f85149; font-size:0.8rem;">Error loading semantic context.</span>`;
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
            const messageCard = element.closest('.message-card');

            if (messageCard) {
                // Determine position
                const rect = range.getBoundingClientRect();
                highlightPopup.style.left = `${rect.left + window.scrollX + (rect.width/2) - 40}px`;
                highlightPopup.style.top = `${rect.top + window.scrollY - 30}px`;
                highlightPopup.style.display = 'block';

                selectedTextInfo = {
                    text: text,
                    element: element,
                    msgId: messageCard.dataset.msgid,
                    convId: messageCard.dataset.convid,
                    range: range
                };
                return;
            }
        }
        highlightPopup.style.display = 'none';
        selectedTextInfo = null;
    });

    highlightPopup.addEventListener('click', async () => {
        if (!selectedTextInfo) return;

        // Optional: Highlight visually in DOM (simple wrapping)
        try {
            const span = document.createElement('span');
            span.className = 'highlighted-text';
            selectedTextInfo.range.surroundContents(span);
        } catch(e) { /* Ignore wrapping errors across nodes */ }

        highlightPopup.style.display = 'none';

        // Notify Backend
        try {
            const res = await fetch('/api/highlights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: selectedTextInfo.msgId,
                    conversation_id: selectedTextInfo.convId,
                    text_content: selectedTextInfo.text
                })
            });
            const data = await res.json();
            if(data.status === 'ok') {
                fetchRecentHighlights();
            }
        } catch(e) {
            console.error('Highlight save error', e);
        }
        window.getSelection().removeAllRanges();
    });

    async function fetchRecentHighlights() {
        try {
            const res = await fetch('/api/highlights');
            const data = await res.json();
            if (data.results) {
                if (data.results.length === 0) {
                    highlightsList.innerHTML = '<div class="empty-state"><p>No highlights yet.</p></div>';
                } else {
                    highlightsList.innerHTML = data.results.map(h => {
                        let tagHtml = '';
                        if (h.nlp_tags) {
                            try {
                                const parsed = JSON.parse(h.nlp_tags);
                                tagHtml = `
                                    <div class="tags">🏷️ ${escapeHTML(parsed.tags)}</div>
                                    ${parsed.context ? `<div style="font-size: 0.75rem; color: #848d97; margin-top: 5px; line-height: 1.3;">Context: ${escapeHTML(parsed.context)}</div>` : ''}
                                    ${parsed.intent ? `<div style="font-size: 0.75rem; color: #a371f7; margin-top: 2px; line-height: 1.3;">Intent: ${escapeHTML(parsed.intent)}</div>` : ''}
                                `;
                            } catch(e) {
                                tagHtml = `<div class="tags">🏷️ ${escapeHTML(h.nlp_tags)}</div>`;
                            }
                        }

                        return `
                            <div class="highlight-card">
                                <div style="margin-bottom: 8px;">"${escapeHTML(h.text_content)}"</div>
                                ${tagHtml}
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (e) { console.error('Error fetching highlights', e); }
    }
});
