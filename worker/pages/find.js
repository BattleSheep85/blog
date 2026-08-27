/**
 * /find?q=... — web-search hand-off for things Amazon doesn't sell (lumber,
 * vehicles, local services, ...).
 *
 * Always a plain 302 to a real Google search so the CTA reliably works. We
 * previously embedded a Google Programmable Search (CSE) widget here to monetize
 * via AdSense-for-Search — but AFS isn't available to this (post-2022) AdSense
 * account, so the embed earned nothing and the CSE widget errored client-side
 * instead of showing results. Redirecting is what users expect and never breaks.
 *
 * Every hand-off logs a guide_click (network 'google') so /metrics can show how
 * much non-Amazon CTA traffic we send.
 */

import { logGuideClick } from '../lib/db.js';
import { checkRateLimit, ipRateKey } from '../lib/rate-limit.js';

export async function handleFind(request, url, env) {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const ref = (url.searchParams.get('ref') || '').slice(0, 80);

    // Best-effort analytics; never block or break the redirect. Logging (not the
    // redirect) is throttled per IP so a scripted loop can't flood guide_clicks.
    try {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = await ipRateKey('find', ip, env);
        const lim = await checkRateLimit(env.KV, rateKey, 30, 3600);
        if (lim.allowed) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
            const ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
            await logGuideClick(env.DB, { guideSlug: ref || 'find', productQuery: q, network: 'google', ipHash });
        }
    } catch (err) {
        console.error('[find] click log failed:', err instanceof Error ? err.message : String(err));
    }

    const dest = q
        ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
        : 'https://www.google.com/';
    return new Response(null, {
        status: 302,
        headers: { 'Location': dest, 'Cache-Control': 'no-store' },
    });
}
