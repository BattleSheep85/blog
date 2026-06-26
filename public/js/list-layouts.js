/**
 * Shared list layout toggle — Spreadsheet / Cards / Compact / Timeline.
 * Used by search history, browse results, reviews directory, and report products.
 */
(function (global) {
    'use strict';

    var LAYOUT_KEY = 'truerank_list_layout';
    var LAYOUTS = [
        { id: 'spreadsheet', label: 'Spreadsheet', title: 'SAP / Excel-style table' },
        { id: 'grid', label: 'Cards', title: 'Card grid' },
        { id: 'compact', label: 'Compact', title: 'Dense single-column list' },
        { id: 'timeline', label: 'Timeline', title: 'Grouped by date' },
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function timeAgo(ts) {
        if (!ts) return '';
        var sec = Math.floor((Date.now() - ts) / 1000);
        if (sec < 60) return 'just now';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
        return new Date(ts).toLocaleDateString();
    }

    function formatDate(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    }

    function timelineGroup(ts) {
        var d = new Date(ts || Date.now());
        var now = new Date();
        var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (d.getTime() >= startToday) return 'Today';
        if (d.getTime() >= startToday - 86400000) return 'Yesterday';
        if (d.getTime() >= startToday - 6 * 86400000) return 'This week';
        return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }

    function getLayout() {
        try {
            var v = localStorage.getItem(LAYOUT_KEY);
            if (v && LAYOUTS.some(function (l) { return l.id === v; })) return v;
            var legacy = localStorage.getItem('truerank_history_layout');
            if (legacy && LAYOUTS.some(function (l) { return l.id === legacy; })) return legacy;
        } catch (e) { /* ignore */ }
        return 'spreadsheet';
    }

    function setLayout(id) {
        if (!LAYOUTS.some(function (l) { return l.id === id; })) return;
        try {
            localStorage.setItem(LAYOUT_KEY, id);
            localStorage.setItem('truerank_history_layout', id);
        } catch (e) { /* ignore */ }
    }

    function renderToolbar(layout) {
        var html = '<div class="history-layout-bar" role="group" aria-label="List layout">';
        html += '<span class="history-layout-label">Layout</span>';
        html += '<div class="history-layout-toggle">';
        LAYOUTS.forEach(function (l) {
            var active = l.id === layout;
            html += '<button type="button" class="history-layout-btn' + (active ? ' is-active' : '') + '" data-layout="' + l.id + '" title="' + esc(l.title) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + esc(l.label) + '</button>';
        });
        html += '</div></div>';
        return html;
    }

    function wireSpreadsheetRows(root) {
        root.querySelectorAll('.history-row-link[data-href]').forEach(function (row) {
            if (row.__wired) return;
            row.__wired = true;
            function go() { window.location.href = row.getAttribute('data-href'); }
            row.addEventListener('click', go);
            row.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
            });
        });
    }

    function tableWrap(head, body) {
        return '<div class="history-spreadsheet-wrap"><table class="history-spreadsheet"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    }

    function sheetRow(href, cells) {
        return '<tr class="history-row-link" tabindex="0" role="link" data-href="' + esc(href) + '">' + cells + '<td class="history-col-open num" aria-hidden="true">\u2192</td></tr>';
    }

    var KINDS = {
        history: {
            spreadsheet: function (items) {
                var head = '<th scope="col" class="history-col-num">#</th><th scope="col">Query</th><th scope="col" class="history-col-date">Last searched</th><th scope="col" class="history-col-open"><span class="sr-only">Open</span></th>';
                var body = items.map(function (item, i) {
                    var href = '/research/' + esc(item.slug);
                    return sheetRow(href,
                        '<td class="history-col-num num">' + (i + 1) + '</td>' +
                        '<td class="history-col-query">' + esc(item.query) + '</td>' +
                        '<td class="history-col-date num" title="' + esc(formatDate(item.ts)) + '">' + esc(timeAgo(item.ts)) + '</td>');
                }).join('');
                return tableWrap(head, body);
            },
            grid: function (items) {
                var html = '<div class="history-grid">';
                items.forEach(function (item) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-card">';
                    html += '<div class="history-card-top"><span class="text-overline uppercase text-accent">Research</span>';
                    html += '<span class="font-mono text-caption text-ink-3 num">' + esc(timeAgo(item.ts)) + '</span></div>';
                    html += '<h3 class="font-serif text-body font-semibold text-ink">' + esc(item.query) + '</h3></a>';
                });
                return html + '</div>';
            },
            compact: function (items) {
                var html = '<div class="history-compact">';
                items.forEach(function (item, i) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-compact-row">';
                    html += '<span class="history-compact-num num">' + String(i + 1).padStart(2, '0') + '</span>';
                    html += '<span class="history-compact-query">' + esc(item.query) + '</span>';
                    html += '<span class="history-compact-when num">' + esc(timeAgo(item.ts)) + '</span></a>';
                });
                return html + '</div>';
            },
            timeline: function (items) { return timelineBody(items, function (item) {
                return '<a href="/research/' + esc(item.slug) + '" class="history-timeline-item">';
            }, function (item) { return esc(item.query); }, function (item) { return timeAgo(item.ts); }); },
        },
        research: {
            spreadsheet: function (items) {
                var head = '<th scope="col" class="history-col-num">#</th><th scope="col">Research</th><th scope="col">Category</th><th scope="col" class="history-col-num">Products</th><th scope="col" class="history-col-num">Views</th><th scope="col" class="history-col-date">Updated</th><th scope="col" class="history-col-open"><span class="sr-only">Open</span></th>';
                var body = items.map(function (item, i) {
                    var href = '/research/' + esc(item.slug);
                    return sheetRow(href,
                        '<td class="history-col-num num">' + (i + 1) + '</td>' +
                        '<td class="history-col-query">' + esc(item.query) + '</td>' +
                        '<td>' + esc(item.category || '\u2014') + '</td>' +
                        '<td class="history-col-num num">' + esc(item.product_count != null ? item.product_count : '\u2014') + '</td>' +
                        '<td class="history-col-num num">' + esc(item.view_count != null ? item.view_count : '\u2014') + '</td>' +
                        '<td class="history-col-date num" title="' + esc(formatDate(item.ts)) + '">' + esc(timeAgo(item.ts)) + '</td>');
                }).join('');
                return tableWrap(head, body);
            },
            grid: function (items) {
                var html = '<div class="history-grid">';
                items.forEach(function (item) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-card">';
                    html += '<div class="history-card-top">';
                    html += item.category ? '<span class="text-overline uppercase text-accent">' + esc(item.category) + '</span>' : '<span></span>';
                    html += '<span class="font-mono text-caption text-ink-3 num">' + esc(timeAgo(item.ts)) + '</span></div>';
                    html += '<h3 class="font-serif text-h3 font-semibold text-ink">' + esc(item.query) + '</h3>';
                    if (item.summary) html += '<p class="mt-2 line-clamp-2 text-body-sm text-ink-2">' + esc(item.summary) + '</p>';
                    html += '<div class="mt-3 flex gap-4 font-mono text-caption text-ink-3 num">';
                    if (item.product_count != null) html += '<span>' + esc(item.product_count) + ' products</span>';
                    if (item.view_count != null) html += '<span>' + esc(item.view_count) + ' views</span>';
                    html += '</div></a>';
                });
                return html + '</div>';
            },
            compact: function (items) {
                var html = '<div class="history-compact">';
                items.forEach(function (item, i) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-compact-row">';
                    html += '<span class="history-compact-num num">' + String(i + 1).padStart(2, '0') + '</span>';
                    html += '<span class="history-compact-query">' + esc(item.query) + '</span>';
                    html += '<span class="history-compact-when num">' + esc(timeAgo(item.ts)) + '</span></a>';
                });
                return html + '</div>';
            },
            timeline: function (items) { return timelineBody(items, function (item) {
                return '<a href="/research/' + esc(item.slug) + '" class="history-timeline-item">';
            }, function (item) { return item.query; }, function (item) { return timeAgo(item.ts); }); },
        },
        review: {
            spreadsheet: function (items) {
                var head = '<th scope="col" class="history-col-num">#</th><th scope="col">Product</th><th scope="col">Brand</th><th scope="col" class="history-col-num">Rating</th><th scope="col" class="history-col-num">Price</th><th scope="col">Report</th><th scope="col" class="history-col-date">Reviewed</th><th scope="col" class="history-col-open"><span class="sr-only">Open</span></th>';
                var body = items.map(function (item, i) {
                    var href = '/research/' + esc(item.slug);
                    return sheetRow(href,
                        '<td class="history-col-num num">' + (i + 1) + '</td>' +
                        '<td class="history-col-query">' + esc(item.name) + '</td>' +
                        '<td>' + esc(item.brand || '\u2014') + '</td>' +
                        '<td class="history-col-num num">' + esc(item.rating != null ? item.rating + '/5' : '\u2014') + '</td>' +
                        '<td class="history-col-num num">' + esc(item.price != null ? '$' + item.price : '\u2014') + '</td>' +
                        '<td>' + esc(item.query || '') + '</td>' +
                        '<td class="history-col-date num" title="' + esc(formatDate(item.ts)) + '">' + esc(timeAgo(item.ts)) + '</td>');
                }).join('');
                return tableWrap(head, body);
            },
            grid: function (items) {
                var html = '<div class="history-grid" style="grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))">';
                items.forEach(function (item) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-card">';
                    html += '<div class="history-card-top"><span class="text-overline uppercase text-accent">' + esc(item.category || 'Review') + '</span>';
                    if (item.rating != null) html += '<span class="font-mono text-caption text-ink-3 num">' + esc(item.rating) + '/5</span>';
                    html += '</div>';
                    html += '<h3 class="font-serif text-body font-semibold text-ink">' + esc(item.name) + '</h3>';
                    if (item.brand) html += '<p class="text-caption text-ink-3">' + esc(item.brand) + '</p>';
                    if (item.verdict) html += '<p class="mt-2 line-clamp-3 text-body-sm text-ink-2">' + esc(item.verdict) + '</p>';
                    html += '<p class="mt-2 text-caption text-ink-3">' + (item.price != null ? '$' + esc(item.price) + ' \u00b7 ' : '') + esc(item.query || '') + '</p></a>';
                });
                return html + '</div>';
            },
            compact: function (items) {
                var html = '<div class="history-compact">';
                items.forEach(function (item, i) {
                    html += '<a href="/research/' + esc(item.slug) + '" class="history-compact-row">';
                    html += '<span class="history-compact-num num">' + String(i + 1).padStart(2, '0') + '</span>';
                    html += '<span class="history-compact-query">' + esc(item.name) + (item.rating != null ? ' \u00b7 ' + item.rating + '/5' : '') + '</span>';
                    html += '<span class="history-compact-when num">' + esc(item.price != null ? '$' + item.price : timeAgo(item.ts)) + '</span></a>';
                });
                return html + '</div>';
            },
            timeline: function (items) { return timelineBody(items, function (item) {
                return '<a href="/research/' + esc(item.slug) + '" class="history-timeline-item">';
            }, function (item) { return item.name + (item.rating != null ? ' (' + item.rating + '/5)' : ''); }, function (item) { return timeAgo(item.ts); }); },
        },
        product: {
            spreadsheet: function (items) {
                var head = '<th scope="col" class="history-col-num">#</th><th scope="col">Product</th><th scope="col" class="history-col-num">Rating</th><th scope="col" class="history-col-num">Price</th><th scope="col">Best for</th><th scope="col" class="history-col-open"><span class="sr-only">Open</span></th>';
                var body = items.map(function (item) {
                    var href = item.href || ('#product-' + esc(item.id || item.rank));
                    return sheetRow(href,
                        '<td class="history-col-num num">' + esc(item.rank != null ? item.rank : '') + '</td>' +
                        '<td class="history-col-query">' + esc(item.name) + '</td>' +
                        '<td class="history-col-num num">' + esc(item.rating != null ? item.rating + '/5' : '\u2014') + '</td>' +
                        '<td class="history-col-num num">' + esc(item.price != null ? '$' + item.price : '\u2014') + '</td>' +
                        '<td>' + esc(item.best_for || '\u2014') + '</td>');
                }).join('');
                return tableWrap(head, body);
            },
            grid: function (items) {
                var html = '<div class="history-grid">';
                items.forEach(function (item) {
                    var href = item.href || ('#product-' + esc(item.id || item.rank));
                    html += '<a href="' + href + '" class="history-card">';
                    html += '<div class="history-card-top"><span class="text-overline uppercase text-accent">#' + esc(item.rank) + '</span>';
                    if (item.rating != null) html += '<span class="font-mono text-caption text-ink-3 num">' + esc(item.rating) + '/5</span>';
                    html += '</div><h3 class="font-serif text-body font-semibold text-ink">' + esc(item.name) + '</h3>';
                    if (item.best_for) html += '<p class="mt-2 text-body-sm text-ink-2">' + esc(item.best_for) + '</p>';
                    if (item.price != null) html += '<p class="mt-2 font-mono text-caption text-ink-3 num">$' + esc(item.price) + '</p>';
                    html += '</a>';
                });
                return html + '</div>';
            },
            compact: function (items) {
                var html = '<div class="history-compact">';
                items.forEach(function (item) {
                    var href = item.href || ('#product-' + esc(item.id || item.rank));
                    html += '<a href="' + href + '" class="history-compact-row">';
                    html += '<span class="history-compact-num num">' + String(item.rank || '').padStart(2, '0') + '</span>';
                    html += '<span class="history-compact-query">' + esc(item.name) + '</span>';
                    html += '<span class="history-compact-when num">' + esc(item.rating != null ? item.rating + '/5' : (item.price != null ? '$' + item.price : '')) + '</span></a>';
                });
                return html + '</div>';
            },
            timeline: function (items) {
                return '<div class="history-timeline"><div class="history-timeline-group"><div class="history-timeline-label">Ranked picks</div><ul class="history-timeline-list">' +
                    items.map(function (item) {
                        var href = item.href || ('#product-' + esc(item.id || item.rank));
                        return '<li><a href="' + href + '" class="history-timeline-item"><span class="history-timeline-dot" aria-hidden="true"></span><span class="history-timeline-text">#' + esc(item.rank) + ' ' + esc(item.name) + '</span><span class="history-timeline-when num">' + esc(item.rating != null ? item.rating + '/5' : '') + '</span></a></li>';
                    }).join('') + '</ul></div></div>';
            },
        },
    };

    function timelineBody(items, openTag, labelFn, whenFn) {
        var groups = [];
        var map = {};
        items.forEach(function (item) {
            var g = timelineGroup(item.ts);
            if (!map[g]) { map[g] = []; groups.push(g); }
            map[g].push(item);
        });
        var html = '<div class="history-timeline">';
        groups.forEach(function (g) {
            html += '<div class="history-timeline-group"><div class="history-timeline-label">' + esc(g) + '</div><ul class="history-timeline-list">';
            map[g].forEach(function (item) {
                html += '<li>' + openTag(item);
                html += '<span class="history-timeline-dot" aria-hidden="true"></span>';
                html += '<span class="history-timeline-text">' + esc(labelFn(item)) + '</span>';
                html += '<span class="history-timeline-when num">' + esc(whenFn(item)) + '</span></a></li>';
            });
            html += '</ul></div>';
        });
        return html + '</div>';
    }

    function renderBody(kind, layout, items) {
        var k = KINDS[kind] || KINDS.history;
        var fn = k[layout] || k.spreadsheet;
        return fn(items);
    }

    function wireToolbar(root, container, opts, layout) {
        root.querySelectorAll('.history-layout-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var next = btn.getAttribute('data-layout');
                if (!next || next === getLayout()) return;
                setLayout(next);
                paint(container, opts, next);
            });
        });
    }

    function paint(container, opts, layout) {
        layout = layout || getLayout();
        var kind = opts.kind || 'history';
        var items = opts.items || [];
        var showToolbar = opts.showToolbar !== false;
        var emptyMsg = opts.emptyMessage || 'Nothing to show yet.';

        if (items.length === 0) {
            container.innerHTML = (showToolbar ? renderToolbar(layout) : '') +
                '<p class="history-empty text-body-sm text-ink-3 text-center py-8">' + esc(emptyMsg) + '</p>';
            if (showToolbar) wireToolbar(container, container, opts, layout);
            return;
        }

        var html = '<div class="history-shell history-layout-' + esc(layout) + '">';
        if (showToolbar) html += renderToolbar(layout);
        html += '<div class="history-body">' + renderBody(kind, layout, items) + '</div></div>';
        container.innerHTML = html;

        if (layout === 'spreadsheet') wireSpreadsheetRows(container);
        if (showToolbar) wireToolbar(container, container, opts, layout);
        if (typeof opts.onLayoutChange === 'function') opts.onLayoutChange(layout);
    }

    function render(container, opts) {
        if (!container) return;
        paint(container, opts || {}, getLayout());
    }

    global.TrueRankLayouts = {
        render: render,
        getLayout: getLayout,
        setLayout: setLayout,
        LAYOUTS: LAYOUTS,
    };
})(typeof window !== 'undefined' ? window : globalThis);
