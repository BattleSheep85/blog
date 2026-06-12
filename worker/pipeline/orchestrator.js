/**
 * Pipeline Orchestrator: runs the ported research engine end-to-end.
 *
 * classify (if needed) → runEngine (agent loop + synthesis) → validate →
 * persist products + research row. Progress is streamed to KV for the SSE
 * activity feed (progress:{id} + progress_log:{id}); the engine's onEvent
 * callback feeds that same updater so the agent-loop beats surface live.
 *
 * Honest-failure rule: a run that yields zero valid products is marked
 * 'failed', NOT 'complete', so it never absorbs new queries into its cluster.
 */

import { runEngine } from '../engine/engine.js';
import { classifyQuery } from '../lib/classifier.js';
import { getTierConfig } from '../lib/tiers.js';
import { buildAffiliateUrl } from '../lib/affiliate-links.js';
import { resolveAsins } from '../lib/asin-resolver.js';
import { getResearchById, generateId } from '../lib/db.js';
import { sanitizeUrl } from '../lib/utils.js';
import { submitToIndexNow } from '../lib/indexnow.js';

const DEFAULT_AFFILIATE_TAG = 'battlesheep0a-20';
// Monthly spend ceiling default; overridden by env.MONTHLY_BUDGET_USD.
const DEFAULT_MONTHLY_BUDGET_USD = 60;

/**
 * Run the full research pipeline for a query. Called by the Queue consumer.
 * reportId is the research.id. The idempotency claim (pending→processing) lives
 * in the queue consumer (worker/index.js); by the time we get here the row is
 * already 'processing'.
 */
