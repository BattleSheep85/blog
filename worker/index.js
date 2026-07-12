/**
 * TrueRank — Cloudflare Worker entry point.
 * Routes HTTP requests and processes Queue messages.
 * Server-rendered pages live under /research/:slug (permanent); the legacy
 * client-rendered /report/:id permalinks 301 there.
 */

import {
    handleStartResearch, handleResearchStatus, handleResearchStream, handleResearchEvents,
} from './handlers/research.js';
import { handleStartVerify, handleVerifyStatus } from './handlers/verify.js';
import { renderVerifyEntryPage, renderVerifyResultPage } from './pages/verify-page.js';
import { handleGetReport, handleFeedback } from './handlers/report.js';
import { handleAffiliateClick, handleAffiliateSearch } from './handlers/affiliate.js';
import { handleProductImage } from './handlers/image.js';
import { runResearchPipeline, monthlySpendUsd, monthlyBudgetUsd } from './pipeline/orchestrator.js';
import { runVerificationPipeline } from './pipeline/verify-orchestrator.js';
import { renderResearchResult } from './pages/research-page.js';
import { renderClarifyPage, extractClarifications } from './pages/clarify.js';
import { classifyQuery, userFacingRejection, defaultQuestionsForQuery } from './lib/classifier.js';
import { screenQuery, rejectionMessage } from './lib/safety.js';
import { renderBrowse } from './pages/browse.js';
import { renderHistoryPage } from './pages/history.js';
import { renderCategoryHub } from './pages/category.js';
import { handleSubscribe } from './handlers/subscribe.js';
import { handleUnsubscribe } from './handlers/unsubscribe.js';
import { handleChat } from './handlers/chat.js';
import { handleNextJob, handleProgress, handleComplete } from './handlers/internal.js';
import { handleSignup, handleLogin, handleLogout, renderLoginPage, renderAccountPage } from './handlers/auth.js';
import { getSessionUser, getUserSearches } from './lib/auth.js';
import { handleFind } from './pages/find.js';
import { renderReviewsPage } from './pages/reviews.js';
import { handleMetrics } from './pages/metrics.js';
import { runFlywheelTick } from './lib/keywords.js';
import { ingestGsc } from './lib/gsc.js';
import { getLatestResearchLastmod, generateSitemap, generateAtomFeed, generateOgImage } from './lib/sitemap.js';
import { getResearchById } from './lib/db.js';
import { displayQuery, escapeLikeWildcards, publicResearchFilter, canonicalizeQuery, isNotModified } from './lib/utils.js';
import { GUIDES_LASTMOD } from './lib/guides.js';

// Bump when the page template/schema shape changes in a way that should
// invalidate every KV-cached HTML blob. Old keys age out on their own TTL.
const CACHE_VERSION = 'tr9';

// Phase-B cutover flag: when 'true', the off-Cloudflare research worker is the
// primary processor — the queue consumer defers (acks without processing,
// leaving the row pending for the worker to claim) and a cron fallback handles
// any pending row the worker hasn't picked up in ~5 min (homelab-down safety).
function externalWorkerEnabled(env) {
  const v = env.EXTERNAL_WORKER_ENABLED;
  return v === true || v === 'true' || v === '1';
}

