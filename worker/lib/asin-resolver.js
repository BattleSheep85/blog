/**
 * ASIN resolver: fill in direct Amazon /dp/ product links for products that
 * lack one.
 *
 * Why: expert review sources hide their Amazon links behind affiliate redirect
 * hops (amzn.to, skimresources, Impact, etc.), so the synthesis step rarely
 * attaches a canonical /dp/ASIN URL. Products then fall back to tagged Amazon
 * *search* links (buildAmazonSearchFallback) which convert far worse than a
 * direct product page. This module does one cheap Serper query per missing
 * product to recover the real /dp/ASIN.
 *
 * Subrequest budget: capped at MAX_RESOLVE (5) products → at most 5 outbound
 * fetches, run sequentially. This keeps us well under the Workers subrequest
 * limit and the Serper free-tier quota.
 *
 * Contract: NEVER throws. No key / quota / network error / no confident match
 * leaves the product unchanged (immutable — original object is returned as-is).
 */

import { buildAffiliateUrl } from './affiliate-links.js';

// Cap on how many products we spend a Serper query on per run. Reports carry
// 4-8 products; 8 covers every card so each quoted product links to its exact
// Amazon page whenever one exists (Serper ≈ $0.0003/query — negligible).
const MAX_RESOLVE = 8;
const TIMEOUT_MS = 8000;
const SERPER_ENDPOINT = 'https://google.serper.dev/search';

// /dp/ASIN extractor. credibility.js's extractAmazonProductUrls is content-wide
// and returns full URLs; here we want the ASIN out of a single result link,
// including the /gp/product/ form, so use a focused local regex.
const DP_ASIN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;

// Tokens too generic to count toward a title/product-name match.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'best', 'new', 'pro', 'plus',
  'amazon', 'com', 'inch', 'gen', 'series', 'edition', 'model', 'review',
]);

/**
 * Resolve direct Amazon /dp/ links for products missing one.
 *
 * @param {object} env - worker env (reads env.SERPER_API_KEY + affiliate tags)
 * @param {Array<object>} products - engine product objects (camelCase fields)
 * @param {(msg: string) => Promise<void>} [onProgress] - optional progress sink
 * @returns {Promise<Array<object>>} products with resolved product_url/affiliate_url
 *          on any that matched; unmatched/untouched products returned unchanged.
 */
export async function resolveAsins(env, products, onProgress) {
  if (!Array.isArray(products) || products.length === 0) return products;

  const apiKey = env?.SERPER_API_KEY;
  // No key → nothing to do. Don't burn the subrequest; return untouched.
  if (!apiKey) return products;

  const affiliateIds = affiliateIdsFromEnv(env);

  // Identify up to MAX_RESOLVE products lacking a usable direct /dp/ link, then resolve
  // them CONCURRENTLY (each is one Serper call; sequential resolution blew the queue-
  // consumer wall-clock on rich result sets and left runs stuck 'processing').
  let resolvedCount = 0;
  const out = products.slice();
  const targets = [];
  for (let i = 0; i < out.length && targets.length < MAX_RESOLVE; i++) {
    if (needsResolution(out[i])) targets.push(i);
  }
  await Promise.all(targets.map(async (i) => {
    try {
      const url = await resolveOne(out[i], apiKey);
      if (url) {
        const affiliateUrl = buildAffiliateUrl(url, affiliateIds);
        out[i] = { ...out[i], productUrl: url, affiliateUrl: affiliateUrl || out[i].affiliateUrl };
        resolvedCount++;
      }
    } catch (err) {
      console.log(`[asin-resolver] resolve failed for "${out[i]?.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  if (resolvedCount > 0 && typeof onProgress === 'function') {
    try {
      await onProgress(`Resolved ${resolvedCount} direct Amazon product link${resolvedCount === 1 ? '' : 's'}.`);
    } catch { /* progress is best-effort */ }
  }

  return out;
}

// A product needs resolution when it has no direct /dp/ or /gp/product Amazon
// URL already. A search URL, a non-Amazon URL, or no URL all qualify.
function needsResolution(product) {
  if (!product || typeof product !== 'object') return false;
  const url = product.productUrl;
  if (!url || typeof url !== 'string') return true;
  if (!/amazon\./i.test(url)) return true;
  return !DP_ASIN.test(url);
}

// One Serper query for a single product. Returns a canonical
// https://www.amazon.com/dp/ASIN URL on a confident match, else null.
async function resolveOne(product, apiKey) {
  const brand = (product.brand || '').trim();
  const name = (product.name || '').trim();
  if (name.length < 2) return null;

  const subject = (brand && !name.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${name}`
    : name).replace(/"/g, ''); // strip double-quotes that break Serper phrase queries
  const query = `site:amazon.com "${subject}"`;

  const response = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: 3 }),
  });

  if (!response.ok) {
    // Auth/quota/transient errors → unchanged product. Caller swallows.
    console.log(`[asin-resolver] serper HTTP ${response.status} q="${query}"`);
    return null;
  }

  const data = await response.json().catch(() => null);
  const organic = Array.isArray(data?.organic) ? data.organic : [];

  for (const item of organic) {
    const link = typeof item?.link === 'string' ? item.link : '';
    const m = link.match(DP_ASIN);
    if (!m) continue;
    // Sanity-check the result title loosely matches the product so we don't
    // attach an accessory/wrong-variant page. Require ≥2 shared significant
    // tokens between the product subject and the Serper result title.
    if (!titleMatches(subject, item?.title || '')) continue;
    return `https://www.amazon.com/dp/${m[1].toUpperCase()}`;
  }
  return null;
}

function affiliateIdsFromEnv(env) {
  return {
    amazonTag: env.AMAZON_AFFILIATE_TAG || env.AMAZON_ASSOCIATE_TAG || 'battlesheep0a-20',
    walmartImpact: env.WALMART_IMPACT_ID || undefined,
    targetImpact: env.IMPACT_TARGET_ID || undefined,
    bestbuyImpact: env.IMPACT_BESTBUY_ID || undefined,
    neweggImpact: env.IMPACT_NEWEGG_ID || undefined,
    bhphoto: env.BHPHOTO_AFFILIATE_ID || undefined,
  };
}

// Significant tokens: lowercase alphanumerics ≥2 chars, minus stopwords.
function significantTokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Loose match: ≥2 shared significant tokens between subject and result title.
function titleMatches(subject, title) {
  const a = new Set(significantTokens(subject));
  if (a.size === 0) return false;
  let shared = 0;
  for (const t of significantTokens(title)) {
    if (a.has(t)) {
      shared++;
      if (shared >= 2) return true;
    }
  }
  // Single distinctive token can suffice when the subject is itself a single
  // token (e.g. a one-word product name); otherwise require the 2-token bar.
  return a.size === 1 && shared >= 1;
}
