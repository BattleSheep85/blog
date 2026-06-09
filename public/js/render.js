/**
 * TrueRank - shared report rendering.
 *
 * One source of truth for turning a report JSON object into the editorial
 * report markup, used by both the inline search flow (app.js) and the
 * permalink report page (report.js). Exposes window.TrueRank.
 *
 * Report shape (from the worker pipeline):
 *   report.executive_summary, report.methodology, report.category_insights
 *   report.products[]: { id, rank, name, verdict, trust_score,
 *                        pros[], cons[], notable_quote, best_for,
 *                        price_range, affiliate_links: { amazon } }
 *   report.sources_summary[]: { trust_score, source_type, url, contribution }
 */
(function () {
    'use strict';

    // -- Utilities --------------------------------------------------------

    // Attribute-safe: escapes quotes too, so values are safe inside double- or
    // single-quoted attributes (href, value), not just in text nodes.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Only allow http(s) URLs into an href. Rejects javascript:, data:, etc. so
    // an attacker-influenced source URL cannot become a clickable XSS sink.
    function safeHref(url) {
        try {
            var u = new URL(url);
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
        } catch (e) { return null; }
    }

    // Tiers match the design system: high >= 80, medium 50-79, low < 50.
    function trustTier(score) {
        var s = Number(score) || 0;
        if (s >= 80) return 'high';
        if (s >= 50) return 'medium';
        return 'low';
    }

    var TIER = {
        high: { text: 'text-trust-high', bg: 'bg-trust-high-bg', dot: 'bg-trust-high', bar: 'bg-trust-high' },
        medium: { text: 'text-trust-medium', bg: 'bg-trust-medium-bg', dot: 'bg-trust-medium', bar: 'bg-trust-medium' },
        low: { text: 'text-trust-low', bg: 'bg-trust-low-bg', dot: 'bg-trust-low', bar: 'bg-trust-low' },
    };

    function clampScore(score) {
        return Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    }

    function prettySourceType(type) {
        var map = {
            reddit: 'Reddit', hackernews: 'Hacker News', youtube: 'YouTube',
            independent_review: 'Independent review', review_outlet: 'Review outlet',
            marketplace: 'Marketplace', affiliate_blog: 'Affiliate blog', web: 'Web',
        };
        return map[type] || (type ? String(type).replace(/_/g, ' ') : 'Source');
    }

    function hostFromUrl(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch (e) { return ''; }
    }

    // -- Components -------------------------------------------------------

    function trustBadge(score) {
        var s = clampScore(score);
        var t = TIER[trustTier(s)];
        return '<span class="inline-flex items-center gap-1.5 rounded-full ' + t.bg + ' px-2.5 py-1 font-mono text-mono-data font-medium ' + t.text + ' num">' +
            '<span class="h-1.5 w-1.5 rounded-full ' + t.dot + '"></span>Trust ' + s + '</span>';
    }

    function trustMeter(score) {
        var s = clampScore(score);
        var t = TIER[trustTier(s)];
        return '<div class="flex items-center gap-3">' +
            '<div class="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">' +
            '<div class="h-full rounded-full ' + t.bar + ' transition-[width] duration-700 ease-out" data-meter-fill style="width:0%"></div></div>' +
            '<span class="font-mono text-caption font-medium text-ink-2 num">' + s + '<span class="text-ink-3">/100</span></span>' +
            '</div>';
    }

    // Radial ring used in the report verdict block. JS (initTrustRings) drives
    // the fill + count-up after insertion.
    function trustRing(score) {
        var s = clampScore(score);
        return '<div class="relative grid h-28 w-28 place-items-center" data-trust-ring data-score="' + s + '">' +
            '<svg class="h-28 w-28 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle cx="60" cy="60" r="52" fill="none" style="stroke: var(--surface-2)" stroke-width="10"/>' +
            '<circle cx="60" cy="60" r="52" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7" data-trust-ring-fill style="stroke: var(--accent); transition: stroke-dashoffset 800ms ease-out"/>' +
            '</svg>' +
            '<div class="absolute flex flex-col items-center">' +
            '<span class="font-mono text-2xl font-semibold text-ink num" data-trust-ring-num>0</span>' +
            '<span class="text-overline uppercase text-ink-3">Trust</span></div></div>';
    }

    function affiliateHref(product, reportId) {
        var ref = encodeURIComponent(reportId || '');
        // Prefer the per-product click path (server resolves the stored link).
        // Fall back to the search redirect when a product has no id, so the CTA
        // never points at a 404.
        if (product.id) {
            return '/api/go/' + encodeURIComponent(product.id) + '?ref=' + ref + '&network=amazon';
        }
        return '/api/go/search?q=' + encodeURIComponent(product.name || '') + '&ref=' + ref + '&network=amazon';
    }

    var EXTERNAL_ICON = '<svg class="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H9M17 7v8"/></svg>';

    function affiliateButton(product, reportId) {
        if (!(product.affiliate_links && product.affiliate_links.amazon)) return '';
        return '<a href="' + affiliateHref(product, reportId) + '" target="_blank" rel="sponsored nofollow noopener" ' +
            'class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1">' +
            'Check price' + EXTERNAL_ICON + '</a>';
    }

    function prosCons(product) {
        var html = '';
        var hasPros = product.pros && product.pros.length;
        var hasCons = product.cons && product.cons.length;
        if (!hasPros && !hasCons) return '';
        html += '<div class="grid gap-5 md:grid-cols-2">';
        if (hasPros) {
            html += '<div><h4 class="mb-2 text-overline uppercase text-ink-3">What holds up</h4><ul class="flex flex-col gap-1.5 text-body-sm text-ink-2">';
            product.pros.forEach(function (p) {
                html += '<li class="flex gap-2"><span class="mt-0.5 shrink-0 text-trust-high">+</span><span>' + escapeHtml(p) + '</span></li>';
            });
            html += '</ul></div>';
        }
        if (hasCons) {
            html += '<div><h4 class="mb-2 text-overline uppercase text-ink-3">Where it falls short</h4><ul class="flex flex-col gap-1.5 text-body-sm text-ink-2">';
            product.cons.forEach(function (c) {
                html += '<li class="flex gap-2"><span class="mt-0.5 shrink-0 text-trust-low">−</span><span>' + escapeHtml(c) + '</span></li>';
            });
            html += '</ul></div>';
        }
        html += '</div>';
        return html;
    }

    function productCard(product, reportId) {
        var rank = product.rank || '?';
        var html = '<article class="group relative flex flex-col gap-4 rounded-xl border border-line bg-surface-1 p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">';
        html += '<span class="absolute right-5 top-5 font-mono text-caption font-medium text-ink-3 num">#' + escapeHtml(rank) + '</span>';

        // Title + verdict + trust meter
        html += '<div class="flex flex-col gap-3 pr-10">';
        html += '<h3 class="font-serif text-h3 font-semibold text-ink">' + escapeHtml(product.name) + '</h3>';
        if (product.verdict) {
            html += '<p class="text-body-sm text-ink-2">' + escapeHtml(product.verdict) + '</p>';
        }
        html += trustMeter(product.trust_score);
        html += '</div>';

        html += prosCons(product);

        if (product.notable_quote) {
            html += '<blockquote class="border-l-2 border-accent/40 pl-4 font-serif text-body italic text-ink-2">“' + escapeHtml(product.notable_quote) + '”</blockquote>';
        }

        // Footer: best for / price / affiliate CTA
        html += '<div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">';
        html += '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">';
        if (product.best_for) {
            html += '<span><span class="text-ink-3">Best for </span><span class="text-ink-2">' + escapeHtml(product.best_for) + '</span></span>';
        }
        if (product.price_range) {
            html += '<span class="font-mono text-ink num">' + escapeHtml(product.price_range) + '</span>';
        }
        html += '</div>';
        html += affiliateButton(product, reportId);
        html += '</div>';

        html += '</article>';
        return html;
    }

    function comparisonTable(products, reportId) {
        if (!products || products.length < 2) return '';
        var head = '<thead class="border-b border-line-strong"><tr>' +
            ['Product', 'Trust', 'Price', 'Best for'].map(function (h) {
                return '<th scope="col" class="bg-surface-2 px-4 py-3 text-left font-sans text-overline uppercase text-ink-3">' + h + '</th>';
            }).join('') +
            '<th scope="col" class="bg-surface-2 px-4 py-3"><span class="sr-only">Buy</span></th>' +
            '</tr></thead>';

        var rows = products.map(function (p) {
            var s = clampScore(p.trust_score);
            var t = TIER[trustTier(s)];
            var cta = (p.affiliate_links && p.affiliate_links.amazon)
                ? '<a href="' + affiliateHref(p, reportId) + '" target="_blank" rel="sponsored nofollow noopener" class="font-sans text-body-sm font-semibold text-accent hover:text-accent-hover">Check price →</a>'
                : '';
            return '<tr class="border-b border-line transition-colors hover:bg-surface-2/60">' +
                '<td class="px-4 py-4"><div class="flex items-center gap-3"><span class="font-mono text-caption text-ink-3 num">#' + escapeHtml(p.rank || '?') + '</span><span class="font-sans text-body font-medium text-ink">' + escapeHtml(p.name) + '</span></div></td>' +
                '<td class="px-4 py-4"><span class="inline-flex items-center gap-1.5 rounded-full ' + t.bg + ' px-2.5 py-1 font-mono text-caption font-medium ' + t.text + ' num"><span class="h-1.5 w-1.5 rounded-full ' + t.dot + '"></span>' + s + '</span></td>' +
                '<td class="px-4 py-4 font-mono text-body text-ink num">' + escapeHtml(p.price_range || '-') + '</td>' +
                '<td class="px-4 py-4 font-sans text-body-sm text-ink-2">' + escapeHtml(p.best_for || '') + '</td>' +
                '<td class="px-4 py-4 text-right">' + cta + '</td></tr>';
        }).join('');

        return '<div class="overflow-x-auto rounded-xl border border-line"><table class="w-full border-collapse">' +
            '<caption class="sr-only">Product comparison</caption>' + head + '<tbody>' + rows + '</tbody></table></div>';
    }

    function sourceCitation(source, index) {
        var s = clampScore(source.trust_score);
        var t = TIER[trustTier(s)];
        var href = safeHref(source.url);
        var host = href ? hostFromUrl(href) : '';
        var label = host || prettySourceType(source.source_type);
        // Expose the contribution via title too, so touch and screen-reader
        // users get it without the hover/focus popover.
        var titleAttr = source.contribution ? ' title="' + escapeHtml(source.contribution) + '"' : '';
        var inner = '<span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 font-mono text-caption text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink">' +
            '<span class="font-mono text-ink-3 num">' + (index + 1) + '.</span>' +
            '<span class="h-1.5 w-1.5 rounded-full ' + t.dot + '"></span>' +
            escapeHtml(label) +
            '<span class="text-ink-3 num">· trust ' + s + '</span></span>';

        var anchor = href
            ? '<a id="src-' + (index + 1) + '" href="' + escapeHtml(href) + '"' + titleAttr + ' target="_blank" rel="noopener nofollow">' + inner + '</a>'
            : '<span id="src-' + (index + 1) + '"' + titleAttr + '>' + inner + '</span>';

        var pop = '';
        if (source.contribution) {
            pop = '<span data-cite-pop class="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-line-strong bg-surface-1 p-3 text-body-sm text-ink-2 opacity-0 shadow-lift transition-opacity duration-150 group-hover/cite:visible group-hover/cite:opacity-100 group-focus-within/cite:visible group-focus-within/cite:opacity-100">' + escapeHtml(source.contribution) + '</span>';
        }
        return '<span class="relative inline-block group/cite">' + anchor + pop + '</span>';
    }

    // -- Feedback form (optional) ----------------------------------------

    function feedbackForm(reportId) {
        var html = '<div id="feedback-section" class="rounded-xl border border-line bg-surface-1 p-6 shadow-card">';
        html += '<h3 class="mb-3 font-serif text-h3 font-semibold text-ink">Was this honest enough?</h3>';
        html += '<form id="feedback-form" class="flex flex-wrap items-center gap-3">';
        html += '<input type="hidden" name="reportId" value="' + escapeHtml(reportId) + '">';
        for (var i = 1; i <= 5; i++) {
            html += '<button type="button" class="rating-btn h-10 w-10 rounded-lg border border-line text-body-sm text-ink-2 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" data-rating="' + i + '">' + i + '</button>';
        }
        html += '<input type="text" name="comment" maxlength="1000" placeholder="Optional. What did we get right or wrong?" class="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-body-sm text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">';
        html += '<button type="submit" class="rounded-lg border border-line bg-surface-1 px-4 py-2 text-body-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-50" disabled>Send</button>';
        html += '</form></div>';
        return html;
    }

    function bindFeedbackForm(reportId) {
        var form = document.getElementById('feedback-form');
        if (!form) return;
        var selected = 0;
        var btns = form.querySelectorAll('.rating-btn');
        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                selected = parseInt(this.dataset.rating, 10);
                btns.forEach(function (b) {
                    var on = parseInt(b.dataset.rating, 10) <= selected;
                    b.classList.toggle('border-accent', on);
                    b.classList.toggle('text-accent', on);
                });
                form.querySelector('button[type="submit"]').disabled = false;
            });
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!selected) return;
            fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportId: reportId,
                    rating: selected,
                    comment: form.querySelector('input[name="comment"]').value,
                }),
            }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var section = document.getElementById('feedback-section');
                if (section) section.innerHTML = '<p class="text-body-sm text-trust-high">Thanks. Honest feedback makes the next ranking better.</p>';
            }).catch(function () {
                var section = document.getElementById('feedback-section');
                if (section) section.innerHTML = '<p class="text-body-sm text-trust-low">Could not send that. Please try again later.</p>';
            });
        });
    }

    // -- Trust animations -------------------------------------------------

    function tierStrokeVar(score) {
        var s = clampScore(score);
        return s >= 80 ? '--trust-high' : (s >= 50 ? '--trust-medium' : '--trust-low');
    }

    function initTrustRings(root) {
        var scope = root || document;
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var C = 326.7; // 2 * pi * 52
        scope.querySelectorAll('[data-trust-ring]').forEach(function (el) {
            var score = clampScore(el.dataset.score);
            var fill = el.querySelector('[data-trust-ring-fill]');
            var num = el.querySelector('[data-trust-ring-num]');
            if (!fill || !num) return;
            fill.style.stroke = 'var(' + tierStrokeVar(score) + ')';
            if (reduce) {
                fill.style.transition = 'none';
                fill.style.strokeDashoffset = String(C * (1 - score / 100));
                num.textContent = String(score);
                return;
            }
            requestAnimationFrame(function () {
                fill.style.strokeDashoffset = String(C * (1 - score / 100));
            });
            var start = null;
            function step(t) {
                if (!start) start = t;
                var p = Math.min(1, (t - start) / 800);
                num.textContent = String(Math.round(score * p));
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }

    // -- Top-level report renderer ---------------------------------------

    /**
     * Build the full report markup.
     * opts: { reportId, sourceCount, filteredCount, heading, withFeedback, withPermalink }
     */
    function renderReportHtml(report, opts) {
        opts = opts || {};
        var reportId = opts.reportId || '';
        var products = (report.products || []).slice().sort(function (a, b) {
            return (a.rank || 99) - (b.rank || 99);
        });
        var winner = products[0];
        var html = '';

        // Verdict block
        html += '<section class="mb-10 animate-fade-in">';
        html += '<div class="rounded-2xl border border-line bg-surface-1 p-6 shadow-card md:p-8">';
        html += '<span class="text-overline uppercase text-accent">The verdict</span>';
        html += '<div class="mt-3 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">';
        html += '<div class="max-w-[60ch]">';
        if (winner) {
            html += '<h2 class="font-serif text-h2 font-semibold text-ink">' + escapeHtml(winner.name) + '</h2>';
        }
        html += '<p class="mt-2 text-lead text-ink-2">' + escapeHtml(report.executive_summary || '') + '</p>';
        if (report.methodology) {
            html += '<p class="mt-3 text-caption text-ink-3">' + escapeHtml(report.methodology) + '</p>';
        }
        html += '</div>';
        if (winner) {
            html += '<div class="flex shrink-0 flex-col items-center gap-4">' + trustRing(winner.trust_score);
            html += affiliateButton(winner, reportId) + '</div>';
        }
        html += '</div>';
        // Stats line
        if (opts.sourceCount !== undefined && opts.sourceCount !== null) {
            html += '<div class="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 font-mono text-caption text-ink-3 num">';
            html += '<span>' + (opts.sourceCount || 0) + ' sources read</span>';
            html += '<span>' + (opts.filteredCount || 0) + ' filtered out</span>';
            html += '<span>' + products.length + ' candidates ranked</span>';
            html += '</div>';
        }
        html += '</div></section>';

        // Ranking
        if (products.length > 0) {
            html += '<section class="mb-12"><header class="mb-6 flex flex-col gap-2"><span class="text-overline uppercase text-accent">The ranking</span><h2 class="font-serif text-h2 font-semibold text-ink">Every pick, with its receipts</h2></header>';
            html += '<div class="flex flex-col gap-5">';
            products.forEach(function (p) { html += productCard(p, reportId); });
            html += '</div>';
            html += '<p class="mt-3 text-caption text-ink-3">We earn a commission if you buy through these links. It does not change the ranking.</p>';
            html += '</section>';
        } else {
            html += '<section class="mb-12 rounded-xl border border-line bg-surface-1 p-8 text-center text-ink-2">No products could be ranked from the available sources. Try a more specific query.</section>';
        }

        // Comparison table
        var table = comparisonTable(products, reportId);
        if (table) {
            html += '<section class="mb-12"><header class="mb-6 flex flex-col gap-2"><span class="text-overline uppercase text-accent">Side by side</span><h2 class="font-serif text-h2 font-semibold text-ink">Comparison</h2></header>' + table + '</section>';
        }

        // Category insights
        if (report.category_insights) {
            html += '<section class="mb-12"><div class="rounded-xl border border-line bg-accent-quiet/60 p-6"><h3 class="mb-2 font-serif text-h3 font-semibold text-ink">What we learned about this category</h3><p class="max-w-[68ch] text-body text-ink-2">' + escapeHtml(report.category_insights) + '</p></div></section>';
        }

        // Sources
        if (report.sources_summary && report.sources_summary.length > 0) {
            html += '<section class="mb-12"><header class="mb-6 flex flex-col gap-2"><span class="text-overline uppercase text-accent">Receipts</span><h2 class="font-serif text-h2 font-semibold text-ink">Sources (' + report.sources_summary.length + ')</h2><p class="max-w-[60ch] text-body-sm text-ink-3">Hover or focus any source to see what it contributed. Nothing here is asserted without one.</p></header>';
            html += '<ol class="flex flex-wrap gap-2">';
            report.sources_summary.forEach(function (src, i) {
                html += '<li>' + sourceCitation(src, i) + '</li>';
            });
            html += '</ol></section>';
        }

        // Feedback
        if (opts.withFeedback) {
            html += '<section class="mb-10">' + feedbackForm(reportId) + '</section>';
        }

        // Permalink
        if (opts.withPermalink && reportId) {
            html += '<div class="text-center text-caption text-ink-3">Report ID <code class="font-mono text-ink-2">' + escapeHtml(reportId) + '</code> · <a href="/report/' + escapeHtml(reportId) + '" class="text-accent hover:text-accent-hover">Permalink</a></div>';
        }

        return html;
    }

    /**
     * Render a report into a container element and run post-render init
     * (animations + feedback binding).
     */
    function mountReport(container, report, opts) {
        if (!container) return;
        container.innerHTML = renderReportHtml(report, opts);
        initTrustRings(container);
        // Animate linear meters: set width from the score in the adjacent label.
        container.querySelectorAll('[data-meter-fill]').forEach(function (fill) {
            var labelNum = fill.closest('.flex') && fill.closest('.flex').querySelector('.font-mono.num');
            var pct = parseInt((labelNum && labelNum.textContent) || '0', 10) || 0;
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduce) { fill.style.width = pct + '%'; }
            else { requestAnimationFrame(function () { fill.style.width = pct + '%'; }); }
        });
        if (opts && opts.withFeedback) bindFeedbackForm((opts && opts.reportId) || '');
    }

    window.TrueRank = {
        escapeHtml: escapeHtml,
        trustTier: trustTier,
        trustBadge: trustBadge,
        trustMeter: trustMeter,
        trustRing: trustRing,
        productCard: productCard,
        comparisonTable: comparisonTable,
        sourceCitation: sourceCitation,
        renderReportHtml: renderReportHtml,
        mountReport: mountReport,
        initTrustRings: initTrustRings,
        bindFeedbackForm: bindFeedbackForm,
    };
})();