// Dev-only HTTP Basic Auth wall. Active ONLY when BOTH DEV_AUTH_USER and
// DEV_AUTH_PASS are set in the environment — production never sets them, so this
// is a complete no-op there. When active it guards the ENTIRE surface (pages,
// API, assets) so the unshipped extraction build stays private. Returns a 401
// Response to short-circuit, or null to allow the request through.
function requireDevAuth(request, env) {
  const user = env.DEV_AUTH_USER;
  const pass = env.DEV_AUTH_PASS;
  if (!user || !pass) return null; // gate disabled (e.g. production)
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch { decoded = ''; }
    const idx = decoded.indexOf(':');
    if (idx >= 0 && decoded.slice(0, idx) === user && decoded.slice(idx + 1) === pass) {
      return null; // credentials valid
    }
  }
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="TrueRank Dev", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export default {
    /**
     * HTTP request handler — routes to appropriate handler.
     */
    async fetch(request, env, ctx) {
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

        // Dev-only password wall (no-op in production — see requireDevAuth).
        const devAuth = requireDevAuth(request, env);
        if (devAuth) return devAuth;

        try {
            // ── API routes ──────────────────────────────────────────────────
            if (path === '/api/research' && method === 'POST') {
                return handleStartResearch(request, env);
            }

            // Product-verification (Truth Audit) intake + poll. Additive —
            // separate handler/pipeline from the ranking flow above.
            if (path === '/api/verify' && method === 'POST') {
                return handleStartVerify(request, env);
            }

            const verifyPollMatch = path.match(/^\/api\/verify\/([a-z0-9-]+)$/);
            if (verifyPollMatch && method === 'GET') {
                return handleVerifyStatus(verifyPollMatch[1], env);
            }

            // Pre-research classify: powers the inquisitive UX. The home search box
            // calls this first; if the query has need-questions the client shows them
            // (with a one-tap "Just search for it" skip) before starting research.
            // Fail-OPEN — any error returns accept:true with no questions so research
            // is never blocked. KV-cached classify, so this is cheap/fast.
            if (path === '/api/classify' && method === 'POST') {
                let cbody;
                try { cbody = await request.json(); } catch { cbody = {}; }
                const cq = String(cbody.query || '').trim();
                const jres = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
                if (cq.length < 3 || cq.length > 500) return jres({ accept: true, clarifying_questions: defaultQuestionsForQuery(cq) });
                // Deterministic safety screen first (fail-closed, can't be jailbroken/fail-opened).
                const s = screenQuery(cq);
                if (s.blocked) return jres({ accept: false, reject_message: rejectionMessage(s.reason), clarifying_questions: [] });
                try {
                    const c = await classifyQuery(env, cq, null);
                    if (!c.accept) return jres({ accept: false, reject_message: userFacingRejection(c.reject_reason), clarifying_questions: [] });
                    return jres({ accept: true, clarifying_questions: c.clarifying_questions || [], suggested_refinement: c.suggested_refinement || null });
                } catch {
                    return jres({ accept: true, clarifying_questions: defaultQuestionsForQuery(cq) }); // fail-open
                }
            }

            const eventsMatch = path.match(/^\/api\/research\/([a-z0-9-]+)\/events$/);
            if (eventsMatch && method === 'GET') {
                return handleResearchEvents(eventsMatch[1], url, env);
            }

            const streamMatch = path.match(/^\/api\/research\/([a-z0-9-]+)\/stream$/);
            if (streamMatch && method === 'GET') {
                return handleResearchStream(streamMatch[1], env, request);
            }

            const researchMatch = path.match(/^\/api\/research\/([a-z0-9-]+)$/);
            if (researchMatch && method === 'GET') {
                return handleResearchStatus(researchMatch[1], env);
            }

            const reportMatch = path.match(/^\/api\/report\/([a-z0-9-]+)$/);
            if (reportMatch && method === 'GET') {
                return handleGetReport(reportMatch[1], env);
            }

            if (path === '/api/feedback' && method === 'POST') {
                return handleFeedback(request, env);
            }

            // Email capture for "notify me when research completes / re-runs".
            if (path === '/api/subscribe' && method === 'POST') {
                return handleSubscribe(request, env);
            }

            // Self-serve one-click unsubscribe (GET link + RFC 8058 POST).
            if (path === '/unsubscribe' && (method === 'GET' || method === 'POST')) {
                return handleUnsubscribe(request, env);
            }

            // "Talk about it" chat — refine a query (home) or ask follow-ups
            // grounded in a completed report (research pages).
            if (path === '/api/chat' && method === 'POST') {
                return handleChat(request, env);
            }

            // Per-user search history (server-backed, cross-device). The "Your
            // searches" tab + /history page hit this; signed-out users get
            // {authed:false} and the client falls back to localStorage. Epoch
            // seconds are normalized to ms to match the localStorage shape.
            if (path === '/api/history' && method === 'GET') {
                const jres = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
                const user = await getSessionUser(request, env);
                if (!user) return jres({ authed: false, items: [] });
                try {
                    const rows = await getUserSearches(env.DB, user.id, 50);
                    const items = rows
                        .filter((r) => r && r.slug)
                        .map((r) => ({ slug: r.slug, query: r.query, ts: (r.created_at || 0) * 1000, status: r.status || null, category: r.category || null }));
                    return jres({ authed: true, email: user.email, items });
                } catch (err) {
                    console.error('[history] lookup failed:', err instanceof Error ? err.message : String(err));
                    return jres({ authed: true, email: user.email, items: [] });
                }
            }

            // Internal API for the off-Cloudflare research worker (track 2).
            // Both gated by the X-Worker-Secret header == env.WORKER_SECRET.
            if (path === '/api/internal/next-job' && method === 'POST') return handleNextJob(request, env);
            if (path === '/api/internal/progress' && method === 'POST') return handleProgress(request, env);
            if (path === '/api/internal/complete' && method === 'POST') return handleComplete(request, env);

            // Accounts: email/password sessions + per-user search history.
            if (path === '/api/auth/signup' && method === 'POST') return handleSignup(request, env);
            if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env);
            if (path === '/api/auth/logout' && method === 'POST') return handleLogout(request, env);

            // Pull-based metrics snapshot (Bearer-token auth via METRICS_TOKEN).
            if (path === '/metrics' && method === 'GET') {
                return handleMetrics(request, env);
            }

            // Autocomplete for the server-rendered search bars. LIKE-based in
            // phase 1; phase 3 swaps in FTS5.
            if (path === '/api/search/suggest' && method === 'GET') {
                return handleSearchSuggest(url, env);
            }

            // Search-based affiliate redirect for static guide pages.
            // Must be checked before the generic /api/go/:id route below.
            if (path === '/api/go/search' && method === 'GET') {
                return handleAffiliateSearch(request, env);
            }

            const affiliateMatch = path.match(/^\/api\/go\/([a-z0-9-]+)$/);
            if (affiliateMatch && method === 'GET') {
                return handleAffiliateClick(affiliateMatch[1], request, env);
            }

            // Product image proxy (defeats hotlink/Referer blocks; edge-cached).
            const imgMatch = path.match(/^\/api\/img\/([a-z0-9-]+)$/);
            if (imgMatch && method === 'GET') {
                return handleProductImage(imgMatch[1], env);
            }

            // ── Feeds (replace the old static public/sitemap.xml) ───────────
            const isGetLike = method === 'GET' || method === 'HEAD';
            if (path === '/sitemap.xml' && isGetLike) {
                return withSecurityHeaders(
                    await generateSitemap(url.origin, env, request.headers.get('If-Modified-Since'), GUIDES_LASTMOD),
                    null,
                );
            }
            if (path === '/feed.xml' && isGetLike) {
                return withSecurityHeaders(
                    await generateAtomFeed(url.origin, env, request.headers.get('If-Modified-Since')),
                    null,
                );
            }

            // Search forms submit via GET; action buttons (re-run) via POST.
            if (path === '/research/new' && (isGetLike || method === 'POST')) {
                return handleNewResearch(request, url, env);
            }

            // ── Server-rendered pages ───────────────────────────────────────
            if (isGetLike) {
                // Account pages — always per-user, never cached.
                if (path === '/login' || path === '/account') {
                    const page = path === '/login'
                        ? await renderLoginPage(request, env)
                        : await renderAccountPage(request, env);
                    if (page instanceof Response) return page; // auth redirect
                    return htmlPageResponse(page, env, { cacheControl: 'no-store' });
                }

                if (path === '/history' || path === '/history/') {
                    return htmlPageResponse(renderHistoryPage(), env, { cacheControl: 'no-store' });
                }

                // Monetized Google hand-off for not-sold-on-Amazon categories.
                if (path === '/find') {
                    const page = await handleFind(request, url, env);
                    if (page instanceof Response) return withSecurityHeaders(page, null);
                    return htmlPageResponse(page, env, { cacheControl: 'no-store' });
                }

                const ogMatch = path.match(/^\/research\/([a-z0-9-]+)\/og\.svg$/);
                if (ogMatch) {
                    return withSecurityHeaders(await generateOgImage(ogMatch[1], env), null);
                }

                // Sitewide product-review directory.
                if (path === '/reviews' || path === '/reviews/') {
                    const html = await renderReviewsPage(url, env);
                    if (!html) return notFound();
                    return htmlPageResponse(html, env, {
                        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
                    });
                }

                if (path === '/research' || path === '/research/') {
                    const [html, latestLm] = await Promise.all([
                        renderBrowse(url, env),
                        getLatestResearchLastmod(env, CACHE_VERSION),
                    ]);
                    const listingCc = 'public, max-age=60, s-maxage=60, stale-while-revalidate=3600';
                    const notModified = maybe304(request.headers.get('If-Modified-Since'), latestLm, listingCc);
                    if (notModified) return notModified;
                    return htmlPageResponse(html, env, { lastModifiedSec: latestLm, cacheControl: listingCc });
                }

                const slugMatch = path.match(/^\/research\/([a-z0-9-]+)$/);
                if (slugMatch) {
                    return handleResearchPage(slugMatch[1], url, request, env, ctx);
                }

                // Product-verification pages. /verify is the entry form; /verify/:slug
                // is a live "verifying…" poll page until complete, then the minimal
                // report (worker/pages/verify-page.js). Never KV-cached (mirrors the
                // ranking page's cache split, but verification volume is low enough
                // that a page cache isn't worth the complexity yet).
                if (path === '/verify' || path === '/verify/') {
                    return htmlPageResponse(renderVerifyEntryPage(), env, { cacheControl: 'no-store' });
                }
                const verifySlugMatch = path.match(/^\/verify\/([a-z0-9-]+)$/);
                if (verifySlugMatch) {
                    const result = await renderVerifyResultPage(verifySlugMatch[1], env);
                    if (!result) return notFound();
                    return htmlPageResponse(result.html, env, { cacheControl: 'no-store' });
                }

                // Legacy permalinks. Old ids were 16-char [a-z0-9]; the old
                // tables are gone, but if an id happens to match a v2 research
                // row, send the visitor to its permanent page.
                if (path === '/report' || path === '/report/') {
                    return redirect301(new URL('/research', url.origin));
                }
                const legacyMatch = path.match(/^\/report\/([a-z0-9]+)/);
                if (legacyMatch) {
                    const row = await getResearchById(env.DB, legacyMatch[1]).catch(() => null);
                    return redirect301(new URL(row ? `/research/${row.slug}` : '/research', url.origin));
                }

                // Category hubs: /best/:slug. Static guide assets (e.g.
                // /best/mechanical-keyboards-under-100/) must keep winning, so
                // we probe ASSETS first and only fall back to the dynamic hub
                // when the asset genuinely 404s. The bare /best/ index is a
                // static asset and is left to serveAsset below.
                const bestMatch = path.match(/^\/best\/([a-z0-9-]+)\/?$/);
                if (bestMatch) {
                    return handleBestHub(bestMatch[1], request, env);
                }
            }

            // IndexNow ownership verification file. Must echo the key exactly,
            // as text/plain, at https://chrisputer.tech/<key>.txt. Matched
            // dynamically off env so the route follows the configured key.
            if (env.INDEXNOW_KEY && isGetLike && path === `/${env.INDEXNOW_KEY}.txt`) {
                return withSecurityHeaders(new Response(env.INDEXNOW_KEY, {
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                        'Cache-Control': 'public, max-age=86400',
                    },
                }), null);
            }

            // Static assets (home, guides, css/js). HTML gets a fresh
            // per-request CSP nonce injected.
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
            if (message.body?.kind === 'verification') {
                await processVerificationMessage(message, env);
                continue;
            }
            await processResearchMessage(message, env);
        }
    },

    /**
     * Scheduled handler (cron every 10 min) — reap research rows stuck in
     * 'processing' longer than ~20 min. Covers the edge case where the queue
     * consumer crashed mid-pipeline after the status flip but before the final
     * UPDATE, leaving the public page spinning forever.
     */
    async scheduled(event, env, ctx) {
        const now = event?.scheduledTime ?? Date.now();
        const cutoff = Math.floor(now / 1000) - 20 * 60;
        try {
            const result = await env.DB.prepare(
                "UPDATE research SET status = 'failed' WHERE status = 'processing' AND created_at < ?1"
            ).bind(cutoff).run();
            const reaped = result.meta?.changes ?? 0;
            if (reaped > 0) console.log(JSON.stringify({ where: 'scheduled-reap', reaped, cutoff }));
        } catch (err) {
            console.error(JSON.stringify({ where: 'scheduled-reap', error: err instanceof Error ? err.message : String(err) }));
        }

        // Programmatic-SEO flywheel: drain one keyword per tick into a research
        // run, behind its own budget/rate gates. Isolated in its own try/catch
        // so a flywheel failure can never break or mask the reaper above.
        try {
            const tick = await runFlywheelTick(env, now);
            if (tick && tick.status !== 'skipped') {
                console.log(JSON.stringify({ where: 'scheduled-flywheel', ...tick }));
            }
        } catch (err) {
            console.error(JSON.stringify({ where: 'scheduled-flywheel', error: err instanceof Error ? err.message : String(err) }));
        }

        // Daily Google Search Console ingest. The */10 cron fires ~144×/day, so
        // guard on a KV date stamp to run once per UTC day. Fail-SOFT: with no
        // GSC_SA_KEY it's an instant no-op (no network, stays quiet, retries next
        // tick so it self-starts the moment the secret is added). Under waitUntil
        // so the OAuth + API round-trips never slow the reaper/flywheel above.
        ctx.waitUntil((async () => {
            try {
                const today = new Date(now).toISOString().slice(0, 10);
                if (await env.KV.get('gsc:last-date') === today) return;
                const res = await ingestGsc(env);
                if (res.skipped) return;
                await env.KV.put('gsc:last-date', today);
                console.log(JSON.stringify({ where: 'scheduled-gsc', ...res }));
            } catch (err) {
                console.error(JSON.stringify({ where: 'scheduled-gsc', error: err instanceof Error ? err.message : String(err) }));
            }
        })());

        // Fallback: when the off-CF worker is primary, a row pending > ~5 min
        // means the worker is down/backlogged. Process the oldest one on CF
        // (sequential, capped, but functional) so research never stalls. One per
        // tick keeps the cron within its CPU/time budget.
        if (externalWorkerEnabled(env)) {
            // Under ctx.waitUntil + a hard cap so a slow CF fallback run can't
            // block this handler or overlap the next tick; budget-gated like
            // every other entry path.
            ctx.waitUntil((async () => {
                try {
                    if (await monthlySpendUsd(env) >= monthlyBudgetUsd(env)) return;
                    const staleCut = Math.floor(now / 1000) - 5 * 60;
                    // Exclude kind='verification' rows — this fallback runs
                    // runResearchPipeline (the RANKING pipeline). Verification
                    // rows are processed only by the queue consumer's
                    // processVerificationMessage → runVerificationPipeline path.
                    const claimed = await env.DB.prepare(
                        `UPDATE research SET status = 'processing'
                         WHERE id = (
                             SELECT id FROM research
                             WHERE status = 'pending' AND created_at < ?1
                               AND (kind IS NULL OR kind != 'verification')
                             ORDER BY created_at ASC LIMIT 1
                         )
                         RETURNING id, query`
                    ).bind(staleCut).first();
                    if (claimed) {
                        console.log(JSON.stringify({ where: 'scheduled-fallback', reportId: claimed.id }));
                        const cap = new Promise((_, rej) => setTimeout(() => rej(new Error('fallback-cap')), 6 * 60_000));
                        await Promise.race([runResearchPipeline(env, claimed.id, claimed.query), cap]);
                    }
                } catch (err) {
                    console.error(JSON.stringify({ where: 'scheduled-fallback', error: err instanceof Error ? err.message : String(err) }));
                }
            })());
        }
    },
};