export async function runResearchPipeline(env, reportId, query) {
    const progress = createProgressUpdater(env.KV, reportId);

    try {
        // Load the research row for tier + cached classifier facets.
        const row = await getResearchById(env.DB, reportId);
        if (!row) {
            console.error(`[orchestrator] research row ${reportId} not found`);
            return;
        }

        const tier = row.tier || 'full';
        const config = getTierConfig(tier) || getTierConfig('full');

        // Classifier facets/topical_category: reuse the row's stored values when
        // present (set by a future interstitial), otherwise classify now and
        // persist them so the report page + clustering have category context.
        let facets = parseJsonSafe(row.facets, null);
        let topicalCategory = row.topical_category || null;
        const clarifications = parseJsonSafe(row.clarifications, {}) || {};

        if (!facets) {
            await progress('Classifying query...');
            const classification = await classifyQuery(env, query, row.canonical_query || null);
            facets = classification.facets;
            topicalCategory = classification.topical_category;
            await env.DB.prepare(
                'UPDATE research SET facets = ?1, topical_category = ?2 WHERE id = ?3'
            ).bind(
                JSON.stringify(facets),
                topicalCategory,
                reportId,
            ).run();
        }

        // onEvent bridges the engine's typed events to the KV progress updater
        // so the live activity feed keeps working. Engine emits status/search/
        // fetch/note/synthesize/error; we surface them all as progress entries.
        const onEvent = async (_type, message, _detail) => {
            await progress(message);
        };

        await progress(`Starting ${tier} research...`);

        const engine = await runEngine(
            query,
            config,
            env.OPENROUTER_API_KEY,
            env,
            onEvent,
            facets,
            topicalCategory,
            clarifications,
        );

        const { result, sources, totalCostUsd, synthModel } = engine;

        // Honest-failure: zero valid products → mark failed so clustering and
        // the report page treat it as a non-result instead of an empty page.
        if (!result || !Array.isArray(result.products) || result.products.length < 1) {
            await progress('No reliable products found — marking research failed.');
            await env.DB.prepare(
                `UPDATE research SET status = 'failed', result = ?1, cost_usd = ?2,
                    synth_model = ?3, completed_at = ?4 WHERE id = ?5`
            ).bind(
                JSON.stringify({ error: 'No reliable products found for this query.' }),
                Number.isFinite(totalCostUsd) && totalCostUsd > 0 ? totalCostUsd : null,
                synthModel || null,
                nowEpoch(),
                reportId,
            ).run();
            await incrementMonthlyCost(env, totalCostUsd);
            return;
        }

        // Recover direct Amazon /dp/ product links for products that only got a
        // redirect-hidden or missing URL from synthesis. One Serper query per
        // missing product, capped → a handful of extra subrequests. Never
        // throws; unresolved products pass through unchanged and fall back to
        // explicit "Search Amazon" links at render time. Skipped entirely when
        // the classifier says this category isn't sold on Amazon (lumber,
        // vehicles, services, ...) — those pages render Google CTAs instead.
        const amazonViable = facets?.sold_on_amazon !== false && facets?.is_service !== true;
        if (amazonViable) {
            await progress('Resolving Amazon product links...');
            result.products = await resolveAsins(env, result.products, progress);
        }

        const affiliateIds = {
            amazonTag: env.AMAZON_AFFILIATE_TAG || env.AMAZON_ASSOCIATE_TAG || DEFAULT_AFFILIATE_TAG,
            walmartImpact: env.WALMART_IMPACT_ID || undefined,
            targetImpact: env.IMPACT_TARGET_ID || undefined,
            bestbuyImpact: env.IMPACT_BESTBUY_ID || undefined,
            neweggImpact: env.IMPACT_NEWEGG_ID || undefined,
            bhphoto: env.BHPHOTO_AFFILIATE_ID || undefined,
        };

        // Persist products. Retry-safety: DELETE-then-insert in one batch so a
        // queue redelivery never duplicates rows. affiliate_url stores the
        // TAGGED url — buildAffiliateUrl rejects fabricated /s? search links and
        // returns '' for unknown hosts, so only real retailer/dp URLs get tagged.
        const deleteStale = env.DB.prepare('DELETE FROM products WHERE research_id = ?1').bind(reportId);

        const insertStmts = result.products.map((p) => {
            const productUrl = sanitizeUrl(p.productUrl);
            const affiliateUrl = productUrl ? buildAffiliateUrl(productUrl, affiliateIds) : '';
            const metadataJson = p.metadata && Object.keys(p.metadata).length > 0
                ? JSON.stringify(p.metadata) : null;
            const imageUrl = p.imageUrl ? sanitizeUrl(p.imageUrl) : null;
            return env.DB.prepare(
                `INSERT INTO products (id, research_id, name, brand, price, currency, rating,
                    image_url, product_url, manufacturer_url, affiliate_url,
                    pros, cons, specs, verdict, rank, best_for, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'USD', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
            ).bind(
                generateId(),
                reportId,
                p.name,
                p.brand || null,
                typeof p.price === 'number' ? p.price : null,
                typeof p.rating === 'number' ? p.rating : null,
                imageUrl,
                productUrl || null,
                sanitizeUrl(p.manufacturerUrl) || null,
                affiliateUrl || null,
                JSON.stringify(p.pros || []),
                JSON.stringify(p.cons || []),
                JSON.stringify(p.specs || {}),
                p.verdict || null,
                typeof p.rank === 'number' ? p.rank : null,
                p.bestFor || null,
                metadataJson,
            );
        });

        // result is the canonical engine shape; keep legacy source_count/
        // filtered_count keys so report.js + status handlers keep working.
        const resultJson = {
            ...result,
            query,
            source_count: sources.length,
            filtered_count: 0,
        };

        // sources column: url + credibility tags + score per source. The render
        // path extracts .url from each entry (objects) or treats plain strings.
        const sourcesJson = sources.map((s) => ({ url: s.url, credibility: s.credibility }));

        const updateStmt = env.DB.prepare(
            `UPDATE research SET status = 'complete', summary = ?1, category = ?2,
                result = ?3, sources = ?4, completed_at = ?5, cost_usd = ?6, synth_model = ?7
             WHERE id = ?8`
        ).bind(
            result.summary || '',
            result.category || topicalCategory || null,
            JSON.stringify(resultJson),
            JSON.stringify(sourcesJson),
            nowEpoch(),
            Number.isFinite(totalCostUsd) && totalCostUsd > 0 ? totalCostUsd : null,
            synthModel || null,
            reportId,
        );

        await env.DB.batch([deleteStale, ...insertStmts, updateStmt]);
        await incrementMonthlyCost(env, totalCostUsd);
        await setFinalReport(env.KV, reportId, resultJson);
        await progress(`Research complete: ${result.products.length} products ranked.`);

        // Fire-and-forget: ping IndexNow so the freshly published/updated page
        // gets indexed by Bing/DuckDuckGo/Yandex within hours. submitToIndexNow
        // never throws and self-times-out, so it can't delay or fail the run.
        if (row.slug) {
            await submitToIndexNow(env, [`https://chrisputer.tech/research/${row.slug}`]);
        }

    } catch (err) {
        console.error('Pipeline error:', err);
        await progress(`Error: ${err.message}`);
        try {
            await env.DB.prepare(
                `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2 WHERE id = ?3`
            ).bind(JSON.stringify({ error: err.message }), nowEpoch(), reportId).run();
        } catch (e) {
            console.error('Failed to mark research failed:', e);
        }
        await setFinalReport(env.KV, reportId, { error: err.message });
    }
}

function nowEpoch() {
    return Math.floor(Date.now() / 1000);
}

function parseJsonSafe(json, fallback) {
    if (json == null) return fallback;
    if (typeof json !== 'string') return json;
    try { return JSON.parse(json); } catch { return fallback; }
}

/**
 * Increment the month-keyed KV spend counter by this run's cost. Read-add-put
 * is fine at this volume (one writer per run, low concurrency). 30-day TTL so
 * old months age out on their own. NaN/zero costs are no-ops.
 */
export async function incrementMonthlyCost(env, cost) {
    if (!Number.isFinite(cost) || cost <= 0) return;
    try {
        const key = `cost:${monthKey()}`;
        const current = Number(await env.KV.get(key)) || 0;
        await env.KV.put(key, String(current + cost), { expirationTtl: 30 * 86400 });
    } catch (err) {
        console.error('[orchestrator] monthly cost update failed:', err instanceof Error ? err.message : String(err));
    }
}

// Current month as 'YYYY-MM', derived from request-time clock.
export function monthKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function monthlyBudgetUsd(env) {
    // An explicit MONTHLY_BUDGET_USD=0 is a kill switch: with spend always >= 0,
    // the governor's `spent >= budget` check refuses every new run (503). Only an
    // unset, empty, negative, or non-numeric value falls back to the default.
    const raw = env.MONTHLY_BUDGET_USD;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return DEFAULT_MONTHLY_BUDGET_USD;
    }
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MONTHLY_BUDGET_USD;
}

/**
 * Create a progress updater that writes to KV for SSE streaming.
 *
 * The pipeline is the single writer for a run, so the log array lives in this
 * closure: each step is an in-memory append plus two KV puts — `progress:`
 * (latest entry) and `progress_log:` (full log). No KV read-modify-write.
 */
function createProgressUpdater(kv, reportId) {
    let stepIndex = 0;
    let log = [];
    return async function progress(message) {
        stepIndex++;
        const progressData = {
            step: stepIndex,
            message,
            timestamp: Date.now(),
        };
        log = [...log, progressData];
        await Promise.all([
            kv.put(`progress:${reportId}`, JSON.stringify(progressData), { expirationTtl: 3600 }),
            kv.put(`progress_log:${reportId}`, JSON.stringify(log), { expirationTtl: 3600 }),
        ]);
    };
}

/**
 * Store the final report in KV for quick SSE retrieval (the page itself renders
 * from D1; this KV copy only short-circuits the in-flight SSE stream).
 */
async function setFinalReport(kv, reportId, report) {
    await kv.put(`report:${reportId}`, JSON.stringify(report), { expirationTtl: 86400 });
}
