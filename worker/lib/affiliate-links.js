import { isValidHttpsUrl } from './utils.js';

// Allowlist of retailer hostnames we recognize as "buy" destinations. Anything
// else (review sites, manufacturer pages, blogs) renders WITHOUT a buy CTA —
// we never fabricate a search-result link and call it "Buy on X".
const BUY_HOSTS = [
  'amazon.com',
  'walmart.com',
  'bestbuy.com',
  'newegg.com',
  'target.com',
  'bhphotovideo.com',
  'adorama.com',
  'costco.com',
  'microcenter.com',
];

// AffiliateIds shape (was a TS interface):
// { amazonTag, walmartImpact?, targetImpact?, bestbuyImpact?, neweggImpact?, bhphoto? }

// Strict host match — `hostname.includes('amazon.com')` would match
// `amazon.com.evil.example`. Always compare by exact match + suffix.
function hostMatches(host, target) {
  return host === target || host.endsWith(`.${target}`);
}

// Single source of truth for turning a raw retailer URL into the right
// affiliate link. Callers in both persistence (api.ts) and render paths
// (research-result.ts) use this so there's no divergence — a URL that can't
// be tagged here is stored as '' in D1 rather than being persisted then
// rejected at render time.
export function buildAffiliateUrl(rawUrl, ids) {
  if (!rawUrl || !isValidHttpsUrl(rawUrl)) return '';
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Reject retailer search-results URLs. The synthesis LLM sometimes
    // fabricates amazon.com/s?k=ProductName when it doesn't know the real
    // SKU; tagging a search URL and calling it "Buy on Amazon" is dishonest.
    if (hostMatches(host, 'amazon.com')) {
      if (path === '/s' || path.startsWith('/s/') || path === '/b') return '';
      const u = new URL(rawUrl);
      // Empty tag → strip any existing tag and render untagged URL. Used for
      // clean-link variants (e.g. ?src=reddit) where we must not advertise an
      // affiliate relationship per the target community's rules.
      if (ids.amazonTag) {
        u.searchParams.set('tag', ids.amazonTag);
      } else {
        u.searchParams.delete('tag');
      }
      return u.toString();
    }

    if (hostMatches(host, 'walmart.com') && (path.startsWith('/search') || path === '/s')) return '';
    if (hostMatches(host, 'target.com') && path.startsWith('/s/')) return '';
    if (hostMatches(host, 'bestbuy.com') && path.startsWith('/site/searchpage')) return '';

    // Amazon short links can't embed our tag. Empty so no fabricated CTA.
    if (host === 'amzn.to' || host === 'a.co') return '';

    if (ids.walmartImpact && hostMatches(host, 'walmart.com')) {
      return `https://goto.walmart.com/c/${encodeURIComponent(ids.walmartImpact)}/s/1?u=${encodeURIComponent(rawUrl)}`;
    }
    if (ids.targetImpact && hostMatches(host, 'target.com')) {
      return `https://goto.target.com/c/${encodeURIComponent(ids.targetImpact)}/s/1?u=${encodeURIComponent(rawUrl)}`;
    }
    if (ids.bestbuyImpact && hostMatches(host, 'bestbuy.com')) {
      return `https://bestbuy.7tiv.net/c/${encodeURIComponent(ids.bestbuyImpact)}/s/1?u=${encodeURIComponent(rawUrl)}`;
    }
    if (ids.neweggImpact && hostMatches(host, 'newegg.com')) {
      return `https://goto.newegg.com/c/${encodeURIComponent(ids.neweggImpact)}/s/1?u=${encodeURIComponent(rawUrl)}`;
    }
    if (ids.bhphoto && hostMatches(host, 'bhphotovideo.com')) {
      const u = new URL(rawUrl);
      u.searchParams.set('BI', ids.bhphoto);
      return u.toString();
    }

    // Known retailer without an affiliate ID configured — keep the URL as-is.
    if (BUY_HOSTS.some((h) => hostMatches(host, h))) return rawUrl;

    // Unknown host (review site, blog, manufacturer) — reject.
    return '';
  } catch {
    return '';
  }
}

// Fallback when no retailer product URL exists. An Amazon search URL with the
// affiliate tag still captures commission on ANYTHING the user buys in the
// next 24h — not just what the search returns. Labeled "Search on Amazon"
// (not "Buy") so we never imply we have a specific SKU we don't.
//
// Returns empty when name is too short or falsy; empty-string result is the
// caller's signal to render no fallback at all rather than a broken link.
export function buildAmazonSearchFallback(name, brand, tag) {
  const cleanName = (name || '').trim();
  if (cleanName.length < 3) return '';
  if (!tag) return '';
  const b = (brand || '').trim();
  // Avoid "TP-Link TP-Link Deco" when the product name already includes the
  // brand. Case-insensitive prefix check matches joinBrandAndName behavior
  // from research-result.ts.
  const query = b && !cleanName.toLowerCase().startsWith(b.toLowerCase())
    ? `${b} ${cleanName}`
    : cleanName;
  const encoded = encodeURIComponent(query);
  return `https://www.amazon.com/s?k=${encoded}&tag=${encodeURIComponent(tag)}`;
}

export function retailerLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/^goto\./, '').toLowerCase();
    if (hostMatches(host, 'amazon.com') || host === 'amazon.com') return 'Amazon';
    if (hostMatches(host, 'walmart.com') || host === 'walmart.com') return 'Walmart';
    if (hostMatches(host, 'bestbuy.com') || host.includes('bestbuy')) return 'Best Buy';
    if (hostMatches(host, 'newegg.com') || host === 'newegg.com') return 'Newegg';
    if (hostMatches(host, 'target.com') || host === 'target.com') return 'Target';
    if (hostMatches(host, 'bhphotovideo.com') || hostMatches(host, 'adorama.com')) return 'B&H Photo';
    const first = host.split('.')[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch { return 'Retailer'; }
}
