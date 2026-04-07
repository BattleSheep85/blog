/**
 * Synthesis Phase: Produce a ranked comparison report from verified sources.
 * Uses Qwen 3.6 Plus (free) for its superior writing quality.
 */

import { callLLMWithFallback, MODELS, extractJSON } from '../lib/llm.js';

const SYNTHESIS_PROMPT = `You are a product research analyst writing honest, no-BS comparison reports.

Your writing style:
- Plain English, direct, no marketing fluff
- No em dashes. Use commas, colons, or periods instead.
- State facts and cite sources
- Be honest about tradeoffs, every product has them
- Never recommend something just because it's popular
- If the data is insufficient, say so

Generate a structured comparison report as JSON only, no other text:
{
    "executive_summary": "2-3 sentence verdict with top pick and why",
    "products": [
        {
            "name": "Product Name",
            "rank": 1,
            "trust_score": 0-100,
            "verdict": "One sentence summary",
            "pros": ["pro1 (source: reddit user X)", "pro2 (source: RTINGS)"],
            "cons": ["con1 (source: forum post)", "con2 (source: YouTube review)"],
            "best_for": "Who should buy this",
            "price_range": "$XX - $XX",
            "specs": {"key1": "value1", "key2": "value2"},
            "source_count": 5,
            "notable_quote": "Direct quote from a real user that captures the product well"
        }
    ],
    "methodology": "Brief note on how many sources were analyzed vs filtered",
    "sources_summary": [
        {
            "url": "...",
            "source_type": "reddit",
            "trust_score": 85,
            "contribution": "What this source contributed to the analysis"
        }
    ],
    "category_insights": "Any broader insights about this product category"
}

Rank products by genuine user satisfaction, not by popularity or price. Weight sources by their trust scores.`;

/**
 * Synthesize filtered sources into a ranked comparison report.
 * Uses Qwen 3.6 Plus for better writing quality.
 */
export async function synthesizeReport(apiKey, query, filteredSources, totalSourceCount, filteredOutCount, onProgress) {
    if (onProgress) await onProgress('Synthesizing comparison report from verified sources...');

    if (filteredSources.length === 0) {
        return {
            executive_summary: 'Not enough verified sources were found to produce a reliable comparison. Try a more specific query.',
            products: [],
            methodology: `Searched for reviews but could not find enough genuine sources. ${totalSourceCount} sources found, all were filtered out due to low trust scores.`,
            sources_summary: [],
            category_insights: '',
        };
    }

    const response = await callLLMWithFallback(apiKey, {
        model: MODELS.SYNTHESIS,
        messages: [
            { role: 'system', content: SYNTHESIS_PROMPT },
            {
                role: 'user',
                content: `Generate a product comparison report for: "${query}"

Verified, genuine review sources (sorted by trust score):

${JSON.stringify(filteredSources, null, 2)}

Research stats:
- Total sources found: ${totalSourceCount}
- Sources that passed authenticity filtering: ${filteredSources.length}
- Sources filtered out (fake/low quality): ${filteredOutCount}

Create a comprehensive comparison report. Rank products by genuine user satisfaction. Cite sources for every claim.`,
            },
        ],
        maxTokens: 8192,
        temperature: 0.4,
    });

    let report;
    try {
        report = extractJSON(response);
    } catch (err) {
        // If JSON extraction fails, return a degraded report
        const { extractText } = await import('../lib/llm.js');
        const rawText = extractText(response);
        report = {
            executive_summary: rawText.slice(0, 500) || 'Report generation produced unstructured output.',
            products: [],
            methodology: `Analyzed ${filteredSources.length} sources from ${totalSourceCount} found. Output could not be parsed as structured data.`,
            sources_summary: filteredSources.slice(0, 10).map(s => ({
                url: s.url, source_type: s.source_type, trust_score: s.trust_score,
                contribution: s.summary || '',
            })),
            category_insights: '',
        };
    }

    if (onProgress) {
        const productCount = report.products ? report.products.length : 0;
        await onProgress(`Report complete: ${productCount} products ranked`);
    }

    return report;
}
