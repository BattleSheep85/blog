/**
 * Pipeline Orchestrator: Runs the full research pipeline.
 * search → analyze → filter → synthesize → enrich
 * Updates KV with progress at each step for SSE streaming.
 */

import { searchForReviews } from './search.js';
import { analyzeSources, filterSources } from './analyze.js';
import { synthesizeReport } from './synthesize.js';
import { enrichWithAffiliateLinks } from './affiliate.js';
import { updateReportStatus, insertSource, insertProduct, generateId } from '../lib/db.js';

/**
 * Run the full research pipeline for a query.
 * Called by the Queue consumer.
 */
export async function runResearchPipeline(env, reportId, query) {
    const llmKey = env.OPENROUTER_API_KEY;
    const amazonTag = env.AMAZON_ASSOCIATE_TAG || '';

    const progress = createProgressUpdater(env.KV, reportId);

    try {
        await progress('Starting research pipeline...');
        await updateReportStatus(env.DB, reportId, 'searching', null, 0, 0);

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
            };
            const reportJson = JSON.stringify(limitedReport);
            await updateReportStatus(env.DB, reportId, 'completed', reportJson, 0, 0);
            await progress('Research complete (limited results)');
            await setFinalReport(env.KV, reportId, limitedReport);
            return;
        }

        const totalSources = searchResults.sources.length;
        await progress(`Found ${totalSources} sources. Starting authenticity analysis...`);

        // Step 2: Analyze (DeepSeek R1, free via OpenRouter)
        await updateReportStatus(env.DB, reportId, 'analyzing', null, totalSources, 0);
        const analysisResults = await analyzeSources(llmKey, searchResults.sources, progress);

        // Step 3: Filter
        const filtered = filterSources(analysisResults.analyzed_sources);
        const filteredOutCount = totalSources - filtered.length;

        await progress(`Filtered to ${filtered.length} genuine sources (removed ${filteredOutCount} fake/low-quality)`);

        // Store sources in D1 (concurrently, not one round-trip at a time)
        await Promise.all(analysisResults.analyzed_sources.map(source => insertSource(env.DB, {
            id: generateId(),
            reportId,
            url: source.url || '',
            sourceType: source.source_type || 'unknown',
            trustScore: source.trust_score || 0,
            contentSummary: source.summary || '',
            isFake: source.is_fake || false,
            analysisJson: JSON.stringify({
                red_flags: source.red_flags || [],
                green_flags: source.green_flags || [],
                key_claims: source.key_claims || [],
            }),
        })));

        // Step 4: Synthesize (Qwen 3.6 Plus, free via OpenRouter)
        await updateReportStatus(env.DB, reportId, 'synthesizing', null, totalSources, filteredOutCount);
        const report = await synthesizeReport(
            llmKey, query, filtered, totalSources, filteredOutCount, progress
        );

        // Step 5: Enrich with affiliate links
        const enrichedReport = enrichWithAffiliateLinks(report, amazonTag);
        enrichedReport.query = query;

        // Store products in D1. Stamp a stable id and rank onto each product so
        // the persisted report JSON and the D1 row share them; the client
        // affiliate CTA links to /api/go/:id, which looks the product up here.
        if (enrichedReport.products) {
            await Promise.all(enrichedReport.products.map((product, i) => {
                product.id = product.id || generateId();
                product.rank = product.rank || i + 1;
                return insertProduct(env.DB, {
                    id: product.id,
                    reportId,
                    name: product.name,
                    category: query,
                    rank: product.rank,
                    trustScore: product.trust_score || 0,
                    specs: product.specs || {},
                    pros: product.pros || [],
                    cons: product.cons || [],
                    bestFor: product.best_for || '',
                    priceRange: product.price_range || '',
                    affiliateLinks: product.affiliate_links || {},
                });
            }));
        }

        // Finalize
        const reportJson = JSON.stringify(enrichedReport);
        await updateReportStatus(env.DB, reportId, 'completed', reportJson, totalSources, filteredOutCount);
        await setFinalReport(env.KV, reportId, enrichedReport);
        await progress('Research complete!');

    } catch (err) {
        console.error('Pipeline error:', err);
        await progress(`Error: ${err.message}`);
        await updateReportStatus(env.DB, reportId, 'error', JSON.stringify({ error: err.message }), 0, 0);
        await setFinalReport(env.KV, reportId, { error: err.message });
    }
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
 * Store the final report in KV for quick retrieval.
 */
async function setFinalReport(kv, reportId, report) {
    await kv.put(`report:${reportId}`, JSON.stringify(report), { expirationTtl: 86400 });
}
