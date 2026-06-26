/**
 * Client-side search history — wraps TrueRankLayouts (localStorage).
 */
(function (global) {
    'use strict';

    var KEY = 'truerank_history';
    var MAX = 50;

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

    function record(slug, query) {
        if (!slug || !query) return;
        var q = String(query).trim().slice(0, 500);
        if (q.length < 3) return;
        var list = load().filter(function (item) { return item.slug !== slug; });
        list.unshift({ slug: slug, query: q, ts: Date.now() });
        save(list);
    }

    function render(container, opts) {
        if (!container || !global.TrueRankLayouts) return;
        var o = opts || {};
        TrueRankLayouts.render(container, {
            kind: 'history',
            items: o.items || load(),
            emptyMessage: o.emptyMessage,
            showToolbar: o.showToolbar,
        });
    }

    global.TrueRankHistory = {
        load: load,
        record: record,
        render: render,
        getLayout: function () { return TrueRankLayouts ? TrueRankLayouts.getLayout() : 'spreadsheet'; },
        setLayout: function (id) { if (TrueRankLayouts) TrueRankLayouts.setLayout(id); },
    };
})(typeof window !== 'undefined' ? window : globalThis);
