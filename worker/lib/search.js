/**
 * Web search layer: Reddit JSON API (free) + Serper.dev (2500 free) + HN Algolia (free).
 * All via plain fetch(). Zero cost for Reddit and HN.
 */

/**
 * Search Reddit via their public JSON API. No auth required.
 * Returns posts with titles, URLs, scores, and comment counts.
 */
export async function searchReddit(query, { limit = 25, sort = 'relevance', time = 'year' } = {}) {
    const params = new URLSearchParams({
        q: query,
        sort,
        t: time,
        limit: String(limit),
        type: 'link',
    });

    const response = await fetch(`https://www.reddit.com/search.json?${params}`, {
        headers: {
            'User-Agent': 'TrueRank/1.0 (product research tool)',
        },
    });

    if (!response.ok) {
        if (response.status === 429) {
            return { results: [], error: 'Reddit rate limited' };
        }
        return { results: [], error: `Reddit API error ${response.status}` };
    }

    const data = await response.json();
    const posts = (data.data?.children || []).map(child => {
        const post = child.data;
        return {
            title: post.title,
            url: `https://www.reddit.com${post.permalink}`,
            subreddit: post.subreddit,
            score: post.score,
            numComments: post.num_comments,
            selftext: (post.selftext || '').slice(0, 2000),
            created: new Date(post.created_utc * 1000).toISOString(),
            sourceType: 'reddit',
        };
    });

    return { results: posts };
}

/**
 * Fetch comments from a specific Reddit post. Free, no auth.
 */
export async function fetchRedditComments(postUrl, { limit = 50 } = {}) {
    const jsonUrl = postUrl.replace(/\/$/, '') + '.json?limit=' + limit;

    const response = await fetch(jsonUrl, {
        headers: {
            'User-Agent': 'TrueRank/1.0 (product research tool)',
        },
    });

    if (!response.ok) {
        return { comments: [], error: `Reddit comments error ${response.status}` };
    }

    const data = await response.json();
    // Reddit returns [post, comments] array
    const commentListing = data[1]?.data?.children || [];

    const comments = commentListing
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => ({
            body: c.data.body.slice(0, 2000),
            score: c.data.score,
            author: c.data.author,
            created: new Date(c.data.created_utc * 1000).toISOString(),
        }))
        .sort((a, b) => b.score - a.score);

    return { comments };
}

/**
 * Search HackerNews via Algolia API. Completely free, no auth.
 */
export async function searchHackerNews(query, { limit = 20 } = {}) {
    const params = new URLSearchParams({
        query,
        tags: 'story',
        hitsPerPage: String(limit),
    });

    const response = await fetch(`https://hn.algolia.com/api/v1/search?${params}`);

    if (!response.ok) {
        return { results: [], error: `HN API error ${response.status}` };
    }

    const data = await response.json();
    const results = (data.hits || []).map(hit => ({
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        points: hit.points,
        numComments: hit.num_comments,
        created: hit.created_at,
        sourceType: 'hackernews',
    }));

    return { results };
}

/**
 * Search via Serper.dev Google Search API. 2500 free searches.
 * Falls back gracefully if no API key or quota exhausted.
 */
export async function searchSerper(query, apiKey, { limit = 10 } = {}) {
    if (!apiKey) {
        return { results: [], error: 'No Serper API key configured' };
    }

    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
            q: query,
            num: limit,
        }),
    });

    if (!response.ok) {
        if (response.status === 429) {
            return { results: [], error: 'Serper rate limited / quota exhausted' };
        }
        return { results: [], error: `Serper API error ${response.status}` };
    }

    const data = await response.json();
    const results = (data.organic || []).map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        sourceType: classifyUrl(item.link),
    }));

    return { results };
}

/**
 * Classify a URL into a source type by domain.
 */
function classifyUrl(url) {
    if (!url) return 'unknown';
    const lower = url.toLowerCase();

    if (lower.includes('reddit.com')) return 'reddit';
    if (lower.includes('news.ycombinator.com')) return 'hackernews';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('rtings.com')) return 'independent_review';
    if (lower.includes('techpowerup.com')) return 'independent_review';
    if (lower.includes('tomshardware.com')) return 'review_outlet';
    if (lower.includes('wirecutter.com')) return 'review_outlet';
    if (lower.includes('amazon.com')) return 'marketplace';
    if (lower.includes('bestbuy.com')) return 'marketplace';

    // Check for known affiliate patterns
    if (lower.includes('/best-') || lower.includes('/top-10') || lower.includes('/top-5')) {
        return 'affiliate_blog';
    }

    return 'web';
}

/**
 * Run all search sources in parallel and combine results.
 * Reddit and HN are always free. Serper used only if key is available.
 */
export async function searchAll(query, serperKey, onProgress) {
    const searches = [
        searchReddit(query, { limit: 15 }),
        searchReddit(`${query} review`, { limit: 10 }),
        searchHackerNews(query, { limit: 10 }),
    ];

    // Only use Serper if key is configured
    if (serperKey) {
        searches.push(searchSerper(`${query} review`, serperKey, { limit: 10 }));
        searches.push(searchSerper(`${query} reddit recommendations`, serperKey, { limit: 5 }));
    }

    const settled = await Promise.allSettled(searches);

    const allResults = [];
    const errors = [];

    for (const result of settled) {
        if (result.status === 'fulfilled') {
            if (result.value.error) {
                errors.push(result.value.error);
            }
            if (result.value.results) {
                allResults.push(...result.value.results);
            }
            if (result.value.comments) {
                // If we got comments back, wrap them
                allResults.push(...result.value.comments.map(c => ({
                    ...c,
                    sourceType: 'reddit_comment',
                })));
            }
        } else {
            errors.push(result.reason?.message || 'Search failed');
        }
    }

    // Deduplicate by URL
    const seen = new Set();
    const deduped = allResults.filter(r => {
        const key = r.url || r.body?.slice(0, 100);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (onProgress) {
        await onProgress(`Collected ${deduped.length} results from ${settled.length} searches`);
        if (errors.length > 0) {
            await onProgress(`Search warnings: ${errors.join(', ')}`);
        }
    }

    return { results: deduped, errors };
}
