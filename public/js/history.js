/**
 * Search history — localStorage first, server-backed when signed in.
 *
 * Anonymous visitors get a per-device list in localStorage (recorded by
 * app.js on every completed search). Signed-in visitors additionally get
 * their cross-device history from GET /api/history (server `user_searches`,
 * already recorded server-side on each run): we paint localStorage instantly,
 * then merge in the server list (server wins on dedupe) and show a "synced"
 * badge. Falls back cleanly to the localStorage view on any error.
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

    // Union by slug, preserving the first occurrence. Server items are passed
    // first so they win (they carry status/category and the canonical ts).
    function mergeBySlug() {
        var seen = Object.create(null);
        var out = [];
        for (var a = 0; a < arguments.length; a++) {
            var lst = arguments[a] || [];
            for (var i = 0; i < lst.length; i++) {
                var item = lst[i];
                if (!item || !item.slug || seen[item.slug]) continue;
                seen[item.slug] = true;
                out.push(item);
            }
        }
        out.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
        return out;
    }

    function fetchServer() {
        if (typeof fetch !== 'function') return Promise.resolve(null);
        return fetch('/api/history', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function paint(container, items, o, synced) {
        if (!global.TrueRankLayouts) return;
        TrueRankLayouts.render(container, {
            kind: 'history',
            items: items,
            emptyMessage: o.emptyMessage,
            showToolbar: o.showToolbar,
        });
        var existing = container.querySelector('[data-history-sync]');
        if (existing) existing.remove();
        if (synced) {
            container.insertAdjacentHTML(
                'afterbegin',
                '<p data-history-sync class="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent-quiet px-3 py-1 text-caption font-medium text-accent">'
                + '<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>'
                + 'Synced across your devices</p>'
            );
        }
    }

    function render(container, opts) {
        if (!container || !global.TrueRankLayouts) return;
        var o = opts || {};
        var local = o.items || load();

        // Instant paint from localStorage so the panel never flashes empty.
        paint(container, local, o, false);

        // Upgrade to the signed-in, cross-device view when available.
        fetchServer().then(function (res) {
            if (!res || !res.authed) return; // anonymous: keep localStorage view
            paint(container, mergeBySlug(res.items || [], local), o, true);
        }).catch(function () { /* keep localStorage view */ });
    }

    global.TrueRankHistory = {
        load: load,
        record: record,
        render: render,
        getLayout: function () { return TrueRankLayouts ? TrueRankLayouts.getLayout() : 'spreadsheet'; },
        setLayout: function (id) { if (TrueRankLayouts) TrueRankLayouts.setLayout(id); },
    };
})(typeof window !== 'undefined' ? window : globalThis);
