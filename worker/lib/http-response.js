/**
 * HTTP response helpers shared by worker/index.js and worker/routes/pages.js:
 * JSON/404/redirect/304 helpers, the CSP policy, per-request nonce generation,
 * security-header wrapping, HTML page serving, and static-asset serving.
 */

import { isNotModified } from './utils.js';

export function suggestJson(data) {
    return new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
            'Vary': 'Accept-Encoding',
        },
    });
}

// Plain-text 404 that still carries the standard security headers.
export function notFound() {
    return withSecurityHeaders(new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-store' },
    }), null);
}

export function redirect301(destUrl) {
    return new Response(null, {
        status: 301,
        headers: {
            'Location': destUrl.toString(),
            'Cache-Control': 'public, max-age=86400',
        },
    });
}

// Returns a 304 Not Modified if the client's If-Modified-Since covers the
// resource's last-modified timestamp (date math shared via lib/utils.js).
export function maybe304(ifModifiedSince, lastModifiedSec, cacheControl) {
    if (!isNotModified(ifModifiedSince, lastModifiedSec)) return null;
    return new Response(null, {
        status: 304,
        headers: {
            'Last-Modified': new Date(lastModifiedSec * 1000).toUTCString(),
            'Cache-Control': cacheControl || 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}

// --- HTML serving with a per-request CSP nonce -----------------------------
// Both static assets and server-rendered pages are templated with
// `__CSP_NONCE__` on every <script>. The worker swaps it for a fresh random
// nonce per request and sets a matching nonce + strict-dynamic CSP.

export const CSP = (nonce) =>
    "default-src 'self'; " +
    // AdSense display ads (googlesyndication/doubleclick) + Cloudflare beacon &
    // Turnstile are the only third-party script/frame origins. /find no longer
    // embeds a Google CSE widget (it 302-redirects to a plain Google search), so
    // the old cse.google.com / www.google.com / clients1.google.com grants are gone.
    // script-src uses nonce + strict-dynamic (Google's recommended "strict CSP"
    // for AdSense, answer/16283098) so the nonce'd loader transitively trusts the
    // ad scripts it injects — host allowlist entries here are ignored by modern
    // browsers but kept for non-strict-dynamic fallbacks. NOT adding 'unsafe-eval'
    // (Google lists it but it guts the CSP; revisit only on a confirmed eval CSP error).
    // fundingchoicesmessages.google.com = Google's certified GDPR consent message
    // (Funding Choices). Kept as a host fallback; under strict-dynamic the FC
    // script the nonce'd AdSense loader injects is already trusted transitively.
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    // connect-src governs AdSense's measurement/anti-fraud beacons (NOT covered by
    // strict-dynamic): impression/click pings (pagead2/doubleclick/tpc) + the
    // mandatory Ad Traffic Quality beacons (ep1/ep2.adtrafficquality.google).
    "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://www.google.com https://fundingchoicesmessages.google.com; " +
    // frame-src governs the ad creative iframes: doubleclick + SafeFrame
    // (tpc.googlesyndication.com) + some formats served from www.google.com +
    // the GDPR consent dialog (fundingchoicesmessages.google.com). If the live
    // console logs a CSP frame violation from another *.googlesyndication.com
    // host during EEA verification, add that exact host here.
    "frame-src https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

export function makeNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

export function withSecurityHeaders(res, nonce, body) {
    const headers = new Headers(res.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (nonce) headers.set('Content-Security-Policy', CSP(nonce));
    return new Response(body !== undefined ? body : res.body, { status: res.status, headers });
}

// Serve a server-rendered HTML page: nonce substitution, AdSense loader +
// Cloudflare Insights injection (nonce'd), Last-Modified, cache headers.
export function htmlPageResponse(body, env, { status = 200, lastModifiedSec, cacheControl } = {}) {
    const nonce = makeNonce();
    let out = body.replaceAll('__CSP_NONCE__', nonce);
    if (env.ADSENSE_PUBLISHER_ID) {
        out = out.replace('</head>', `<script async nonce="${nonce}" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${env.ADSENSE_PUBLISHER_ID}" crossorigin="anonymous"></script>\n</head>`);
    }
    if (env.CF_ANALYTICS_TOKEN) {
        out = out.replace('</body>', `<script defer nonce="${nonce}" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${env.CF_ANALYTICS_TOKEN}"}'></script></body>`);
    }
    const headers = new Headers({
        'Content-Type': 'text/html;charset=utf-8',
        'Content-Language': 'en',
        'Vary': 'Accept-Encoding',
    });
    if (lastModifiedSec) {
        headers.set('Last-Modified', new Date(lastModifiedSec * 1000).toUTCString());
    }
    if (cacheControl) {
        headers.set('Cache-Control', cacheControl);
    } else if (lastModifiedSec) {
        headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    } else if (status === 200) {
        headers.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=3600');
    } else {
        headers.set('Cache-Control', 'no-store');
    }
    return withSecurityHeaders(new Response(out, { status, headers }), nonce, out);
}

export async function serveAsset(request, env, overrideUrl) {
    const res = await env.ASSETS.fetch(overrideUrl ? new Request(overrideUrl, request) : request);
    if (res.status === 404 && !overrideUrl) {
        return notFound();
    }
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
        const nonce = makeNonce();
        const html = (await res.text()).replaceAll('__CSP_NONCE__', nonce);
        return withSecurityHeaders(res, nonce, html);
    }
    // The [assets] binding serves static files with `max-age=0, must-revalidate`,
    // forcing a conditional round-trip on every repeat visit. Override with a
    // cacheable policy. Filenames aren't content-hashed, so use stale-while-
    // revalidate: repeat loads are always instant (fresh, or stale served while a
    // background revalidate runs) and edits still propagate quickly. Media/fonts
    // effectively never change → long fresh window; css/js change on deploy → short
    // fresh window so updates land within ~an hour.
    const out = withSecurityHeaders(res, null);
    const pathname = new URL(overrideUrl || request.url).pathname;
    const longLived = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|webmanifest)$/i.test(pathname);
    out.headers.set('Cache-Control', longLived
        ? 'public, max-age=604800, stale-while-revalidate=2592000'
        : 'public, max-age=3600, stale-while-revalidate=604800');
    return out;
}
