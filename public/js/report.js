/**
 * Report page — loads a report by ID from the URL path.
 * URL format: /report/:id
 */

(function () {
    'use strict';

    var pathParts = window.location.pathname.split('/');
    var reportId = pathParts[pathParts.length - 1];

    // Validate reportId format (alphanumeric only)
    if (!reportId || reportId === 'report' || !/^[a-z0-9]+$/.test(reportId)) {
        showReportError();
        return;
    }

    // Try KV-cached report endpoint first (fast)
    fetch('/api/research/' + reportId)
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (data) {
            if (data.error) {
                showReportError();
                return;
            }

            if (data.status === 'completed' && data.report) {
                showReportContent(data.report, reportId, data.sourceCount, data.filteredCount);
            } else if (data.status === 'error') {
                showReportError(data.error);
            } else {
                // Still processing, show progress (escape status to prevent XSS)
                var statusText = escapeHtml(data.status || 'pending');
                var loadingEl = document.getElementById('report-loading');
                loadingEl.innerHTML =
                    '<div class="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-4"></div>' +
                    '<p class="text-gray-400">This report is still being generated...</p>' +
                    '<p class="text-sm text-gray-500 mt-2">Status: ' + statusText + '</p>';

                // Poll
                setTimeout(function () { pollReport(reportId, 0); }, 2000);
            }
        })
        .catch(function () {
            showReportError();
        });

    function pollReport(id, attempts) {
        if (attempts > 60) {
            showReportError('Report generation timed out.');
            return;
        }

        fetch('/api/research/' + id)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status === 'completed' && data.report) {
                    showReportContent(data.report, id, data.sourceCount, data.filteredCount);
                } else if (data.status === 'error') {
                    showReportError(data.error);
                } else {
                    setTimeout(function () { pollReport(id, attempts + 1); }, 2000);
                }
            })
            .catch(function () {
                setTimeout(function () { pollReport(id, attempts + 1); }, 3000);
            });
    }

    function showReportContent(report, reportId, sourceCount, filteredCount) {
        document.getElementById('report-loading').classList.add('hidden');
        document.getElementById('report-error').classList.add('hidden');

        var content = document.getElementById('report-content');
        content.classList.remove('hidden');

        // Update page title
        if (report.executive_summary) {
            document.title = 'TrueRank Report: ' + report.executive_summary.slice(0, 60);
        }

        // Reuse the renderReport function from app.js by dispatching a custom event
        // or just render inline (simpler, no cross-file dependency)
        var html = '';

        // Executive summary
        html += '<div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
        html += '<h1 class="text-2xl font-bold mb-3">Research Report</h1>';
        html += '<p class="text-gray-300 leading-relaxed">' + escapeHtml(report.executive_summary || '') + '</p>';
        if (report.methodology) {
            html += '<p class="text-sm text-gray-500 mt-3">' + escapeHtml(report.methodology) + '</p>';
        }
        if (sourceCount !== undefined) {
            html += '<div class="flex gap-4 mt-3 text-xs text-gray-500">';
            html += '<span>Sources found: ' + sourceCount + '</span>';
            html += '<span>Filtered out: ' + (filteredCount || 0) + '</span>';
            html += '</div>';
        }
        html += '</div>';

        // Products
        if (report.products && report.products.length > 0) {
            html += '<div class="space-y-4 mb-8">';
            report.products.forEach(function (product) {
                html += renderProductCardStandalone(product, reportId);
            });
            html += '</div>';
        }

        // Sources
        if (report.sources_summary && report.sources_summary.length > 0) {
            html += '<details class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
            html += '<summary class="cursor-pointer font-semibold text-gray-300">View Sources (' + report.sources_summary.length + ')</summary>';
            html += '<div class="mt-4 space-y-2">';
            report.sources_summary.forEach(function (source) {
                var trustLevel = source.trust_score >= 70 ? 'high' : (source.trust_score >= 40 ? 'medium' : 'low');
                html += '<div class="flex items-center gap-2 text-sm">';
                html += '<span class="trust-badge ' + trustLevel + ' text-xs">' + (source.trust_score || 0) + '</span>';
                html += '<span class="text-gray-500">' + escapeHtml(source.source_type || '') + '</span>';
                if (source.url) {
                    html += '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 truncate">' + escapeHtml(source.url) + '</a>';
                }
                html += '</div>';
            });
            html += '</div></details>';
        }

        // Category insights
        if (report.category_insights) {
            html += '<div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">';
            html += '<h3 class="font-semibold mb-2">Category Insights</h3>';
            html += '<p class="text-gray-400 text-sm">' + escapeHtml(report.category_insights) + '</p>';
            html += '</div>';
        }

        content.innerHTML = html;
    }

    function renderProductCardStandalone(product, reportId) {
        var rankClass = product.rank <= 3 ? 'rank-' + product.rank : 'rank-other';
        var trustLevel = product.trust_score >= 70 ? 'high' : (product.trust_score >= 40 ? 'medium' : 'low');

        var html = '<div class="product-card">';
        html += '<div class="flex items-start justify-between gap-3 mb-3">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="rank-badge ' + rankClass + '">#' + (product.rank || '?') + '</div>';
        html += '<div><h3 class="font-bold text-lg">' + escapeHtml(product.name) + '</h3>';
        if (product.verdict) html += '<p class="text-sm text-gray-400">' + escapeHtml(product.verdict) + '</p>';
        html += '</div></div>';
        html += '<div class="trust-badge ' + trustLevel + '">' + (product.trust_score || 0) + ' trust</div>';
        html += '</div>';

        html += '<div class="grid md:grid-cols-2 gap-4 mb-4">';
        if (product.pros && product.pros.length) {
            html += '<div><h4 class="text-sm font-semibold text-emerald-400 mb-1">Pros</h4><ul class="text-sm text-gray-300 space-y-1">';
            product.pros.forEach(function (p) { html += '<li class="flex gap-2"><span class="text-emerald-400">+</span> ' + escapeHtml(p) + '</li>'; });
            html += '</ul></div>';
        }
        if (product.cons && product.cons.length) {
            html += '<div><h4 class="text-sm font-semibold text-red-400 mb-1">Cons</h4><ul class="text-sm text-gray-300 space-y-1">';
            product.cons.forEach(function (c) { html += '<li class="flex gap-2"><span class="text-red-400">-</span> ' + escapeHtml(c) + '</li>'; });
            html += '</ul></div>';
        }
        html += '</div>';

        if (product.notable_quote) {
            html += '<blockquote class="border-l-2 border-emerald-800 pl-3 text-sm text-gray-400 italic mb-4">"' + escapeHtml(product.notable_quote) + '"</blockquote>';
        }

        html += '<div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-800">';
        html += '<div class="text-sm">';
        if (product.best_for) html += '<span class="text-gray-500">Best for: </span><span class="text-gray-300">' + escapeHtml(product.best_for) + '</span>';
        if (product.price_range) html += '<span class="text-gray-500 ml-3">Price: </span><span class="text-gray-300">' + escapeHtml(product.price_range) + '</span>';
        html += '</div>';

        if (product.affiliate_links && product.affiliate_links.amazon) {
            html += '<a href="/api/go/' + escapeHtml(product.id || '') + '?ref=' + escapeHtml(reportId) + '&network=amazon" target="_blank" rel="nofollow sponsored" class="affiliate-btn">View on Amazon';
            html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>';
            html += '</a>';
        }
        html += '</div></div>';
        return html;
    }

    function showReportError(message) {
        document.getElementById('report-loading').classList.add('hidden');
        document.getElementById('report-content').classList.add('hidden');
        var errorEl = document.getElementById('report-error');
        errorEl.classList.remove('hidden');
        if (message) {
            errorEl.querySelector('p').textContent = message;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

})();
