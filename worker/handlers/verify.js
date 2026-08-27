/**
 * Product-verification API handlers (Truth Audit pipeline).
 * POST /api/verify — start a new verification job, or resubmit with a
 *   product URL after a needs_input ask.
 * GET /api/verify/:id — poll for status/progress/results.
 *
 * Mirrors worker/handlers/research.js's intake pattern (validation, safety
 * screen, rate limit, budget gate, INSERT + queue send) but targets the
 * verification pipeline (worker/pipeline/verify-orchestrator.js) via the
 * queue consumer's `kind: 'verification'` branch. ADDITIVE — does not touch
 * /api/research or any existing route.
 */

import { generateId, getResearchById } from '../lib/db.js';
import { generateSlug } from '../lib/utils.js';
import { screenQuery, rejectionMessage } from '../lib/safety.js';
import { budgetExhausted } from '../pipeline/orchestrator.js';
import { checkRateLimit, ipRateKey } from '../lib/rate-limit.js';
import { checkBurstGate } from '../lib/burst-gate.js';
import { getSessionUser } from '../lib/auth.js';
import { getQuota, consumeQuota, FREE_VERIFIES } from '../lib/quota.js';

const PRODUCT_MIN_LEN = 3;
const PRODUCT_MAX_LEN = 200;

/**
 * Handle POST /api/verify
 * Body: { product: string, productUrl?: string, reportId?: string }
 * - No reportId: creates a new verification research row + enqueues.
 * - reportId + productUrl: resubmits a row stuck in needs_input/failed with
 *   the user-supplied product URL, then re-enqueues.
 */
export async function handleStartVerify(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const product = (body.product || '').trim();
    if (!product || product.length < PRODUCT_MIN_LEN) {
        return jsonResponse({ error: `Product must be at least ${PRODUCT_MIN_LEN} characters` }, 400);
    }
    if (product.length > PRODUCT_MAX_LEN) {
        return jsonResponse({ error: `Product must be under ${PRODUCT_MAX_LEN} characters` }, 400);
    }
    if ((product.match(/[a-z0-9]/gi) || []).length < 3) {
        return jsonResponse({ error: 'Product must contain at least 3 letters or numbers' }, 400);
    }

    // CONTENT SAFETY: deterministic, fail-closed screen allowing product URLs —
    // never create a row, enqueue, or research a blocked query.
    const screen = screenQuery(product, { allowUrl: true });
    if (screen.blocked) {
        return jsonResponse({ error: rejectionMessage(screen.reason), rejected: true, reason: screen.reason }, 422);
    }

    let productUrl = null;
    if (body.productUrl != null && body.productUrl !== '') {
        if (!isHttpUrl(body.productUrl)) {
            return jsonResponse({ error: 'productUrl must be a valid http(s) URL' }, 400);
        }
        productUrl = String(body.productUrl).trim();
    }

    const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';

    // Wallet-DoS defense. Same generous per-IP velocity cap as /api/research,
    // and the same layering: the atomic RL_BURST binding caps concurrency
    // (10/60s) in front of the non-atomic KV hourly window.
    // Applies to both new submissions and resubmits (both enqueue paid work).
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateKey = await ipRateKey('verify', clientIp, env);
    const burst = await checkBurstGate(env.RL_BURST, rateKey);
    const velocity = burst.allowed
        ? await checkRateLimit(env.KV, rateKey, 20, 3600)
        : burst;
    if (!velocity.allowed) {
        const retryAfter = Math.max(1, Math.ceil((velocity.resetAt - Date.now()) / 1000));
        return jsonResponse(
            { error: 'Too many verification runs from your connection in the last hour. Please try again shortly.' },
            429,
            { 'Retry-After': String(retryAfter) },
        );
    }

    if (await budgetExhausted(env)) {
        return jsonResponse({ error: 'Monthly research budget exhausted — resets at the start of next month.' }, 503);
    }

    if (reportId) {
        return handleResubmit(env, reportId, product, productUrl);
    }

    const sessionUser = await getSessionUser(request, env);
    return handleNewSubmission(env, product, productUrl, sessionUser, clientIp);
}

