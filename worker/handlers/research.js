/**
 * Research API handlers.
 * POST /api/research — start a new research job
 * GET /api/research/:id — poll for status/progress/results
 * GET /api/research/:id/stream — SSE with short-lived connection + client reconnect
 */

import { checkRateLimit } from '../lib/rate-limit.js';
import { createReport, findCachedReport, getReport, generateId } from '../lib/db.js';

/**
 * Handle POST /api/research
 * Validates input, checks cache, checks rate limit, enqueues research job.
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

    // Check cache first
    const normalizedQuery = query.toLowerCase();
    const cached = await findCachedReport(env.DB, normalizedQuery);
    if (cached && cached.report_json) {
        let report;
        try { report = JSON.parse(cached.report_json); } catch { report = null; }
        if (report) {
            return jsonResponse({
                id: cached.id,
                status: 'completed',
                cached: true,
                report,
            });
        }
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

    // Create report record
    const reportId = generateId();
    await createReport(env.DB, {
        id: reportId,
        query: normalizedQuery,
        filtersJson: JSON.stringify(body.filters || {}),
    });

    // Enqueue research job
    await env.RESEARCH_QUEUE.send({
        reportId,
        query: normalizedQuery,
    });

    return jsonResponse({
        id: reportId,
        status: 'pending',
        remaining: rateCheck.remaining,
    });
}

/**
 * Handle GET /api/research/:id
 * Returns current status. Designed for polling from the client.
 */
export async function handleResearchStatus(reportId, env) {
    const report = await getReport(env.DB, reportId);
    if (!report) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    // If already completed, return the report directly
    if (report.status === 'completed' && report.report_json) {
        let parsed;
        try { parsed = JSON.parse(report.report_json); } catch { parsed = null; }
        return jsonResponse({
            id: report.id,
            status: 'completed',
            report: parsed,
            sourceCount: report.source_count,
            filteredCount: report.filtered_count,
        });
    }

    if (report.status === 'error') {
        let errMsg = 'Unknown error';
        try { errMsg = JSON.parse(report.report_json).error; } catch { /* use default */ }
        return jsonResponse({
            id: report.id,
            status: 'error',
            error: errMsg,
        });
    }

    // Return current status + progress for polling
    const progress = await env.KV.get(`progress:${reportId}`, 'json');
    const progressLog = await env.KV.get(`progress_log:${reportId}`, 'json') || [];
    return jsonResponse({
        id: report.id,
        status: report.status,
        progress: progress || { message: 'Queued for processing...' },
        progressLog,
    });
}

/**
 * Handle GET /api/research/:id/stream
 * Short-lived SSE: flushes all current progress, then closes.
 * Client reconnects with Last-Event-ID to get new updates.
 * Stays within Workers wall-clock limits.
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
            if (finalReport) {
                // Send any unseen progress
                const log = await env.KV.get(`progress_log:${reportId}`, 'json') || [];
                for (const entry of log) {
                    if (entry.step > lastEventId) {
                        send(entry.step, { type: 'progress', ...entry });
                    }
                }

                const dbReport = await getReport(env.DB, reportId);
                send(9999, {
                    type: 'complete',
                    report: finalReport,
                    sourceCount: dbReport?.source_count || 0,
                    filteredCount: dbReport?.filtered_count || 0,
                });
                controller.close();
                return;
            }

            // Check for error
            const dbReport = await getReport(env.DB, reportId);
            if (dbReport?.status === 'error') {
                let errMsg = 'Unknown error';
                try { errMsg = JSON.parse(dbReport.report_json).error; } catch { /* default */ }
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

            // Send a keepalive so the client knows we're still here,
            // then close. Client will reconnect in ~2s to check for more.
            send(maxStep, { type: 'keepalive', status: dbReport?.status || 'pending' });
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

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
