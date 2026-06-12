/**
 * /find?q=... — monetized web-search hand-off for things Amazon doesn't sell
 * (lumber, vehicles, local services, ...).
 *
 * With GOOGLE_CSE_ID configured, renders Google Programmable Search results
 * on-site — the CSE is linked to our AdSense account, so AdSense-for-Search
 * ads on the results monetize the click. Without it, degrades to a plain
 * 302 to google.com so the CTA always works.
 *
 * Every render logs a guide_click (network 'google') so /metrics can show how
 * much non-Amazon CTA traffic we're sending.
 */

import { layout } from '../lib/html.js';
import { escapeHtml } from '../lib/utils.js';
import { logGuideClick } from '../lib/db.js';
import { checkRateLimit } from '../lib/rate-limit.js';

export async function handleFind(request, url, env) {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const ref = (url.searchParams.get('ref') || '').slice(0, 80);

    // Best-effort analytics; never block or break the page. Logging (not the
    // page itself) is throttled per IP so a scripted loop can't flood D1 with
    // junk guide_clicks rows or skew the /metrics google-click counts.
    try {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const lim = await checkRateLimit(env.KV, `find:${ip}`, 30, 3600);
        if (lim.allowed) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
            const ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
            await logGuideClick(env.DB, { guideSlug: ref || 'find', productQuery: q, network: 'google', ipHash });
        }
    } catch (err) {
        console.error('[find] click log failed:', err instanceof Error ? err.message : String(err));
    }

    // No Programmable Search Engine configured → plain Google hand-off.
    if (!env.GOOGLE_CSE_ID) {
        const dest = q
            ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
            : 'https://www.google.com/';
        return new Response(null, {
            status: 302,
            headers: { 'Location': dest, 'Cache-Control': 'no-store' },
        });
    }

    const title = q ? `Where to find: ${q}` : 'Search the web';
    const body = `<div class="container mx-auto max-w-4xl px-6 py-12">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--ink-2);margin-bottom:1rem">
<a href="/" style="color:var(--ink-2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--ink-3)">/</span>
<span style="color:var(--ink)">Find</span>
</nav>
<h1 class="font-serif text-h2 font-semibold text-ink">${escapeHtml(q ? `Where to find: ${q}` : 'Search the web')}</h1>
<p class="mt-2 text-body-sm text-ink-2">This category isn't sold on Amazon, so here's the open web. Results below are from Google${ref ? ` — sent from <a href="/research/${escapeHtml(ref)}" style="color:var(--accent)">your research report</a>` : ''}.</p>
<div class="mt-6 rounded-xl border border-line bg-surface-1 p-4 shadow-card" style="min-height:24rem">
<div class="gcse-searchresults-only" data-queryParameterName="q"></div>
</div>
</div>`;

    const cseScript = `<script async nonce="__CSP_NONCE__" src="https://cse.google.com/cse.js?cx=${encodeURIComponent(env.GOOGLE_CSE_ID)}"></script>`;
    const html = layout(title, 'Find suppliers and sellers across the web.', body, '<meta name="robots" content="noindex, follow">' + cseScript, {
        canonical: 'https://chrisputer.tech/find',
    });
    return html;
}