async function handleNewSubmission(env, product, productUrl, sessionUser, clientIp) {
    // Free-tier gate: only a brand-new verification submission consumes
    // quota — a needs_input resubmit is a continuation of a run already
    // paid for, so it goes through handleResubmit below untouched.
    if (!sessionUser) {
        const quota = await getQuota(env.KV, 'verify', clientIp, env);
        if (quota.remaining <= 0) {
            return jsonResponse({
                error: 'Free limit reached — create a free account to keep verifying products.',
                code: 'signup_required',
                kind: 'verify',
                limit: FREE_VERIFIES,
            }, 403);
        }
    }

    const id = generateId();
    const slug = generateSlug(product, id);

    await env.DB.prepare(
        `INSERT INTO research (id, slug, query, status, kind, subject_url, created_at)
         VALUES (?, ?, ?, 'pending', 'verification', ?, ?)`
    ).bind(id, slug, product, productUrl, Math.floor(Date.now() / 1000)).run();

    try {
        await env.RESEARCH_QUEUE.send({ reportId: id, kind: 'verification', product, productUrl });
    } catch (err) {
        console.error('[verify] queue send failed:', err instanceof Error ? err.message : String(err));
        try {
            await env.DB.prepare("UPDATE research SET status = 'failed' WHERE id = ?").bind(id).run();
        } catch { /* best-effort cleanup */ }
        return jsonResponse({ error: 'Could not enqueue verification job — please retry' }, 503);
    }

    if (!sessionUser) {
        await consumeQuota(env.KV, 'verify', clientIp, env);
    }

    return jsonResponse({ id, slug, status: 'pending' });
}

async function handleResubmit(env, reportId, product, productUrl) {
    if (!productUrl) {
        return jsonResponse({ error: 'productUrl is required to resubmit' }, 400);
    }

    const row = await getResearchById(env.DB, reportId);
    if (!row) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    // Guard: only allow the needs_input/failed → pending transition on verification rows.
    // A row in pending/processing/complete or a ranking row must not be clobbered by a stray resubmit.
    const update = await env.DB.prepare(
        `UPDATE research SET subject_url = ?1, status = 'pending'
           WHERE id = ?2 AND status IN ('needs_input', 'failed') AND kind = 'verification'`
    ).bind(productUrl, reportId).run();

    if ((update.meta?.changes ?? 0) === 0) {
        return jsonResponse({ error: 'Report is not awaiting a product URL' }, 409);
    }

    try {
        await env.RESEARCH_QUEUE.send({ reportId, kind: 'verification', product, productUrl });
    } catch (err) {
        console.error('[verify] resubmit queue send failed:', err instanceof Error ? err.message : String(err));
        try {
            await env.DB.prepare("UPDATE research SET status = 'failed' WHERE id = ?").bind(reportId).run();
        } catch { /* best-effort cleanup */ }
        return jsonResponse({ error: 'Could not enqueue verification job — please retry' }, 503);
    }

    return jsonResponse({ id: reportId, slug: row.slug, status: 'pending' });
}

/**
 * Handle GET /api/verify/:id
 * Returns current status. When needs_input, includes needsUrl + the prompt
 * message (stored in `preview`) so the client can ask for a product URL.
 */
export async function handleVerifyStatus(reportId, env) {
    const row = await getResearchById(env.DB, reportId);
    if (!row) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    if (row.status === 'complete') {
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: 'completed',
            overallVerdict: row.overall_verdict ?? null,
            overallScore: row.overall_score ?? null,
        });
    }

    if (row.status === 'needs_input') {
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: 'needs_input',
            needsUrl: true,
            message: row.preview || 'We could not find that product’s page. Please paste its URL to continue.',
        });
    }

    if (row.status === 'failed') {
        return jsonResponse({ id: row.id, slug: row.slug, status: 'error' });
    }

    return jsonResponse({ id: row.id, slug: row.slug, status: row.status });
}

// Basic http(s) URL validator (both schemes allowed — user-pasted retailer
// links are frequently plain http on older/regional storefronts; the page
// itself is only ever fetched server-side, never rendered as a live link
// without the sanitizeUrl/isValidHttpsUrl https-only checks downstream).
function isHttpUrl(value) {
    try {
        const u = new URL(String(value));
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...extraHeaders,
        },
    });
}
