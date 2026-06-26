/**
 * Client-side search history (localStorage) with toggleable list layouts.
 */
(function (global) {
    'use strict';

    var KEY = 'truerank_history';
    var LAYOUT_KEY = 'truerank_history_layout';
    var MAX = 50;

    var LAYOUTS = [
        { id: 'spreadsheet', label: 'Spreadsheet', title: 'SAP / Excel-style table' },
        { id: 'grid', label: 'Cards', title: 'Card grid' },
        { id: 'compact', label: 'Compact', title: 'Dense single-column list' },
        { id: 'timeline', label: 'Timeline', title: 'Grouped by date' },
    ];

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return [];
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function save(list) {
        try {
            localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
        } catch (e) { /* quota / private mode */ }
    }

    function getLayout() {
        try {
            var v = localStorage.getItem(LAYOUT_KEY);
            if (v && LAYOUTS.some(function (l) { return l.id === v; })) return v;
        } catch (e) { /* ignore */ }
        return 'spreadsheet';
    }

    function setLayout(id) {
        if (!LAYOUTS.some(function (l) { return l.id === id; })) return;
        try { localStorage.setItem(LAYOUT_KEY, id); } catch (e) { /* ignore */ }
    }

    function record(slug, query) {
        if (!slug || !query) return;
        var q = String(query).trim().slice(0, 500);
        if (q.length < 3) return;
        var list = load().filter(function (item) { return item.slug !== slug; });
        list.unshift({ slug: slug, query: q, ts: Date.now() });
        save(list);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function timeAgo(ts) {
        var sec = Math.floor((Date.now() - ts) / 1000);
        if (sec < 60) return 'just now';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
        return new Date(ts).toLocaleDateString();
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    }

    function timelineGroup(ts) {
        var d = new Date(ts);
        var now = new Date();
        var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var startYesterday = startToday - 86400000;
        var startWeek = startToday - 6 * 86400000;
        var t = d.getTime();
        if (t >= startToday) return 'Today';
        if (t >= startYesterday) return 'Yesterday';
        if (t >= startWeek) return 'This week';
        return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }

    function rowLink(item) {
        return '/research/' + esc(item.slug);
    }

    function renderSpreadsheet(list) {
        var html = '<div class="history-spreadsheet-wrap"><table class="history-spreadsheet"><thead><tr>';
        html += '<th scope="col" class="history-col-num">#</th>';
        html += '<th scope="col">Query</th>';
        html += '<th scope="col" class="history-col-date">Last searched</th>';
        html += '<th scope="col" class="history-col-open"><span class="sr-only">Open</span></th>';
        html += '</tr></thead><tbody>';
        list.forEach(function (item, i) {
            html += '<tr class="history-row-link" tabindex="0" role="link" data-href="' + rowLink(item) + '">';
            html += '<td class="history-col-num num">' + (i + 1) + '</td>';
            html += '<td class="history-col-query">' + esc(item.query) + '</td>';
            html += '<td class="history-col-date num" title="' + esc(formatDate(item.ts)) + '">' + esc(timeAgo(item.ts)) + '</td>';
            html += '<td class="history-col-open num" aria-hidden="true">\u2192</td>';
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function renderGrid(list) {
        var html = '<div class="history-grid">';
        list.forEach(function (item) {
            html += '<a href="' + rowLink(item) + '" class="history-card">';
            html += '<div class="history-card-top"><span class="text-overline uppercase text-accent">Research</span>';
            html += '<span class="font-mono text-caption text-ink-3 num">' + esc(timeAgo(item.ts)) + '</span></div>';
            html += '<h3 class="font-serif text-body font-semibold text-ink">' + esc(item.query) + '</h3>';
            html += '</a>';
        });
        html += '</div>';
        return html;
    }

    function renderCompact(list) {
        var html = '<div class="history-compact">';
        list.forEach(function (item, i) {
            html += '<a href="' + rowLink(item) + '" class="history-compact-row">';
            html += '<span class="history-compact-num num">' + String(i + 1).padStart(2, '0') + '</span>';
            html += '<span class="history-compact-query">' + esc(item.query) + '</span>';
            html += '<span class="history-compact-when num">' + esc(timeAgo(item.ts)) + '</span>';
            html += '</a>';
        });
        html += '</div>';
        return html;
    }

    function renderTimeline(list) {
        var groups = [];
        var map = {};
        list.forEach(function (item) {
            var g = timelineGroup(item.ts);
            if (!map[g]) {
                map[g] = [];
                groups.push(g);
            }
            map[g].push(item);
        });
        var html = '<div class="history-timeline">';
        groups.forEach(function (g) {
            html += '<div class="history-timeline-group">';
            html += '<div class="history-timeline-label">' + esc(g) + '</div>';
            html += '<ul class="history-timeline-list">';
            map[g].forEach(function (item) {
                html += '<li><a href="' + rowLink(item) + '" class="history-timeline-item">';
                html += '<span class="history-timeline-dot" aria-hidden="true"></span>';
                html += '<span class="history-timeline-text">' + esc(item.query) + '</span>';
                html += '<span class="history-timeline-when num">' + esc(timeAgo(item.ts)) + '</span>';
                html += '</a></li>';
            });
            html += '</ul></div>';
        });
        html += '</div>';
        return html;
    }

    var RENDERERS = {
        spreadsheet: renderSpreadsheet,
        grid: renderGrid,
        compact: renderCompact,
        timeline: renderTimeline,
    };

    function renderBody(list, layout) {
        var fn = RENDERERS[layout] || renderSpreadsheet;
        return fn(list);
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

    function wireToolbar(root, container, list, opts) {
        root.querySelectorAll('.history-layout-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var next = btn.getAttribute('data-layout');
                if (!next || next === getLayout()) return;
                setLayout(next);
                paint(container, list, opts, next);
            });
        });
    }

    function paint(container, list, opts, layout) {
        layout = layout || getLayout();
        var showToolbar = !opts || opts.showToolbar !== false;
        var emptyMsg = (opts && opts.emptyMessage) || 'No searches yet. Run a query above and it\u2019ll show up here.';

        if (list.length === 0) {
            container.innerHTML = (showToolbar ? renderToolbar(layout) : '') +
                '<p class="history-empty text-body-sm text-ink-3 text-center py-8">' + esc(emptyMsg) + '</p>';
            if (showToolbar) wireToolbar(container, container, list, opts);
            return;
        }

        var html = '<div class="history-shell history-layout-' + esc(layout) + '">';
        if (showToolbar) html += renderToolbar(layout);
        html += '<div class="history-body">' + renderBody(list, layout) + '</div></div>';
        container.innerHTML = html;

        if (layout === 'spreadsheet') wireSpreadsheetRows(container);
        if (showToolbar) wireToolbar(container, container, list, opts);
    }

    function render(container, opts) {
        if (!container) return;
        var list = (opts && opts.items) ? opts.items : load();
        paint(container, list, opts || {});
    }

    global.TrueRankHistory = {
        load: load,
        record: record,
        render: render,
        getLayout: getLayout,
        setLayout: setLayout,
        LAYOUTS: LAYOUTS,
    };
})(typeof window !== 'undefined' ? window : globalThis);
