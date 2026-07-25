/**
 * /history — client-side search history page (localStorage).
 * Signed-in users also have server-side history at /account.
 */

import { layout } from '../lib/html.js';

const HISTORY_PAGE_SCRIPT = `<script nonce="__CSP_NONCE__" src="/js/list-layouts.js"></script>
<script nonce="__CSP_NONCE__" src="/js/history.js"></script>
<script nonce="__CSP_NONCE__">
document.addEventListener('DOMContentLoaded',function(){
  var el=document.getElementById('history-list');
  if(el&&window.TrueRankHistory)TrueRankHistory.render(el,{
    emptyMessage:'Nothing here yet. Every search you run on this device shows up here automatically.'
  });
});
</script>`;

export function renderHistoryPage() {
    const body = `<div class="grid-bg border-b border-line">
<div class="mx-auto max-w-5xl px-6 py-16">
<p class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Log &middot; Local search history</p>
<h1 class="mt-2 font-serif text-h1 font-semibold text-ink">Your searches</h1>
<p class="mt-2 text-body text-ink-2">Research you\u2019ve run on this device. <a href="/account" class="font-medium text-accent hover:text-accent-hover">Sign in</a> to sync across devices.</p>
</div>
</div>
<div class="mx-auto max-w-5xl px-6 py-10">
<div id="history-list" aria-live="polite"></div>
<p class="mt-8 font-mono text-[11px] uppercase tracking-widest text-ink-3"><a href="/" class="text-accent hover:text-accent-hover">\u2190 Start a new search</a></p>
</div>`;

    return layout(
        'Your searches',
        'Your past TrueRank searches on this device.',
        body,
        '<meta name="robots" content="noindex, follow">' + HISTORY_PAGE_SCRIPT,
        { canonical: 'https://chrisputer.tech/history' },
    );
}
