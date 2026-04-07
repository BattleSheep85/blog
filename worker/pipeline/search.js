/**
 * Search Phase: Gather real product reviews from free sources.
 * Reddit JSON API (free), HN Algolia (free), Serper (2500 free).
 * Then uses LLM to extract structured product data from raw results.
 */

import { callLLMWithFallback, MODELS, extractJSON } from '../lib/llm.js';
import { searchAll, fetchRedditComments } from '../lib/search.js';

const EXTRACTION_PROMPT = `You are a product research assistant. You have been given raw search results from Reddit, HackerNews, and Google about a product category.

Your job is to extract structured data from these results:
1. Identify distinct products mentioned
2. For each source, extract what the person actually said about the product
3. Note whether each source appears to be a genuine user experience

Return JSON with this structure:
{
    "products_found": ["Product A", "Product B"],
    "sources": [
        {
            "url": "https://...",
            "source_type": "reddit|hackernews|independent_review|youtube|forum|marketplace|web",
            "product_mentioned": "Product Name",
            "summary": "What the person actually said about their experience",
            "appears_genuine": true,
            "reasoning": "Why this appears genuine or not"
        }
    ]
}

Rules:
- Only include sources that actually discuss specific products
- Skip generic "what should I buy" questions with no answers
- Skip affiliate blog posts and "top 10 best" listicles
- Prefer sources where someone describes their actual experience using a product`;

/**
 * Execute the search phase of the research pipeline.
 * Gathers raw results from free APIs, then uses LLM to structure them.
 */
export async function searchForReviews(env, query, onProgress) {
    if (onProgress) await onProgress('Searching Reddit, HackerNews, and Google for real reviews...');

    // Step 1: Gather raw results from free sources
    const { results, errors } = await searchAll(query, env.SERPER_API_KEY, onProgress);

    if (results.length === 0) {
        return { products_found: [], sources: [], raw_count: 0 };
    }

    // Step 2: Fetch top Reddit comments for the most relevant posts
    if (onProgress) await onProgress('Reading top Reddit discussions...');
    const redditPosts = results
        .filter(r => r.sourceType === 'reddit' && r.numComments > 5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    const commentFetches = redditPosts.map(post => fetchRedditComments(post.url, { limit: 30 }));
    const commentResults = await Promise.allSettled(commentFetches);

    // Enrich reddit posts with their top comments
    const enrichedResults = [...results];
    for (let i = 0; i < redditPosts.length; i++) {
        const cr = commentResults[i];
        if (cr.status === 'fulfilled' && cr.value.comments?.length > 0) {
            // Add top comments as separate sources
            const topComments = cr.value.comments.slice(0, 10);
            for (const comment of topComments) {
                enrichedResults.push({
                    url: redditPosts[i].url,
                    title: `Comment on: ${redditPosts[i].title}`,
                    body: comment.body,
                    score: comment.score,
                    sourceType: 'reddit',
                    subreddit: redditPosts[i].subreddit,
                });
            }
        }
    }

    if (onProgress) await onProgress(`Collected ${enrichedResults.length} raw sources. Extracting product data...`);

    // Step 3: Use LLM to extract structured product info from raw results
    // Trim results to fit in context (keep most relevant)
    const trimmedResults = enrichedResults.slice(0, 60).map(r => ({
        url: r.url,
        title: r.title,
        text: (r.selftext || r.body || r.snippet || '').slice(0, 500),
        score: r.score || r.points || 0,
        source: r.sourceType,
        subreddit: r.subreddit,
    }));

    const response = await callLLMWithFallback(env.OPENROUTER_API_KEY, {
        model: MODELS.ANALYSIS,
        messages: [
            { role: 'system', content: EXTRACTION_PROMPT },
            {
                role: 'user',
                content: `Extract product information from these search results about: "${query}"\n\n${JSON.stringify(trimmedResults, null, 2)}`,
            },
        ],
        maxTokens: 4096,
    });

    let extracted;
    try {
        extracted = extractJSON(response);
    } catch {
        extracted = { products_found: [], sources: [], parse_error: true };
    }

    const sourceCount = extracted.sources?.length || 0;
    const productCount = extracted.products_found?.length || 0;

    if (onProgress) {
        await onProgress(`Identified ${productCount} products from ${sourceCount} genuine sources`);
    }

    return { ...extracted, raw_count: enrichedResults.length };
}
