/**
 * Report API handlers.
 * GET /api/report/:id — serve cached report
 * POST /api/feedback — store user feedback
 */

import { getResearchById, getProductsByResearchId, insertFeedback } from '../lib/db.js';
import { parseJsonSafe } from '../lib/utils.js';

/**
 * Handle GET /api/report/:id
 * Returns the full report with sources and products (v2 research tables).
 */
export async function handleGetReport(reportId, env) {
    const row = await getResearchById(env.DB, reportId);
    if (!row) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    if (row.status === 'failed') {
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: 'error',
            error: parseJsonSafe(row.result, {}).error || 'Research failed',
        }, 200);
    }

    if (row.status !== 'complete') {
        return jsonResponse({
            id: row.id,
            slug: row.slug,
            status: row.status,
            message: 'Report is still being generated',
        }, 202);
    }

    const productsResult = await getProductsByResearchId(env.DB, reportId);
    const report = parseJsonSafe(row.result, null);

    return jsonResponse({
        id: row.id,
        slug: row.slug,
        query: row.query,
        status: 'completed',
        report,
        sources: parseJsonSafe(row.sources, []),
        products: productsResult.results || [],
        sourceCount: report?.source_count ?? 0,
        filteredCount: report?.filtered_count ?? 0,
        createdAt: row.created_at,
    });
}

/**
 * Handle POST /api/feedback
 * Stores user feedback on a report.
 */
export async function handleFeedback(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { reportId, rating, comment } = body;

    if (!reportId) {
        return jsonResponse({ error: 'reportId is required' }, 400);
    }

    const ratingNum = parseInt(rating, 10);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
        return jsonResponse({ error: 'rating must be between 1 and 5' }, 400);
    }

    // Verify report exists
    const report = await getResearchById(env.DB, reportId);
    if (!report) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    await insertFeedback(env.DB, {
        reportId,
        rating: ratingNum,
        comment: (comment || '').slice(0, 1000),
    });

    return jsonResponse({ success: true });
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
