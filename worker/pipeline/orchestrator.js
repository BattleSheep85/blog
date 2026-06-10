/**
 * Pipeline Orchestrator: Runs the full research pipeline.
 * search → analyze → filter → synthesize → enrich
 * Writes results into the permanent `research` + `products` tables (v2 schema)
 * and updates KV with progress at each step for SSE streaming.
 */

import { searchForReviews } from './search.js';
import { analyzeSources, filterSources } from './analyze.js';
import { synthesizeReport } from './synthesize.js';
import { enrichWithAffiliateLinks } from './affiliate.js';
import { updateResearchStatus, completeResearch, insertProductV2, generateId } from '../lib/db.js';

/**
 * Run the full research pipeline for a query.
 * Called by the Queue consumer. reportId is the research.id.
 */
export async function runResearchPipeline(env, reportId, query) {
    const llmKey = env.OPENROUTER_API_KEY;
    const amazonTag = env.AMAZON_ASSOCIATE_TAG || env.AMAZON_AFFILIATE_TAG || '';

    const progress = createProgressUpdater(env.KV, reportId);

    try {
        await progress('Starting research pipeline...');
        // The research.status CHECK constraint only allows pending/processing/
        // complete/failed — intermediate phases all map to 'processing'.
        await updateResearchStatus(env.DB, reportId, 'processing');

        // Step 1: Search (Reddit free, HN free, Serper free tier)
        await progress('Phase 1/4: Searching free sources for real reviews...');
        const searchResults = await searchForReviews(env, query, progress);

        if (searchResults.parse_error || !searchResults.sources?.length) {
            await progress('Could not find enough sources. Generating report with limited data...');
            const limitedReport = {
                query,
                executive_summary: `Limited results for "${query}". Not enough verified sources were found for a comprehensive comparison. Try being more specific, e.g. "best budget mechanical keyboard under $100 for gaming".`,
                products: [],
                methodology: 'Search returned insufficient results for reliable analysis.',
                sources_summary: [],
                category_insights: '',
                source_count: 0,
                filtered_count: 0,
            };
            await completeResearch(env.DB, {
                id: reportId,
                status: 'complete',
                summary: limitedReport.executive_summary,
                category: null,
                result: JSON.stringify(limitedReport),
                sources: '[]',
            });
            await progress('Research complete (limited results)');
            await setFinalReport(env.KV, reportId, limitedReport);
            return;
        }

        const totalSources = searchResults.sources.length;
        await progress(`Found ${totalSources} sources. Starting authenticity analysis...`);

        // Step 2: Analyze (DeepSeek R1, free via OpenRouter)
        const analysisResults = await analyzeSources(llmKey, searchResults.sources, progress);

        // Step 3: Filter
        const filtered = filterSources(analysisResults.analyzed_sources);
        const filteredOutCount = totalSources - filtered.length;
        await progress(`Filtered to ${filtered.length} genuine sources (removed ${filteredOutCount} fake/low-quality)`);

        // Sources persist as a JSON array of https URLs on the research row
        // (the v2 schema has no sources table; the page renders these links).
        const sourceUrls = filtered
            .map((s) => s.url)
            .filter((u) => typeof u === 'string' && u.startsWith('https://'));

        // Step 4: Synthesize (free via OpenRouter)
        const report = await synthesizeReport(
            llmKey, query, filtered, totalSources, filteredOutCount, progress
        );

        // Step 5: Enrich with affiliate links + stamp stable ids/ranks
        const enriched = enrichWithAffiliateLinks(report, amazonTag);
        const productsWithIds = (enriched.products || []).map((p, i) => ({
            ...p,
            id: p.id || generateId(),
            rank: p.rank || i + 1,
        }));
        const finalReport = {
            ...enriched,
            query,
            products: productsWithIds,
            source_count: totalSources,
            filtered_count: filteredOutCount,
        };

        // Store products in D1 (v2 columns). affiliate_url is the tagged Amazon
        // search link for now — phase 2 upgrades to /dp/ product links.
        await Promise.all(productsWithIds.map((product) => insertProductV2(env.DB, {
            id: product.id,
            researchId: reportId,
            name: product.name,
            rank: product.rank,
            pros: JSON.stringify(product.pros || []),
            cons: JSON.stringify(product.cons || []),
            specs: JSON.stringify(product.specs || {}),
            bestFor: product.best_for || null,
            affiliateUrl: product.affiliate_links?.amazon || null,
            metadata: JSON.stringify(buildProductMetadata(product)),
        })));

        // Finalize
        await completeResearch(env.DB, {
            id: reportId,
            status: 'complete',
            summary: finalReport.executive_summary || '',
            category: null,
            result: JSON.stringify(finalReport),
            sources: JSON.stringify(sourceUrls),
        });
        await setFinalReport(env.KV, reportId, finalReport);
        await progress('Research complete!');

    } catch (err) {
        console.error('Pipeline error:', err);
        await progress(`Error: ${err.message}`);
        await completeResearch(env.DB, {
            id: reportId,
            status: 'failed',
            summary: null,
            category: null,
            result: JSON.stringify({ error: err.message }),
            sources: null,
        });
        await setFinalReport(env.KV, reportId, { error: err.message });
    }
}

/**
 * Build the product card metadata map. Mirrors the original sanitizeMetadata
 * contract (engine-validate.ts): a flat Record<string, string> with camelCase
 * keys, non-string/empty values dropped. labelForMetadataKey on the research
 * page prettifies camelCase, so keys MUST be camelCase ("priceRange", not
 * "price_range"). affiliate_links is intentionally excluded — the Amazon link
 * lives in the affiliate_url column and the full object persists in the
 * report JSON (result column + KV).
 */
function buildProductMetadata(product) {
    const metadata = {};
    if (typeof product.price_range === 'string' && product.price_range.trim()) {
        metadata.priceRange = product.price_range.trim().slice(0, 240);
    }
    if (typeof product.trust_score === 'number' && product.trust_score > 0) {
        metadata.trustScore = `${Math.round(product.trust_score)}/100`;
    }
    return metadata;
}

/**
 * Create a progress updater that writes to KV for SSE streaming.
 */
function createProgressUpdater(kv, reportId) {
    let stepIndex = 0;
    return async function progress(message) {
        stepIndex++;
        const progressData = {
            step: stepIndex,
            message,
            timestamp: Date.now(),
        };
        await kv.put(`progress:${reportId}`, JSON.stringify(progressData), { expirationTtl: 3600 });
        const logKey = `progress_log:${reportId}`;
        const existing = await kv.get(logKey, 'json') || [];
        const updated = [...existing, progressData];
        await kv.put(logKey, JSON.stringify(updated), { expirationTtl: 3600 });
    };
}

/**
 * Store the final report in KV for quick SSE retrieval (page itself renders
 * from D1; this KV copy only short-circuits the in-flight SSE stream).
 */
async function setFinalReport(kv, reportId, report) {
    await kv.put(`report:${reportId}`, JSON.stringify(report), { expirationTtl: 86400 });
}
