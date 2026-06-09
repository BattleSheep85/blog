/**
 * TrueRank — Cloudflare Worker entry point.
 * Routes HTTP requests and processes Queue messages.
 */

import { handleStartResearch, handleResearchStatus, handleResearchStream } from './handlers/research.js';
import { handleGetReport, handleFeedback } from './handlers/report.js';
import { handleAffiliateClick, handleAffiliateSearch } from './handlers/affiliate.js';
import { runResearchPipeline } from './pipeline/orchestrator.js';

export default {
    /**
     * HTTP request handler — routes to appropriate handler.
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }

        try {
            // API routes
            if (path === '/api/research' && method === 'POST') {
                return handleStartResearch(request, env);
            }

            const streamMatch = path.match(/^\/api\/research\/([a-z0-9]+)\/stream$/);
            if (streamMatch && method === 'GET') {
                return handleResearchStream(streamMatch[1], env, request);
            }

            const researchMatch = path.match(/^\/api\/research\/([a-z0-9]+)$/);
            if (researchMatch && method === 'GET') {
                return handleResearchStatus(researchMatch[1], env);
            }

            const reportMatch = path.match(/^\/api\/report\/([a-z0-9]+)$/);
            if (reportMatch && method === 'GET') {
                return handleGetReport(reportMatch[1], env);
            }

            if (path === '/api/feedback' && method === 'POST') {
                return handleFeedback(request, env);
            }

            // Search-based affiliate redirect for static guide pages.
            // Must be checked before the generic /api/go/:id route below.
            if (path === '/api/go/search' && method === 'GET') {
                return handleAffiliateSearch(request, env);
            }

            const affiliateMatch = path.match(/^\/api\/go\/([a-z0-9]+)$/);
            if (affiliateMatch && method === 'GET') {
                return handleAffiliateClick(affiliateMatch[1], request, env);
            }

            // Static assets. HTML responses get a fresh per-request CSP nonce
            // injected, so inline + first-party scripts run under strict-dynamic.
            // Permalink /report/:id has no asset of its own; render report.html
            // (served at /report, which avoids the .html redirect).
            if (path === '/report' || path.startsWith('/report/')) {
                return serveAsset(request, env, new URL('/report', url));
            }
            return serveAsset(request, env, null);

        } catch (err) {
            console.error('Request error:', err);
            return new Response(JSON.stringify({ error: 'Internal server error' }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },

    /**
     * Queue message handler — processes research jobs.
     */
    async queue(batch, env) {
        for (const message of batch.messages) {
            const { reportId, query } = message.body;
            try {
                await runResearchPipeline(env, reportId, query);
                message.ack();
            } catch (err) {
                console.error(`Queue processing error for ${reportId}:`, err);
                message.retry();
            }
        }
    },
};

// --- Static asset serving with a per-request CSP nonce -------------------
// HTML is templated with `__CSP_NONCE__` on every <script>. The worker swaps
// it for a fresh random nonce per request and sets a matching nonce + strict
// -dynamic CSP, so inline and first-party scripts run while injected ones do
// not. Allowed hosts mirror the production policy (AdSense, Cloudflare).

const CSP = (nonce) =>
    "default-src 'self'; " +
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://pagead2.googlesyndication.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; " +
    "frame-src https://challenges.cloudflare.com https://googleads.g.doubleclick.net; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

function makeNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function withSecurityHeaders(res, nonce, body) {
    const headers = new Headers(res.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (nonce) headers.set('Content-Security-Policy', CSP(nonce));
    return new Response(body !== undefined ? body : res.body, { status: res.status, headers });
}

async function serveAsset(request, env, overrideUrl) {
    const res = await env.ASSETS.fetch(overrideUrl ? new Request(overrideUrl, request) : request);
    if (res.status === 404 && !overrideUrl) {
        return new Response('Not found', { status: 404 });
    }
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
        const nonce = makeNonce();
        const html = (await res.text()).replaceAll('__CSP_NONCE__', nonce);
        return withSecurityHeaders(res, nonce, html);
    }
    return withSecurityHeaders(res, null);
}
