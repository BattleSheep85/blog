/**
 * Analysis Phase: Score each source for authenticity using DeepSeek R1.
 * Detects fake reviews, affiliate bias, and AI-generated content.
 * Uses free model via OpenRouter.
 */

import { callLLMWithFallback, MODELS, extractJSON } from '../lib/llm.js';

const ANALYSIS_PROMPT = `You are a fake review detection expert. Analyze each review source for authenticity.

Score each source on a 0-100 trust scale using these signals:

RED FLAGS (reduce score):
- Generic superlatives without specifics ("absolutely amazing product!")
- No mention of actual usage duration or specific features
- Suspiciously perfect grammar with no personality
- Source website is primarily affiliate-monetized
- Review appeared within days of product launch
- Reviewer posted many reviews in a short time window
- Text patterns matching known review farm output
- AI-generated writing patterns (overly structured, no personal voice)
- "I received this product for free/at a discount in exchange for my honest review"

GREEN FLAGS (increase score):
- Mentions specific use case and duration ("been using this for 6 months for X")
- Discusses both pros AND cons (not just positive)
- Posted in community forums with no financial incentive
- Contains specific technical details or measurements
- Responds to follow-up questions from other users
- Has a conversational, authentic voice
- Mentions comparisons to alternatives they've actually used
- Includes photos or detailed usage scenarios

Return JSON only, no other text:
{
    "analyzed_sources": [
        {
            "url": "...",
            "trust_score": 0-100,
            "is_fake": true/false,
            "red_flags": ["flag1", "flag2"],
            "green_flags": ["flag1", "flag2"],
            "key_claims": ["claim1", "claim2"],
            "product_mentioned": "Product Name",
            "source_type": "reddit|forum|independent_review|youtube|marketplace",
            "summary": "Brief summary of the genuine content"
        }
    ]
}`;

/**
 * Analyze a batch of sources for authenticity.
 * Uses DeepSeek R1 (free) for its strong reasoning.
 */
export async function analyzeSources(apiKey, sources, onProgress) {
    if (!sources || sources.length === 0) {
        return { analyzed_sources: [] };
    }

    if (onProgress) await onProgress(`Analyzing ${sources.length} sources for authenticity...`);

    // Batch to stay within context limits
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < sources.length; i += batchSize) {
        batches.push(sources.slice(i, i + batchSize));
    }

    const allAnalyzed = [];

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        if (onProgress && batches.length > 1) {
            await onProgress(`Analyzing batch ${i + 1}/${batches.length}...`);
        }

        const response = await callLLMWithFallback(apiKey, {
            model: MODELS.ANALYSIS,
            messages: [
                { role: 'system', content: ANALYSIS_PROMPT },
                {
                    role: 'user',
                    content: `Analyze these review sources for authenticity. Score each on a 0-100 trust scale.\n\nSources:\n${JSON.stringify(batch, null, 2)}`,
                },
            ],
            maxTokens: 4096,
        });

        try {
            const result = extractJSON(response);
            if (result.analyzed_sources) {
                allAnalyzed.push(...result.analyzed_sources);
            }
        } catch (err) {
            console.error(`Analysis batch ${i + 1} failed:`, err.message);
        }
    }

    const fakeCount = allAnalyzed.filter(s => s.is_fake).length;
    const genuineCount = allAnalyzed.length - fakeCount;

    if (onProgress) {
        await onProgress(`Authenticity analysis complete: ${genuineCount} genuine, ${fakeCount} fake/suspicious`);
    }

    return { analyzed_sources: allAnalyzed };
}

/**
 * Filter sources: remove fakes, sort by trust score descending.
 */
export function filterSources(analyzedSources, minTrustScore = 30) {
    return analyzedSources
        .filter(s => !s.is_fake && s.trust_score >= minTrustScore)
        .sort((a, b) => b.trust_score - a.trust_score);
}