// --- Queue message processors ----------------------------------------------

// Legacy ranking-pipeline path — UNCHANGED behavior, only extracted out of the
// queue() loop body so it can sit alongside the new verification branch.
async function processResearchMessage(message, env) {
    const { reportId, query } = message.body;
    // Phase B: the off-CF worker is the primary processor — ack without
    // processing and leave the row 'pending' for it to claim & run.
    if (externalWorkerEnabled(env)) { message.ack(); return; }
    try {
        // Idempotency guard: claim the row by flipping pending→processing
        // atomically. If 0 rows changed, the row is already processing or
        // complete/failed — a queue redelivery after success. Skip it so
        // we never double-insert products or re-spend the LLM budget.
        const claim = await env.DB.prepare(
            "UPDATE research SET status = 'processing' WHERE id = ?1 AND status = 'pending'"
        ).bind(reportId).run();
        if ((claim.meta?.changes ?? 0) === 0) {
            console.log(`[queue] skip ${reportId} — not in pending state (redelivery)`);
            message.ack();
            return;
        }

        await runResearchPipeline(env, reportId, query);
        message.ack();
    } catch (err) {
        console.error(`Queue processing error for ${reportId}:`, err);
        // Fast-fail the row instead of leaving it 'processing' until the
        // ~20-min scheduled reaper. runResearchPipeline already marks
        // 'failed' for errors it catches internally; this covers the
        // narrower case where an error escapes it (e.g. thrown before its
        // own try, or during the claim/redelivery path) so the public page
        // stops spinning promptly. Guarded by AND status = 'processing' so
        // we never clobber a row another worker has since completed.
        try {
            await env.DB.prepare(
                `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2
                   WHERE id = ?3 AND status = 'processing'`,
            ).bind(
                JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
                Math.floor(Date.now() / 1000),
                reportId,
            ).run();
        } catch (markErr) {
            console.error(`Failed to fast-fail ${reportId}:`, markErr);
        }
        message.ack();
    }
}

