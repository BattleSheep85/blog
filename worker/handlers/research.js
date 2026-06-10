/**
 * Research API handlers.
 * POST /api/research — start a new research job (canonical-query clustering)
 * GET /api/research/:id — poll for status/progress/results
 * GET /api/research/:id/stream — SSE with short-lived connection + client reconnect
 * GET /api/research/:slug/events — activity-feed poll for the server-rendered page
 */

import { checkRateLimit } from '../lib/rate-limit.js';
import {
    generateId, insertResearch, findResearchByCanonicalQuery,
    getResearchById, getResearchBySlug,
} from '../lib/db.js';
import { slugify, canonicalizeQuery, parseJsonSafe } from '../lib/utils.js';

/**
 * Handle POST /api/research
 * Validates input, clusters on canonical query, checks rate limit, enqueues job.
 */
export async function handleStartResearch(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const query = (body.query || '').trim();
    if (!query || query.length < 3) {
        return jsonResponse({ error: 'Query must be at least 3 characters' }, 400);
    }
    if (query.length > 500) {
        return jsonResponse({ error: 'Query must be under 500 characters' }, 400);
    }

    const normalizedQuery = query.toLowerCase();

    // Clustering: a completed run with the same canonical query within 14 days
    // is the same research — send the client to its permanent page.
    const canonical = canonicalizeQuery(normalizedQuery);
    const existing = await findResearchByCanonicalQuery(env.DB, canonical, 14);
    if (existing) {
        return jsonResponse({
            id: existing.id,
            slug: existing.slug,
            status: 'completed',
            cached: true,
            clustered: true,
        });
    }

    // Rate limit check
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const maxRequests = parseInt(env.RATE_LIMIT_MAX || '5', 10);
    const windowSeconds = parseInt(env.RATE_LIMIT_WINDOW_SECONDS || '3600', 10);
    const rateCheck = await checkRateLimit(env.KV, ip, maxRequests, windowSeconds);

    if (!rateCheck.allowed) {
        return jsonResponse({
            error: 'Rate limit exceeded. Try again later.',
            remaining: 0,
            resetAt: new Date(rateCheck.resetAt).toISOString(),
        }, 429);
    }

    // Create the permanent research row. Slug mirrors Exhaustive's shape:
    // slugify(query) + '-' + first 8 chars of the id.
    const id = generateId();
    const slug = `${slugify(normalizedQuery)}-${id.slice(0, 8)}`;
    await insertResearch(env.DB, {
        id,
        slug,
        query: normalizedQuery,
        canonicalQuery: canonical,
        tier: 'full',
    });

    // Enqueue research job (message shape unchanged — queue consumer keys on it)
    await env.RESEARCH_QUEUE.send({
        reportId: id,
        query: normalizedQuery,
    });

    return jsonResponse({
        id,
        slug,
        status: 'pending',
        remaining: rateCheck.remaining,
    });
}

// New-table statuses → legacy API vocabulary the frontend understands.
function apiStatus(dbStatus) {
    if (dbStatus === 'complete') return 'completed';
    if (dbStatus === 'failed') return 'error';
    return dbStatus; // pending | processing
}

/**
 * Handle GET /api/research/:id
 * Returns current status. Designed for polling from the client.
 */
export async function handleResearchStatus(reportId, env) {
    const row = await getResearchById(env.DB, reportId);
    if (!row) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    if (row.status === 'complete') {
        const report = parseJsonSafe(row.result, null);
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: 'completed',
            report,
            sourceCount: report?.source_count ?? parseJsonSafe(row.sources, []).length,
            filteredCount: report?.filtered_count ?? 0,
        });
    }

    if (row.status === 'failed') {
        const errMsg = parseJsonSafe(row.result, {}).error || 'Unknown error';
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: 'error',
            error: errMsg,
        });
    }

    // Return current status + progress for polling
    const progress = await env.KV.get(`progress:${reportId}`, 'json');
    const progressLog = await env.KV.get(`progress_log:${reportId}`, 'json') || [];
    return jsonResponse({
        id: row.id,
        slug: row.slug,
        status: apiStatus(row.status),
        progress: progress || { message: 'Queued for processing...' },
        progressLog,
    });
}

/**
 * Handle GET /api/research/:id/stream
 * Short-lived SSE: flushes all current progress, then closes.
 * Client reconnects with Last-Event-ID to get new updates.
 */
export async function handleResearchStream(reportId, env, request) {
    const lastEventId = parseInt(request?.headers?.get('Last-Event-ID') || '0', 10);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (id, data) => {
                controller.enqueue(encoder.encode(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            // Check for final report first
            const finalReport = await env.KV.get(`report:${reportId}`, 'json');
            if (finalReport && !finalReport.error) {
                const log = await env.KV.get(`progress_log:${reportId}`, 'json') || [];
                for (const entry of log) {
                    if (entry.step > lastEventId) {
                        send(entry.step, { type: 'progress', ...entry });
                    }
                }

                const dbRow = await getResearchById(env.DB, reportId);
                send(9999, {
                    type: 'complete',
                    slug: dbRow?.slug || null,
                    report: finalReport,
                    sourceCount: finalReport.source_count || 0,
                    filteredCount: finalReport.filtered_count || 0,
                });
                controller.close();
                return;
            }

            // Check for error
            const dbRow = await getResearchById(env.DB, reportId);
            if (dbRow?.status === 'failed') {
                const errMsg = parseJsonSafe(dbRow.result, {}).error || 'Unknown error';
                send(9998, { type: 'error', error: errMsg });
                controller.close();
                return;
            }

            // Send new progress entries since lastEventId
            const log = await env.KV.get(`progress_log:${reportId}`, 'json') || [];
            let maxStep = lastEventId;
            for (const entry of log) {
                if (entry.step > lastEventId) {
                    send(entry.step, { type: 'progress', ...entry });
                    maxStep = Math.max(maxStep, entry.step);
                }
            }

            send(maxStep, { type: 'keepalive', status: apiStatus(dbRow?.status || 'pending') });
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

/**
 * Handle GET /api/research/:slug/events?since=N
 * Activity-feed poll used by the server-rendered processing page. Phase 1
 * adapts the KV progress log into Exhaustive's events shape; phase 2 swaps in
 * a real research_events table with typed events + preview text.
 */
export async function handleResearchEvents(slug, url, env) {
    const since = parseInt(url.searchParams.get('since') || '0', 10) || 0;
    const row = await getResearchBySlug(env.DB, slug);
    if (!row) {
        return jsonResponse({ error: 'Not found' }, 404);
    }

    const log = await env.KV.get(`progress_log:${row.id}`, 'json') || [];
    const events = log
        .filter((e) => e.step > since)
        .map((e) => ({
            seq: e.step,
            event_type: 'status',
            message: e.message,
            created_at: Math.floor((e.timestamp || Date.now()) / 1000),
        }));

    return jsonResponse({ status: row.status, events, preview: row.preview ?? null });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
