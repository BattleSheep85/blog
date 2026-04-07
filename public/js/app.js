/**
 * TrueRank frontend — search, SSE progress, and report rendering.
 * Vanilla JS, no dependencies beyond htmx (which handles some interactions).
 */

(function () {
    'use strict';

    // -- Theme Toggle --
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.documentElement.classList.remove('dark');
            toggleIcons(false);
        }

        themeToggle.addEventListener('click', function () {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            toggleIcons(isDark);
        });
    }

    function toggleIcons(isDark) {
        const moon = document.getElementById('icon-moon');
        const sun = document.getElementById('icon-sun');
        if (moon && sun) {
            moon.classList.toggle('hidden', !isDark);
            sun.classList.toggle('hidden', isDark);
        }
    }

    // -- Example Queries --
    document.querySelectorAll('.example-query').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var input = document.getElementById('query-input');
            if (input) {
                input.value = this.dataset.query;
                input.focus();
            }
        });
    });

    // -- Search Form --
    var searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var query = document.getElementById('query-input').value.trim();
            if (query.length < 3) return;
            startResearch(query);
        });
    }

    function startResearch(query) {
        var btn = document.getElementById('search-btn');
        var input = document.getElementById('query-input');
        btn.disabled = true;
        btn.textContent = 'Researching...';
        input.disabled = true;

        showSection('progress');
        clearProgress();
        addProgress('Submitting research request...');

        fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query }),
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    showError(data.error);
                    return;
                }

                if (data.cached) {
                    addProgress('Found cached report!');
                    renderReport(data.report, data.id);
                    return;
                }

                addProgress('Research job queued. Connecting to live updates...');
                connectSSE(data.id);
            })
            .catch(function (err) {
                showError('Failed to start research: ' + err.message);
            });
    }

    function connectSSE(reportId) {
        // SSE with short-lived connections: server sends current state and closes.
        // EventSource auto-reconnects with Last-Event-ID to get new updates.
        var done = false;
        var errorCount = 0;
        var source = new EventSource('/api/research/' + reportId + '/stream');

        source.onmessage = function (event) {
            errorCount = 0; // Reset on successful message
            var data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            if (data.type === 'progress') {
                addProgress(data.message);
            } else if (data.type === 'complete') {
                done = true;
                addProgress('Done!');
                source.close();
                renderReport(data.report, reportId, data.sourceCount, data.filteredCount);
            } else if (data.type === 'error') {
                done = true;
                source.close();
                showError(data.error);
            }
            // 'keepalive' type: do nothing, let EventSource reconnect
        };

        source.onerror = function () {
            if (done) return;
            errorCount++;
            // After 5 consecutive connection failures, fall back to polling
            if (errorCount > 5) {
                source.close();
                addProgress('Connection unstable. Switching to polling...');
                pollForResults(reportId, 0);
            }
            // Otherwise, EventSource will auto-reconnect (default ~3s)
        };
    }

    function pollForResults(reportId, attempts) {
        if (attempts > 120) {
            showError('Research timed out. Please try again.');
            return;
        }

        fetch('/api/research/' + reportId)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status === 'completed' && data.report) {
                    renderReport(data.report, reportId, data.sourceCount, data.filteredCount);
                } else if (data.status === 'error') {
                    showError(data.error || 'Research failed');
                } else {
                    if (data.progress) {
                        addProgress(data.progress.message);
                    }
                    setTimeout(function () { pollForResults(reportId, attempts + 1); }, 2000);
                }
            })
            .catch(function () {
                setTimeout(function () { pollForResults(reportId, attempts + 1); }, 3000);
            });
    }

    // -- UI Helpers --

    function showSection(name) {
        var sections = ['progress', 'report', 'error'];
        sections.forEach(function (s) {
            var el = document.getElementById(s + '-section');
            if (el) el.classList.toggle('hidden', s !== name);
        });
        var howItWorks = document.getElementById('how-it-works');
        if (howItWorks) howItWorks.classList.add('hidden');
    }

    function clearProgress() {
        var log = document.getElementById('progress-log');
        if (log) log.innerHTML = '';
    }

    function addProgress(message) {
        var log = document.getElementById('progress-log');
        if (!log) return;
        var entry = document.createElement('div');
        entry.className = 'progress-entry';
        entry.textContent = message;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    function showError(message) {
        showSection('error');
        var el = document.getElementById('error-message');
        if (el) el.textContent = message;
        resetFormState();
    }

    function resetFormState() {
        var btn = document.getElementById('search-btn');
        var input = document.getElementById('query-input');
        if (btn) { btn.disabled = false; btn.textContent = 'Research'; }
        if (input) input.disabled = false;
    }

    // -- Report Rendering --

    function renderReport(report, reportId, sourceCount, filteredCount) {
        showSection('report');
        resetFormState();

        var container = document.getElementById('report-section');
        if (!container) return;

        var html = '';

        // Executive summary
        html += '<div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
        html += '<h2 class="text-xl font-bold mb-3">Summary</h2>';
        html += '<p class="text-gray-300 leading-relaxed">' + escapeHtml(report.executive_summary || '') + '</p>';
        if (report.methodology) {
            html += '<p class="text-sm text-gray-500 mt-3">' + escapeHtml(report.methodology) + '</p>';
        }
        html += '</div>';

        // Product cards
        if (report.products && report.products.length > 0) {
            html += '<div class="space-y-4 mb-8">';
            report.products.forEach(function (product) {
                html += renderProductCard(product, reportId);
            });
            html += '</div>';
        } else {
            html += '<div class="text-center py-8 text-gray-500">No products could be ranked from the available sources.</div>';
        }

        // Sources
        if (report.sources_summary && report.sources_summary.length > 0) {
            html += '<details class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
            html += '<summary class="cursor-pointer font-semibold text-gray-300 hover:text-white transition-colors">View Sources (' + report.sources_summary.length + ')</summary>';
            html += '<div class="mt-4 space-y-1">';
            report.sources_summary.forEach(function (source) {
                html += renderSourceItem(source);
            });
            html += '</div>';
            html += '</details>';
        }

        // Category insights
        if (report.category_insights) {
            html += '<div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
            html += '<h3 class="font-semibold mb-2">Category Insights</h3>';
            html += '<p class="text-gray-400 text-sm">' + escapeHtml(report.category_insights) + '</p>';
            html += '</div>';
        }

        // Feedback
        html += renderFeedbackForm(reportId);

        // Share link
        html += '<div class="text-center text-sm text-gray-500 mt-6">';
        html += 'Report ID: <code class="text-gray-400">' + escapeHtml(reportId) + '</code>';
        html += ' · <a href="/report/' + escapeHtml(reportId) + '" class="text-emerald-400 hover:text-emerald-300">Permalink</a>';
        html += '</div>';

        container.innerHTML = html;

        // Bind feedback form
        bindFeedbackForm(reportId);
    }

    function renderProductCard(product, reportId) {
        var rankClass = product.rank <= 3 ? 'rank-' + product.rank : 'rank-other';
        var trustLevel = product.trust_score >= 70 ? 'high' : (product.trust_score >= 40 ? 'medium' : 'low');

        var html = '<div class="product-card">';

        // Header: rank + name + trust
        html += '<div class="flex items-start justify-between gap-3 mb-3">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="rank-badge ' + rankClass + '">#' + (product.rank || '?') + '</div>';
        html += '<div>';
        html += '<h3 class="font-bold text-lg">' + escapeHtml(product.name) + '</h3>';
        if (product.verdict) {
            html += '<p class="text-sm text-gray-400">' + escapeHtml(product.verdict) + '</p>';
        }
        html += '</div>';
        html += '</div>';
        html += '<div class="trust-badge ' + trustLevel + '">' + (product.trust_score || 0) + ' trust</div>';
        html += '</div>';

        // Pros & Cons
        html += '<div class="grid md:grid-cols-2 gap-4 mb-4">';
        if (product.pros && product.pros.length > 0) {
            html += '<div>';
            html += '<h4 class="text-sm font-semibold text-emerald-400 mb-1">Pros</h4>';
            html += '<ul class="text-sm text-gray-300 space-y-1">';
            product.pros.forEach(function (pro) {
                html += '<li class="flex gap-2"><span class="text-emerald-400 flex-shrink-0">+</span> ' + escapeHtml(pro) + '</li>';
            });
            html += '</ul></div>';
        }
        if (product.cons && product.cons.length > 0) {
            html += '<div>';
            html += '<h4 class="text-sm font-semibold text-red-400 mb-1">Cons</h4>';
            html += '<ul class="text-sm text-gray-300 space-y-1">';
            product.cons.forEach(function (con) {
                html += '<li class="flex gap-2"><span class="text-red-400 flex-shrink-0">-</span> ' + escapeHtml(con) + '</li>';
            });
            html += '</ul></div>';
        }
        html += '</div>';

        // Notable quote
        if (product.notable_quote) {
            html += '<blockquote class="border-l-2 border-emerald-800 pl-3 text-sm text-gray-400 italic mb-4">';
            html += '"' + escapeHtml(product.notable_quote) + '"';
            html += '</blockquote>';
        }

        // Footer: best for, price, affiliate link
        html += '<div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-800">';
        html += '<div class="text-sm">';
        if (product.best_for) {
            html += '<span class="text-gray-500">Best for: </span><span class="text-gray-300">' + escapeHtml(product.best_for) + '</span>';
        }
        if (product.price_range) {
            html += '<span class="text-gray-500 ml-3">Price: </span><span class="text-gray-300">' + escapeHtml(product.price_range) + '</span>';
        }
        html += '</div>';

        if (product.affiliate_links && product.affiliate_links.amazon) {
            html += '<a href="/api/go/' + escapeHtml(product.id || '') + '?ref=' + escapeHtml(reportId) + '&network=amazon" ';
            html += 'target="_blank" rel="nofollow sponsored" class="affiliate-btn">';
            html += 'View on Amazon';
            html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>';
            html += '</a>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    function renderSourceItem(source) {
        var trustLevel = source.trust_score >= 70 ? 'high' : (source.trust_score >= 40 ? 'medium' : 'low');
        var html = '<div class="source-item">';
        html += '<span class="trust-badge ' + trustLevel + ' text-xs">' + (source.trust_score || 0) + '</span>';
        html += '<span class="text-xs text-gray-500 w-24 flex-shrink-0">' + escapeHtml(source.source_type || '') + '</span>';
        if (source.url) {
            html += '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener" class="text-sm text-emerald-400 hover:text-emerald-300 truncate">' + escapeHtml(source.url) + '</a>';
        }
        if (source.contribution) {
            html += '<span class="text-xs text-gray-500 hidden md:inline"> - ' + escapeHtml(source.contribution) + '</span>';
        }
        html += '</div>';
        return html;
    }

    function renderFeedbackForm(reportId) {
        var html = '<div id="feedback-section" class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
        html += '<h3 class="font-semibold mb-3">Was this report helpful?</h3>';
        html += '<form id="feedback-form" class="flex flex-wrap items-center gap-3">';
        html += '<input type="hidden" name="reportId" value="' + escapeHtml(reportId) + '">';
        for (var i = 1; i <= 5; i++) {
            html += '<button type="button" class="rating-btn w-10 h-10 rounded-lg border border-gray-700 hover:border-emerald-500 transition-colors text-sm" data-rating="' + i + '">' + i + '</button>';
        }
        html += '<input type="text" name="comment" placeholder="Optional comment..." class="flex-1 min-w-0 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500">';
        html += '<button type="submit" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors" disabled>Send</button>';
        html += '</form>';
        html += '</div>';
        return html;
    }

    function bindFeedbackForm(reportId) {
        var form = document.getElementById('feedback-form');
        if (!form) return;

        var selectedRating = 0;
        form.querySelectorAll('.rating-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectedRating = parseInt(this.dataset.rating);
                form.querySelectorAll('.rating-btn').forEach(function (b) {
                    b.classList.toggle('border-emerald-500', parseInt(b.dataset.rating) <= selectedRating);
                    b.classList.toggle('text-emerald-400', parseInt(b.dataset.rating) <= selectedRating);
                });
                form.querySelector('button[type="submit"]').disabled = false;
            });
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!selectedRating) return;

            fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportId: reportId,
                    rating: selectedRating,
                    comment: form.querySelector('input[name="comment"]').value,
                }),
            }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var section = document.getElementById('feedback-section');
                if (section) section.innerHTML = '<p class="text-emerald-400 text-sm">Thanks for the feedback!</p>';
            }).catch(function () {
                var section = document.getElementById('feedback-section');
                if (section) section.innerHTML = '<p class="text-red-400 text-sm">Failed to send feedback. Try again later.</p>';
            });
        });
    }

    // -- Utilities --

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // Expose for reset button
    window.resetUI = function () {
        showSection('none');
        var howItWorks = document.getElementById('how-it-works');
        if (howItWorks) howItWorks.classList.remove('hidden');
        resetFormState();
        var container = document.getElementById('report-section');
        if (container) container.innerHTML = '';
    };

})();