// New verification-pipeline path. Same idempotency + ack/error semantics as
// the research path above: claim pending→processing here, hand off to
// runVerificationPipeline, fast-fail on an escaped error so the row never
// hangs in 'processing' until the cron reaper.
async function processVerificationMessage(message, env) {
    const { reportId, product, productUrl } = message.body;
    try {
        const claim = await env.DB.prepare(
            "UPDATE research SET status = 'processing' WHERE id = ?1 AND status = 'pending'"
        ).bind(reportId).run();
        if ((claim.meta?.changes ?? 0) === 0) {
            console.log(`[queue] skip verification ${reportId} — not in pending state (redelivery)`);
            message.ack();
            return;
        }

        await runVerificationPipeline(env, reportId, { product, productUrl });
        message.ack();
    } catch (err) {
        console.error(`Queue verification error for ${reportId}:`, err);
        try {
            await env.DB.prepare(
                `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2
                   WHERE id = ?3 AND status = 'processing'`,
            ).bind(
                JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
                Math.floor(Date.now() / 1000),
                reportId,
            ).run();
        } catch (markErr) {
            console.error(`Failed to fast-fail verification ${reportId}:`, markErr);
        }
        message.ack();
    }
}

// --- Server-rendered research page with KV page cache ---------------------

async function handleResearchPage(slug, url, request, env, ctx) {
    const fromQuery = url.searchParams.get('from');
    // ?src=... renders a clean-link (no affiliate tags) variant for community
    // posts; never cached, canonical still points at the clean URL.
    const cleanLinks = !!url.searchParams.get('src');
    const cacheKey = `page:${CACHE_VERSION}:${slug}`;
    const cacheMetaKey = `page:${CACHE_VERSION}:${slug}:lm`;
    const ifModifiedSince = request.headers.get('If-Modified-Since');

    if (!fromQuery && !cleanLinks) {
        const [cached, cachedLm] = await Promise.all([
            env.KV.get(cacheKey),
            env.KV.get(cacheMetaKey),
        ]);
        if (cached) {
            // Cached views still count — bump view_count out-of-band so the
            // KV fast path never blocks on D1.
            ctx.waitUntil(
                env.DB.prepare("UPDATE research SET view_count = view_count + 1 WHERE slug = ?1 AND status = 'complete'")
                    .bind(slug).run()
                    .catch((err) => console.error('View count update failed:', err)),
            );
            const lm = cachedLm ? parseInt(cachedLm, 10) || undefined : undefined;
            const notModified = maybe304(ifModifiedSince, lm);
            if (notModified) return notModified;
            return htmlPageResponse(cached, env, { lastModifiedSec: lm });
        }
    }

    const result = await renderResearchResult(slug, env, fromQuery, cleanLinks);
    if (result instanceof Response) {
        // Plain 404 in phase 1 (error pages port is phase 2); wrap it here so
        // even bare responses carry the security headers.
        return withSecurityHeaders(result, null);
    }

    // Cache completed/failed pages only (not the live-processing variant).
    if (!fromQuery && !cleanLinks && !result.html.includes('id="processing"')) {
        ctx.waitUntil(env.KV.put(cacheKey, result.html, { expirationTtl: 3600 }));
        ctx.waitUntil(env.KV.put(cacheMetaKey, String(result.lastModified), { expirationTtl: 3600 }));
    }
    const notModified = maybe304(ifModifiedSince, result.lastModified);
    if (notModified) return notModified;
    return htmlPageResponse(result.html, env, { lastModifiedSec: result.lastModified });
}

