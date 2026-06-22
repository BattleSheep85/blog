/**
 * TrueRank frontend - theme toggle, example queries, and the live research
 * flow (submit -> queue -> SSE progress -> redirect). Reports are rendered
 * server-side at /research/:slug; on completion we always navigate there.
 */
(function () {
    'use strict';

    // -- Theme toggle (bootstrap that sets the initial class runs inline in
    //    <head> before paint; here we only wire the toggle button). ----------
    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        syncIcons(document.documentElement.classList.contains('dark'));
        themeToggle.addEventListener('click', function () {
            var isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            syncIcons(isDark);
        });
    }

    function syncIcons(isDark) {
        var moon = document.getElementById('icon-moon');
        var sun = document.getElementById('icon-sun');
        if (moon && sun) {
            moon.classList.toggle('hidden', !isDark);
            sun.classList.toggle('hidden', isDark);
        }
    }

    // -- Example queries --------------------------------------------------
    document.querySelectorAll('.example-query').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var input = document.getElementById('query-input');
            if (input) {
                input.value = this.dataset.query;
                input.focus();
            }
        });
    });

    // -- Deep-link prefill: /?q=... fills the search box (used by guides) --
    (function () {
        try {
            var preset = new URLSearchParams(window.location.search).get('q');
            if (preset && preset.length >= 3) {
                var qi = document.getElementById('query-input');
                if (qi) { qi.value = preset.slice(0, 500); qi.focus(); }
            }
        } catch (e) { /* ignore */ }
    })();

    // -- Search form ------------------------------------------------------
    var searchForms = document.querySelectorAll('form.search-form');
    searchForms.forEach(function (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var input = form.querySelector('input[name="query"]');
            var query = (input && input.value || '').trim();
            if (query.length < 3) return;
            startResearch(query);
        });
    });

    function setFormsBusy(busy) {
        searchForms.forEach(function (form) {
            var btn = form.querySelector('button[type="submit"]');
            var input = form.querySelector('input[name="query"]');
            if (input) input.disabled = busy;
            if (btn) {
                btn.disabled = busy;
                var label = btn.querySelector('[data-btn-label]');
                if (label) label.textContent = busy ? 'Reading reviews…' : 'Research it';
            }
        });
    }

    // Parse a response as JSON, but fail CLEARLY when the body isn't JSON. A
    // Cloudflare challenge/error page, an edge 5xx, or a rate-limit block all come
    // back as HTML — calling res.json() on those throws a cryptic
    // "Unexpected token '<'". We detect that up front and raise an actionable,
    // already-friendly message instead.
    function readJson(res) {
        var ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('application/json') !== -1) return res.json();
        return res.text().then(function () {
            var e = new Error(
                res.status === 429
                    ? 'Too many requests right now. Please wait a minute and try again.'
                    : res.status >= 500
                        ? 'The server is briefly busy. Please try again in a moment.'
                        : 'The request was interrupted (a security check or network hiccup). Please refresh and try again.'
            );
            e.handled = true; // message is already user-ready
            throw e;
        });
    }

    // Turn any thrown error into something a human can act on.
    function friendlyError(err, fallback) {
        var m = (err && err.message) || '';
        if (err && err.handled) return m;
        if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) {
            return 'Couldn’t reach the server. Check your connection and try again.';
        }
        if (/Unexpected token|JSON|DOCTYPE/i.test(m)) {
            return 'The server returned an unexpected response. Please try again in a moment.';
        }
        return fallback + (m ? ' (' + m + ')' : '');
    }

    function startResearch(query) {
        setFormsBusy(true);
        showSection('progress');
        clearProgress();
        addProgress('Submitting your question…');
        // Scroll the working area into view (hero search may be far up).
        scrollToEl(document.getElementById('progress-section'));

        fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query }),
        })
            .then(readJson)
            .then(function (data) {
                if (data.error) { showError(data.error); return; }
                if (data.cached && data.slug) {
                    addProgress('Found existing research. Redirecting…');
                    window.location.href = '/research/' + data.slug;
                    return;
                }
                addProgress('Queued. Connecting to the live read…');
                connectSSE(data.id, data.slug);
            })
            .catch(function (err) {
                showError(friendlyError(err, 'Could not start the research.'));
            });
    }

    function connectSSE(reportId, slug) {
        var done = false;
        var errorCount = 0;
        var source = new EventSource('/api/research/' + reportId + '/stream');

        source.onmessage = function (event) {
            errorCount = 0;
            var data;
            try { data = JSON.parse(event.data); } catch (e) { return; }

            if (data.type === 'progress') {
                addProgress(data.message);
            } else if (data.type === 'complete') {
                done = true;
                source.close();
                var dest = data.slug || slug;
                if (dest) {
                    addProgress('Done. Opening your report…');
                    window.location.href = '/research/' + dest;
                } else {
                    showError('Something went wrong — try again');
                }
            } else if (data.type === 'error') {
                done = true;
                source.close();
                showError(data.error);
            }
        };

        source.onerror = function () {
            if (done) return;
            errorCount++;
            if (errorCount > 5) {
                source.close();
                addProgress('Connection unstable. Switching to polling…');
                pollForResults(reportId, 0, slug);
            }
        };
    }

    function pollForResults(reportId, attempts, slug) {
        if (attempts > 120) { showError('Research timed out. Please try again.'); return; }
        fetch('/api/research/' + reportId)
            .then(readJson)
            .then(function (data) {
                if (data.status === 'completed') {
                    var dest = data.slug || slug;
                    if (dest) { window.location.href = '/research/' + dest; return; }
                    showError('Something went wrong — try again');
                } else if (data.status === 'error') {
                    showError(data.error || 'Research failed');
                } else {
                    if (data.progress) addProgress(data.progress.message);
                    setTimeout(function () { pollForResults(reportId, attempts + 1, slug); }, 2000);
                }
            })
            .catch(function () {
                setTimeout(function () { pollForResults(reportId, attempts + 1, slug); }, 3000);
            });
    }

    // -- UI helpers -------------------------------------------------------

    // Scroll respecting prefers-reduced-motion (an explicit behavior:'smooth'
    // in scrollIntoView overrides the CSS scroll-behavior guard, so gate here).
    function scrollToEl(el) {
        if (!el || !el.scrollIntoView) return;
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    function showSection(name) {
        ['progress', 'error'].forEach(function (s) {
            var el = document.getElementById(s + '-section');
            if (el) el.classList.toggle('hidden', s !== name);
        });
        ['how-it-works', 'landing-extra'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    function clearProgress() {
        var log = document.getElementById('progress-log');
        if (log) log.innerHTML = '';
    }

    function addProgress(message) {
        var log = document.getElementById('progress-log');
        if (!log) return;
        var entry = document.createElement('div');
        entry.className = 'progress-entry animate-fade-in';
        entry.textContent = message;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    function showError(message) {
        showSection('error');
        var el = document.getElementById('error-message');
        if (el) el.textContent = message || 'Something went wrong.';
        setFormsBusy(false);
    }

    // -- "Talk it out": chat-to-refine before running a research -----------
    (function () {
        var toggle = document.getElementById('talk-toggle');
        var section = document.getElementById('talk-section');
        var form = document.getElementById('talk-form');
        var input = document.getElementById('talk-input');
        var box = document.getElementById('talk-messages');
        var status = document.getElementById('talk-status');
        if (!toggle || !section || !form || !input || !box) return;

        var transcript = [];
        var busy = false;

        toggle.addEventListener('click', function () {
            var opening = section.classList.contains('hidden');
            section.classList.toggle('hidden');
            if (opening) {
                if (box.children.length === 0) {
                    bubble('assistant', "Tell me what you're trying to solve or buy — even vaguely — and I'll help you turn it into a researchable question.");
                }
                input.focus();
            }
        });

        function bubble(role, text) {
            var div = document.createElement('div');
            div.className = role === 'user'
                ? 'self-end max-w-[85%] rounded-lg bg-accent/15 px-3 py-2 text-body-sm text-ink whitespace-pre-wrap'
                : 'self-start max-w-[85%] rounded-lg bg-surface-2 px-3 py-2 text-body-sm text-ink-2 whitespace-pre-wrap';
            div.textContent = text;
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            return div;
        }

        function suggestButton(query) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'self-start rounded-lg bg-accent-strong px-3 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover';
            btn.textContent = 'Research: ' + query;
            btn.addEventListener('click', function () {
                var qi = document.getElementById('query-input');
                if (qi) qi.value = query;
                section.classList.add('hidden');
                startResearch(query);
            });
            box.appendChild(btn);
            box.scrollTop = box.scrollHeight;
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = (input.value || '').trim();
            if (!text || busy) return;
            busy = true;
            input.value = '';
            if (transcript.length >= 14) transcript = transcript.slice(transcript.length - 13);
            transcript.push({ role: 'user', content: text });
            bubble('user', text);
            var thinking = bubble('assistant', '…');
            if (status) status.textContent = '';

            fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: transcript }),
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
                .then(function (res) {
                    busy = false;
                    if (res.ok && res.d && res.d.reply) {
                        thinking.textContent = res.d.reply;
                        transcript.push({ role: 'assistant', content: res.d.reply });
                        if (res.d.suggestedQuery) suggestButton(res.d.suggestedQuery);
                    } else {
                        thinking.remove();
                        transcript.pop();
                        if (status) status.textContent = (res.d && res.d.error) || 'Something went wrong. Try again.';
                    }
                })
                .catch(function () {
                    busy = false;
                    thinking.remove();
                    transcript.pop();
                    if (status) status.textContent = 'Network error. Try again.';
                });
        });
    })();

    // Expose reset for the "Try again" button.
    window.resetUI = function () {
        showSection('none');
        ['how-it-works', 'landing-extra'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });
        setFormsBusy(false);
        scrollToEl(document.getElementById('hero'));
    };
})();
