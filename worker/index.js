/**
 * TrueRank — Cloudflare Worker entry point.
 * Routes HTTP requests and processes Queue messages.
 */

import { handleStartResearch, handleResearchStatus, handleResearchStream } from './handlers/research.js';
import { handleGetReport, handleFeedback } from './handlers/report.js';
import { handleAffiliateClick } from './handlers/affiliate.js';
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

            const affiliateMatch = path.match(/^\/api\/go\/([a-z0-9]+)$/);
            if (affiliateMatch && method === 'GET') {
                return handleAffiliateClick(affiliateMatch[1], request, env);
            }

            // Serve static files from the site bucket
            if (path === '/' || path === '/index.html') {
                return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
            }

            if (path === '/report' || path.startsWith('/report/')) {
                return env.ASSETS.fetch(new Request(new URL('/report.html', url), request));
            }

            // Try to serve static asset
            const assetResponse = await env.ASSETS.fetch(request);
            if (assetResponse.status !== 404) {
                return assetResponse;
            }

            return new Response('Not found', { status: 404 });

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