// GET /best/:slug — static guide asset wins; dynamic category hub is the
// fallback. We probe ASSETS directly (not serveAsset, whose 404 path returns a
// styled page) so a real asset hit — including a redirect to a trailing-slash
// directory index — is detected and served through the nonce/security path. A
// genuine 404 means no static guide exists, so we render the category hub
// (renderCategoryHub returns null → 404 when no research matches the slug).
async function handleBestHub(slug, request, env) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
        const contentType = asset.headers.get('Content-Type') || '';
        if (contentType.includes('text/html')) {
            const nonce = makeNonce();
            const html = (await asset.text()).replaceAll('__CSP_NONCE__', nonce);
            return withSecurityHeaders(asset, nonce, html);
        }
        return withSecurityHeaders(asset, null);
    }

    const html = await renderCategoryHub(slug, env);
    if (!html) return notFound();
    return htmlPageResponse(html, env, {
        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    });
}

// GET|POST /research/new — target of the server-rendered search forms (GET)
// and action buttons like re-run (POST). q/fresh come from query params on
// GET, and from the form body (falling back to query params) on POST.
// Phase 1: no tiers/Turnstile/clarifying questions; submit and redirect.
async function handleNewResearch(request, url, env) {
    // Speculative prefetch (Chrome prerender, link hover prefetchers) must
    // never enqueue research jobs or burn rate-limit quota.
    const purposeHeaders = `${request.headers.get('Sec-Purpose') || ''} ${request.headers.get('Purpose') || ''}`.toLowerCase();
    if (purposeHeaders.includes('prefetch')) {
        return new Response(null, { status: 204 });
    }

    let form = null;
    if (request.method === 'POST') {
        // Tolerates non-form bodies (formData() throws → query-param fallback).
        form = await request.formData().catch(() => null);
    }
    const param = (name) => {
        const fromForm = form?.get(name);
        if (typeof fromForm === 'string' && fromForm !== '') return fromForm;
        return url.searchParams.get(name) || '';
    };

    const query = param('q').trim();
    const fresh = param('fresh') === '1';
    if (!query) {
        return Response.redirect(new URL('/', url.origin).toString(), 302);
    }

    // Tier: default 'full'. Only 'full' submissions get the clarifying-questions
    // grill below; instant (if ever wired) skips it for speed.
    const tier = param('tier') || 'full';

    // Clarifying-questions interstitial. For a Full-tier submission that is NOT a
    // re-run (fresh), does NOT already carry clarification answers, and was NOT
    // an explicit skip, ask the classifier (KV-cached, so cheap) whether the
    // query needs disambiguation. If it returns >=1 question, render the clarify
    // page instead of starting research. Prefetches already returned 204 above.
    const hasAnswers = Array.from(url.searchParams.keys()).some((k) => k.startsWith('clarify_'))
        || (form ? Array.from(form.keys()).some((k) => k.startsWith('clarify_')) : false);
    const skipClarify = param('skip_clarify') === '1';
    let clarifications = {};
    if (tier === 'full' && !fresh && !hasAnswers && !skipClarify) {
        try {
            const classification = await classifyQuery(env, query, canonicalizeQuery(query.toLowerCase()));
            if (classification.accept && classification.clarifying_questions.length > 0) {
                return htmlPageResponse(
                    renderClarifyPage(query, tier, classification.clarifying_questions, env),
                    env,
                    { cacheControl: 'no-store' },
                );
            }
        } catch { /* classifier failure: fall open and proceed without the grill */ }
    }
    if (hasAnswers) {
        // Extract directly from the request URL — works even if the classifier
        // failed open after the interstitial rendered, so the answers still land.
        clarifications = extractClarifications(url);
    }

    const apiBody = { query };
    if (fresh) apiBody.fresh = true;
    if (Object.keys(clarifications).length > 0) apiBody.clarifications = clarifications;

    const result = await handleStartResearch(new Request(new URL('/api/research', url.origin), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': request.headers.get('CF-Connecting-IP') || '127.0.0.1',
            // Forward the session cookie so signed-in users' searches land in
            // their /account history even via the server-rendered form path.
            ...(request.headers.get('Cookie') ? { 'Cookie': request.headers.get('Cookie') } : {}),
        },
        body: JSON.stringify(apiBody),
    }), env);

    if (result.ok) {
        const data = await result.json();
        if (data.slug) {
            const dest = new URL(`/research/${data.slug}`, url.origin);
            if (data.clustered) dest.searchParams.set('from', query);
            return Response.redirect(dest.toString(), 302);
        }
    }
    // Validation/rate-limit failure: land on browse with the query prefilled.
    return Response.redirect(new URL(`/research?q=${encodeURIComponent(query.slice(0, 200))}`, url.origin).toString(), 302);
}

