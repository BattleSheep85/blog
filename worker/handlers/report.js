/**
 * Report API handlers.
 * GET /api/report/:id — serve cached report
 * POST /api/feedback — store user feedback
 */

import { getReport, getSourcesByReport, getProductsByReport, insertFeedback } from '../lib/db.js';

/**
 * Handle GET /api/report/:id
 * Returns the full report with sources and products.
 */
export async function handleGetReport(reportId, env) {
    const report = await getReport(env.DB, reportId);
    if (!report) {
        return jsonResponse({ error: 'Report not found' }, 404);
    }

    if (report.status !== 'completed') {
        return jsonResponse({
            id: report.id,
            status: report.status,
            message: 'Report is still being generated',
        }, 202);
    }

    const sourcesResult = await getSourcesByReport(env.DB, reportId);
    const productsResult = await getProductsByReport(env.DB, reportId);

    return jsonResponse({
        id: report.id,
        query: report.query,
        status: 'completed',
        report: report.report_json ? JSON.parse(report.report_json) : null,
        sources: sourcesResult.results || [],
        products: productsResult.results || [],
        sourceCount: report.source_count,
        filteredCount: report.filtered_count,
        createdAt: report.created_at,
        expiresAt: report.expires_at,
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
    const report = await getReport(env.DB, reportId);
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