// GET /api/search/suggest?q=... — LIKE-based autocomplete (FTS5 in phase 3).
async function handleSearchSuggest(url, env) {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return suggestJson([]);
    const sanitized = q.replace(/[^\w\s-]/g, '').trim();
    if (!sanitized) return suggestJson([]);

    const rows = await env.DB.prepare(
        `WITH ranked AS (
           SELECT slug, query, category, view_count,
                  ROW_NUMBER() OVER (PARTITION BY COALESCE(canonical_query, slug) ORDER BY view_count DESC, created_at DESC) AS rn
           FROM research WHERE ${publicResearchFilter('research')} AND query LIKE ?1 ESCAPE '\\'
         )
         SELECT slug, query, category, view_count FROM ranked WHERE rn = 1
         ORDER BY view_count DESC LIMIT 6`
    ).bind(`%${escapeLikeWildcards(sanitized)}%`).all();

    const pretty = (rows.results || []).map((r) => ({ ...r, query: displayQuery(r.query) }));
    return suggestJson(pretty);
}

function suggestJson(data) {
    return new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
            'Vary': 'Accept-Encoding',
        },
    });
}

// Plain-text 404 that still carries the standard security headers.
function notFound() {
    return withSecurityHeaders(new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-store' },
    }), null);
}

function redirect301(destUrl) {
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
function maybe304(ifModifiedSince, lastModifiedSec, cacheControl) {
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

const CSP = (nonce) =>
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

// Serve a server-rendered HTML page: nonce substitution, AdSense loader +
// Cloudflare Insights injection (nonce'd), Last-Modified, cache headers.
function htmlPageResponse(body, env, { status = 200, lastModifiedSec, cacheControl } = {}) {
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

async function serveAsset(request, env, overrideUrl) {
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
