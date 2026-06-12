import { layout, html, jsonLdScript } from '../lib/html.js';
import { parseJsonSafe, isValidHttpsUrl, escapeHtml, timeAgo, displayQuery } from '../lib/utils.js';
import { buildAffiliateUrl, buildAmazonSearchFallback, retailerLabel } from '../lib/affiliate-links.js';
import { adSlot } from '../lib/ads.js';
import { getResearchBySlug, getProductsByResearchId } from '../lib/db.js';
import { searchBar } from '../lib/search-bar.js';

// inlined from src/types.ts for phase 1 (types.ts is erased in the port)
const DEFAULT_AFFILIATE_TAG = 'battlesheep0a-20';

// Icons for well-known metadata keys. Unknown keys render with a generic dot so
// new verticals render sensibly without code changes.
const METADATA_ICONS = {
  address: '&#128205;',        // pin
  hours: '&#128336;',           // clock
  phone: '&#128222;',           // phone
  mapsUrl: '&#128506;&#65039;', // map
  priceRange: '&#128176;',      // money bag
  cuisine: '&#127869;&#65039;', // fork/knife
  brand: '&#127991;&#65039;',   // label/tag
  modelNumber: '&#128295;',     // wrench
  releaseDate: '&#128197;',     // calendar
  availability: '&#128230;',    // package
  platform: '&#128187;',        // laptop
  creator: '&#128100;',         // bust
  length: '&#9202;',            // stopwatch
  contentType: '&#128214;',     // book
  location: '&#127758;',        // globe
  season: '&#127809;',          // leaf
  cost: '&#128181;',            // dollar
  duration: '&#9202;',          // stopwatch
  difficulty: '&#128170;',      // muscle
  serviceArea: '&#128506;&#65039;', // map
  pricingModel: '&#128200;',    // chart
  credentials: '&#127891;',     // grad cap
  responseTime: '&#9889;',      // bolt
};

function labelForMetadataKey(key) {
  const map = {
    mapsUrl: 'Map',
    priceRange: 'Price range',
    modelNumber: 'Model',
    releaseDate: 'Released',
    availability: 'Availability',
    contentType: 'Type',
    serviceArea: 'Service area',
    pricingModel: 'Pricing',
    responseTime: 'Response time',
  };
  if (map[key]) return map[key];
  // camelCase → "Camel case"; snake_case → "Snake case" (legacy rows persisted
  // before the orchestrator normalized metadata keys to camelCase).
  return key
    .replace(/_+/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function renderMetadataPairs(metadata) {
  // The orchestrator now writes a flat string map (see buildProductMetadata),
  // but legacy rows persisted numbers (trust_score) and nested objects
  // (affiliate_links). Render strings and numbers; skip objects/arrays/empties.
  const entries = Object.entries(metadata)
    .map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0);
  if (entries.length === 0) return '';
  return `<dl class="item-metadata" style="display:grid;grid-template-columns:max-content 1fr;gap:.3rem .6rem;font-size:.85rem;margin:.65rem 0;color:var(--ink-2)">
${entries.map(([k, v]) => {
    const icon = METADATA_ICONS[k] ?? '&#9679;';
    const label = escapeHtml(labelForMetadataKey(k));
    // Render mapsUrl / URL-ish values as links when they look like URLs
    const isUrl = /^https?:\/\//i.test(v) && isValidHttpsUrl(v);
    const value = isUrl
      ? `<a href="${escapeHtml(v)}" target="_blank" rel="noopener noreferrer nofollow" style="color:var(--accent)">${escapeHtml(new URL(v).hostname.replace(/^www\./, ''))}</a>`
      : escapeHtml(v);
    return `<dt style="color:var(--ink-3);white-space:nowrap"><span aria-hidden="true" style="margin-right:.3rem">${icon}</span>${label}</dt><dd style="margin:0">${value}</dd>`;
  }).join('')}
</dl>`;
}

// Soft gradient fallback when imageUrl is missing or fails to load. Keyed by
// first letter so different items get distinct visual treatments without
// needing a real image pipeline.
export function renderItemImage(imageUrl, name) {
  const safeName = escapeHtml(name.slice(0, 60));
  const letter = escapeHtml((name.trim().charAt(0) || '?').toUpperCase());
  const colorIndex = name.charCodeAt(0) % 6;
  const gradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#4c1d95,#7c3aed)',
    'linear-gradient(135deg,#14532d,#16a34a)',
    'linear-gradient(135deg,#7c2d12,#ea580c)',
    'linear-gradient(135deg,#831843,#db2777)',
    'linear-gradient(135deg,#0c4a6e,#0284c7)',
  ];
  const fallback = `<div class="item-image-fallback" aria-hidden="true" style="width:100%;aspect-ratio:16/9;background:${gradients[colorIndex]};display:flex;align-items:center;justify-content:center;border-radius:8px;margin-bottom:.75rem"><span style="font-size:2.5rem;font-weight:800;color:rgba(255,255,255,.85);letter-spacing:-.02em">${letter}</span></div>`;
  if (!imageUrl || !isValidHttpsUrl(imageUrl)) return fallback;
  // Broken hotlinks degrade gracefully: emit img + sibling fallback; a page-
  // level script swaps them on 'error'. Replaces the old inline onerror= that
  // was incompatible with nonce-based CSP.
  const hiddenFallback = fallback.replace('class="item-image-fallback"', 'class="item-image-fallback" hidden');
  return `<img class="item-image-photo" src="${escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;margin-bottom:.75rem;background:var(--surface-1)">
${hiddenFallback}`;
}

// Categories where "Buy on Amazon" is nonsensical — services, local professionals,
// regional food, real estate, etc. These get a "Visit site" / "Search online" CTA
// instead of the Amazon-search fallback so the page doesn't look idiotic.
const NON_PRODUCT_CATEGORY_HINTS = [
  'real estate', 'realtor', 'realty', 'broker',
  'service', 'services', 'professional', 'professionals',
  'agent', 'agents', 'contractor', 'contractors',
  'plumber', 'plumbing', 'electrician', 'hvac',
  'attorney', 'lawyer', 'legal', 'law firm',
  'insurance', 'accountant', 'cpa', 'tax',
  'therapist', 'therapy', 'counselor', 'counseling',
  'doctor', 'dentist', 'clinic', 'hospital',
  'restaurant', 'bakery', 'cafe', 'food',
  'local', 'regional',
  'consultant', 'consulting', 'agency',
];

export function isNonProductCategory(category) {
  if (!category) return false;
  const c = category.toLowerCase();
  return NON_PRODUCT_CATEGORY_HINTS.some((h) => c.includes(h));
}

// User-generated content hosts get rel="ugc"; everything else gets plain nofollow.
// All outbound source links stay nofollow so we don't hand PageRank to competitors.
const UGC_HOSTS = ['reddit.com', 'stackoverflow.com', 'stackexchange.com', 'quora.com', 'news.ycombinator.com', 'medium.com', 'substack.com'];

function sourceRel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const isUgc = UGC_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    return isUgc ? 'noopener noreferrer nofollow ugc' : 'noopener noreferrer nofollow';
  } catch {
    return 'noopener noreferrer nofollow';
  }
}

function sourceLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Find up to 5 sibling research pages that share canonical tokens. Used to build
// the "Related research" block — internal links Google rewards for topical depth,
// and a browse nudge for users who land on a page from search.
async function getRelatedResearch(db, currentSlug, canonical, category) {
  // Remote D1 rejects LIKE patterns over 50 bytes ("pattern too complex"), so
  // cap token length (the pattern adds 2 bytes of %). Also skip key:value
  // tokens that clarification-aware canonical queries embed — they are
  // metadata, not topic words, and only add noise to relatedness matching.
  const tokens = (canonical ?? '')
    .split(' ')
    .filter((t) => t.length > 1 && t.length <= 40 && !t.includes(':'))
    .slice(0, 8);
  if (tokens.length === 0) return [];

  const likeClauses = tokens.map((_, i) => `canonical_query LIKE ?${i + 2}`).join(' OR ');
  const sql = `SELECT slug, query, category, canonical_query, view_count, created_at
               FROM research
               WHERE status = 'complete'
                 AND slug != ?1
                 AND canonical_query IS NOT NULL
                 AND canonical_query != ?${tokens.length + 2}
                 AND EXISTS (SELECT 1 FROM products p WHERE p.research_id = research.id)
                 AND (${likeClauses})
               ORDER BY view_count DESC
               LIMIT 50`;

  const binds = [currentSlug, ...tokens.map((t) => `%${t}%`), canonical ?? ''];
  const rows = await db.prepare(sql).bind(...binds).all();
  const tokenSet = new Set(tokens);

  const scored = (rows.results ?? []).map((r) => {
    const otherTokens = new Set((r.canonical_query ?? '').split(' '));
    let shared = 0;
    for (const t of tokenSet) if (otherTokens.has(t)) shared++;
    const categoryBoost = category && r.category === category ? 1 : 0;
    return { ...r, score: shared * 2 + categoryBoost };
  });

  scored.sort((a, b) => (b.score - a.score) || (b.view_count - a.view_count));

  const seen = new Set();
  const deduped = [];
  for (const s of scored) {
    const key = s.canonical_query ?? s.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.score >= 2) deduped.push(s);
    if (deduped.length >= 5) break;
  }
  return deduped;
}

// Resolve every CTA target for one product in one place so renderProduct and
// the "Our pick" box stay in lockstep (same labels, same rel, same redirect
// vs. clean-link behavior). Returns:
//   retailer — small non-Amazon pill { url, label, rel, isSponsored }
//   amazon   — the primary Amazon button { url, label, href, exact } where href
//              is the click-tracked /api/go/:id redirect (or the plain url for
//              cleanLinks / missing id). url stays the raw https target used for
//              the isValidHttpsUrl guard. exact=true only for a real /dp/ page;
//              false means it's an explicit "Search Amazon" fallback.
//   google   — internal /find hand-off for categories Amazon doesn't sell
//              (lumber, vehicles, services). Never rendered alongside amazon.
//
// webOnly: the classifier flagged this category as not-sold-on-Amazon. NO
// Amazon link of any kind renders for these — the primary CTA hands off to
// Google via /find (monetized with AdSense-for-Search when configured).
export function resolveProductCtas(p, ids, isService, slug, cleanLinks, webOnly = false) {
  const mfrUrl = p.manufacturer_url && isValidHttpsUrl(p.manufacturer_url) ? p.manufacturer_url : '';
  const buyRaw = p.affiliate_url || p.product_url || '';

  let retailerCtaUrl = '';
  let retailerCtaLabel = '';
  let retailerCtaRel = 'noopener noreferrer nofollow sponsored';
  let retailerCtaIsSponsored = true;
  let amazonCtaUrl = '';
  let amazonCtaLabel = '';
  let amazonExact = false;
  let googleCtaUrl = '';
  let googleCtaLabel = '';

  const googleQuery = () => {
    const name = (p.name || '').trim();
    if (name.length < 3) return '';
    const b = (p.brand || '').trim();
    return b && !name.toLowerCase().startsWith(b.toLowerCase()) ? `${b} ${name}` : name;
  };

  if (isService || webOnly) {
    const serviceUrl = (mfrUrl || (buyRaw && isValidHttpsUrl(buyRaw) ? buyRaw : ''));
    if (serviceUrl) {
      retailerCtaUrl = serviceUrl;
      retailerCtaLabel = 'Visit site';
    }
    retailerCtaRel = 'noopener noreferrer nofollow';
    retailerCtaIsSponsored = false;
    const gq = googleQuery();
    if (gq) {
      googleCtaUrl = `/find?q=${encodeURIComponent(gq)}${slug ? `&ref=${encodeURIComponent(slug)}` : ''}`;
      googleCtaLabel = isService ? 'Find on Google' : 'Find sellers on Google';
    }
  } else {
    const affiliate = buildAffiliateUrl(buyRaw, ids);
    const isAmazonBuy = affiliate && /^https?:\/\/(www\.)?amazon\.com\//i.test(affiliate);
    if (isAmazonBuy) {
      amazonCtaUrl = affiliate;
      amazonCtaLabel = 'Buy on Amazon';
      amazonExact = true;
    } else {
      if (affiliate) {
        retailerCtaUrl = affiliate;
        retailerCtaLabel = `Buy on ${retailerLabel(affiliate)}`;
      }
      const searchFallback = buildAmazonSearchFallback(p.name, p.brand || '', ids.amazonTag);
      if (searchFallback) {
        amazonCtaUrl = searchFallback;
        amazonCtaLabel = 'Search Amazon';
      }
    }
  }

  // Route clicks through /api/go/:productId so every click lands in
  // affiliate_clicks. Exceptions: cleanLinks renders (the redirect always tags
  // the URL, which we must NOT do for affiliate-prohibited communities) and a
  // missing product id both fall back to the direct URL.
  let amazonCtaHref = amazonCtaUrl;
  if (amazonCtaUrl && !cleanLinks && p.id && slug) {
    amazonCtaHref = `/api/go/${encodeURIComponent(p.id)}?ref=${encodeURIComponent(slug)}&network=amazon`;
  }

  return {
    mfrUrl,
    retailer: { url: retailerCtaUrl, label: retailerCtaLabel, rel: retailerCtaRel, isSponsored: retailerCtaIsSponsored },
    amazon: { url: amazonCtaUrl, label: amazonCtaLabel, href: amazonCtaHref, exact: amazonExact },
    google: { url: googleCtaUrl, label: googleCtaLabel },
  };
}

// `p` arrives with pros/cons/specs/metadata already parsed (see
// renderResearchResult — the JSON columns are parsed exactly once after fetch).
function renderProduct(p, index, ids, isService, slug, cleanLinks, webOnly) {
  const { pros, cons, specs, metadata } = p;
  const rankClass = p.rank === 1 ? 'rank-1' : p.rank === 2 ? 'rank-2' : p.rank === 3 ? 'rank-3' : 'rank-n';

  // CTAs per product:
  //   1. amazonCta — BIG full-width button at the card bottom. Exact /dp/ URL
  //      → "Buy on Amazon"; no exact match → explicit "Search Amazon". Hidden
  //      for services/web-only categories and clean-link renders.
  //   2. googleCta — replaces the Amazon button for categories Amazon doesn't
  //      sell; internal /find hand-off (monetized via AdSense-for-Search).
  //   3. retailerCta — small pill in the links row. Non-Amazon retailers only
  //      (Walmart, Best Buy, etc.) so we don't duplicate the Amazon button.
  const ctas = resolveProductCtas(p, ids, isService, slug, cleanLinks, webOnly);
  const mfrUrl = ctas.mfrUrl;
  const retailerCtaUrl = ctas.retailer.url;
  const retailerCtaLabel = ctas.retailer.label;
  const retailerCtaRel = ctas.retailer.rel;
  const retailerCtaIsSponsored = ctas.retailer.isSponsored;
  const amazonCtaUrl = ctas.amazon.url;
  const amazonCtaLabel = ctas.amazon.label;
  const amazonCtaHref = ctas.amazon.href;

  const prosHtml = pros.map((pr) => html`<li>${pr}</li>`).join('');
  const consHtml = cons.map((c) => html`<li>${c}</li>`).join('');
  const specsHtml = Object.entries(specs).map(([k, v]) => html`<dt style="color:var(--ink-3)">${k}</dt><dd>${v}</dd>`).join('');

  // Secondary links row: manufacturer page + non-Amazon retailers (Walmart, etc.).
  const links = [];
  if (mfrUrl && !(isService && retailerCtaUrl === mfrUrl)) {
    links.push(`<a href="${escapeHtml(mfrUrl)}" target="_blank" rel="noopener noreferrer" class="product-link product-link-mfr">Product page <span aria-hidden="true">&#8599;</span></a>`);
  }
  if (retailerCtaUrl && isValidHttpsUrl(retailerCtaUrl)) {
    const cls = retailerCtaIsSponsored ? 'product-link product-link-buy' : 'product-link product-link-mfr';
    links.push(`<a href="${escapeHtml(retailerCtaUrl)}" target="_blank" rel="${retailerCtaRel}" class="${cls}">${escapeHtml(retailerCtaLabel)} <span aria-hidden="true">&#8599;</span></a>`);
  }

  // Primary CTA: full-width button at the very bottom of the card. Amazon when
  // the category is Amazon-viable (click-tracked href resolved in
  // resolveProductCtas, shared with Our pick); the /find Google hand-off when
  // it isn't. Never both.
  let amazonCtaBlock = '';
  if (amazonCtaUrl && isValidHttpsUrl(amazonCtaUrl)) {
    amazonCtaBlock = `<a href="${escapeHtml(amazonCtaHref)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="product-cta-amazon">${escapeHtml(amazonCtaLabel)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (ctas.google.url) {
    amazonCtaBlock = `<a href="${escapeHtml(ctas.google.url)}" class="product-cta-amazon">${escapeHtml(ctas.google.label)} <span aria-hidden="true">&#8599;</span></a>`;
  }

  const imageBlock = renderItemImage(p.image_url, p.name);
  const metadataBlock = renderMetadataPairs(metadata);

  return `<article class="product" id="product-${index + 1}">
${imageBlock}
<div class="product-header">
<div>
${p.rank != null ? `<span class="product-rank ${rankClass}">#${p.rank}</span>` : ''}
<h3 style="font-size:1.15rem;font-weight:700;color:var(--ink);margin-top:.3rem">${escapeHtml(p.name)}</h3>
${p.brand ? `<p style="color:var(--ink-2);font-size:.85rem">${escapeHtml(p.brand)}</p>` : ''}
</div>
<div style="text-align:right;flex-shrink:0">
${p.price != null ? `<p class="product-price">$${p.price.toLocaleString()}</p>` : ''}
${p.rating != null ? `<p class="product-rating"><span aria-hidden="true">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5 - Math.floor(p.rating))}</span> <span>${p.rating}/5</span></p>` : ''}
</div>
</div>
${p.best_for ? `<div class="product-bestfor">Best for: ${escapeHtml(p.best_for)}</div>` : ''}
${metadataBlock}
${p.verdict ? `<p class="product-verdict">${escapeHtml(p.verdict)}</p>` : ''}
${(pros.length > 0 || cons.length > 0) ? `<div class="pros-cons">
${pros.length > 0 ? `<div><h4 class="pro">Pros</h4><ul class="pro-list">${prosHtml}</ul></div>` : ''}
${cons.length > 0 ? `<div><h4 class="con">Cons</h4><ul class="con-list">${consHtml}</ul></div>` : ''}
</div>` : ''}
${specsHtml ? `<details><summary style="cursor:pointer;font-size:.85rem;color:var(--ink-3);font-weight:500">Specifications</summary>
<dl style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem .75rem;font-size:.85rem;margin-top:.75rem;background:var(--surface-2);padding:.75rem;border-radius:8px">${specsHtml}</dl></details>` : ''}
${links.length > 0 ? `<div class="product-links">${links.join('')}</div>` : ''}
${amazonCtaBlock}
</article>`;
}

// "Our pick" box: a high-visibility card for the rank-1 product, shown above the
// fold (right after the summary, before the top ad) so the answer beats the ad.
// Reuses resolveProductCtas so the CTA is byte-identical to the product card's.
function renderOurPick(p, ids, isService, slug, cleanLinks, webOnly) {
  if (!p) return '';
  const ctas = resolveProductCtas(p, ids, isService, slug, cleanLinks, webOnly);
  const ratingHtml = p.rating != null
    ? `<span class="ourpick-rating"><span aria-hidden="true">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5 - Math.floor(p.rating))}</span> <span>${p.rating}/5</span></span>`
    : '';
  const priceHtml = p.price != null ? `<span class="ourpick-price">$${p.price.toLocaleString()}</span>` : '';
  const a = ctas.amazon;
  const r = ctas.retailer;
  // Prefer the Amazon button (matches the card's primary CTA); fall back to the
  // retailer/service pill so services and non-Amazon picks still get a CTA.
  let ctaHtml = '';
  if (a.url && isValidHttpsUrl(a.url)) {
    ctaHtml = `<a href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="product-cta-amazon ourpick-cta">${escapeHtml(a.label)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (r.url && isValidHttpsUrl(r.url)) {
    ctaHtml = `<a href="${escapeHtml(r.url)}" target="_blank" rel="${r.rel}" class="product-cta-amazon ourpick-cta">${escapeHtml(r.label)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (ctas.google.url) {
    ctaHtml = `<a href="${escapeHtml(ctas.google.url)}" class="product-cta-amazon ourpick-cta">${escapeHtml(ctas.google.label)} <span aria-hidden="true">&#8599;</span></a>`;
  }
  return `<div class="ourpick-box" id="our-pick">
<div class="ourpick-eyebrow">Our pick</div>
<h2 class="ourpick-name">${escapeHtml(p.name)}</h2>
${(ratingHtml || priceHtml) ? `<div class="ourpick-meta">${ratingHtml}${priceHtml}</div>` : ''}
${p.verdict ? `<p class="ourpick-verdict">${escapeHtml(p.verdict)}</p>` : ''}
${ctaHtml}
</div>`;
}

// Tally credibility signals across the sources JSON for the "Why trust this"
// E-E-A-T panel. Sources persist as either plain URL strings (legacy: no
// credibility object → degrade to a bare count) or {url, credibility:{tags,...}}
// objects (engine port). Parse defensively; never throw on malformed rows.
function summarizeSourceCredibility(rawSources) {
  const arr = parseJsonSafe(rawSources, []);
  const list = Array.isArray(arr) ? arr : [];
  const stats = { total: 0, handsOn: 0, expert: 0, community: 0, downWeighted: 0, hasCredibility: false };
  for (const s of list) {
    if (!s) continue;
    stats.total++;
    // Credibility tags may live on s.credibility.tags, s.tags, or be absent.
    const cred = (s && typeof s === 'object') ? (s.credibility || s) : null;
    const tags = cred && Array.isArray(cred.tags) ? cred.tags : null;
    if (!tags) continue;
    stats.hasCredibility = true;
    const lower = tags.map((t) => String(t).toLowerCase());
    if (lower.some((t) => t.includes('hands-on'))) stats.handsOn++;
    if (lower.some((t) => t.includes('expert-domain') || t.includes('expert'))) stats.expert++;
    if (lower.some((t) => t.includes('community'))) stats.community++;
    if (lower.some((t) => t.includes('affiliate-conflict') || t.includes('listicle'))) stats.downWeighted++;
  }
  return stats;
}

// Quiet bordered E-E-A-T panel computed entirely from row data. Sits between the
// summary/Our-pick area and the buyer's guide: that is where a skeptical reader
// pauses before the recommendations, so the trust signal lands before the picks
// rather than buried near the sources footer.
function renderTrustPanel(rawSources, completedAtTs) {
  const s = summarizeSourceCredibility(rawSources);
  if (s.total === 0) return '';
  const dateLabel = completedAtTs
    ? new Date(completedAtTs * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const dateIso = completedAtTs ? new Date(completedAtTs * 1000).toISOString().slice(0, 10) : '';
  const chips = [];
  chips.push(`<span class="trust-chip"><strong>${s.total}</strong> source${s.total === 1 ? '' : 's'} analyzed</span>`);
  if (s.hasCredibility) {
    if (s.handsOn > 0) chips.push(`<span class="trust-chip"><strong>${s.handsOn}</strong> hands-on</span>`);
    if (s.expert > 0) chips.push(`<span class="trust-chip"><strong>${s.expert}</strong> expert</span>`);
    if (s.community > 0) chips.push(`<span class="trust-chip"><strong>${s.community}</strong> community</span>`);
    if (s.downWeighted > 0) chips.push(`<span class="trust-chip trust-chip-warn"><strong>${s.downWeighted}</strong> down-weighted</span>`);
  }
  return `<aside class="trust-panel" aria-label="Why trust this">
<div class="trust-panel-head">Why trust this</div>
<div class="trust-chips">${chips.join('')}</div>
${dateLabel ? `<p class="trust-panel-date">Synthesized <time datetime="${dateIso}">${escapeHtml(dateLabel)}</time>${s.hasCredibility ? '' : ' &middot; legacy report (no per-source credibility data)'}</p>` : ''}
<p class="trust-panel-disclosure">We may earn a commission on purchases made through links on this page. Rankings are produced from independent source analysis and are never paid placements.</p>
</aside>`;
}

// Return shape (was `export interface RenderedResearch` in the TS source):
// { html: string, lastModified: number } — lastModified is Unix seconds, used
// for the HTTP Last-Modified header.

export async function renderResearchResult(slug, env, fromQuery = null, cleanLinks = false) {
  const entry = await getResearchBySlug(env.DB, slug);
  if (!entry) return new Response('Not found', { status: 404 });

  const isComplete = entry.status === 'complete';

  // The three post-entry queries are independent — fetch products, related
  // research, and bump the view counter concurrently instead of serializing.
  const [productRows, related] = await Promise.all([
    getProductsByResearchId(env.DB, entry.id),
    isComplete ? getRelatedResearch(env.DB, slug, entry.canonical_query, entry.category) : Promise.resolve([]),
    // Increment views only for completed research.
    isComplete
      ? env.DB.prepare('UPDATE research SET view_count = view_count + 1 WHERE id = ?').bind(entry.id).run()
      : Promise.resolve(),
  ]);

  // Parse each product's JSON columns ONCE here, so renderProduct and the
  // JSON-LD builder both consume already-parsed values (no double JSON.parse).
  const products = (productRows.results ?? []).map((p) => ({
    ...p,
    pros: parseJsonSafe(p.pros, []),
    cons: parseJsonSafe(p.cons, []),
    specs: parseJsonSafe(p.specs, {}),
    metadata: parseJsonSafe(p.metadata, {}),
  }));

  const isProcessing = entry.status === 'pending' || entry.status === 'processing';
  const isFailed = entry.status === 'failed';

  const resultData = parseJsonSafe(entry.result, {});
  const buyersGuide = resultData.buyersGuide;
  const hasBuyersGuide = !!(buyersGuide && (buyersGuide.howToChoose || (buyersGuide.pitfalls?.length ?? 0) > 0 || (buyersGuide.marketingToIgnore?.length ?? 0) > 0));
  // Classifier verdict: this category isn't sold on Amazon (lumber, vehicles,
  // local venues, ...). Suppresses every Amazon link on the page; CTAs hand
  // off to Google via /find instead. Legacy rows without the facet default to
  // Amazon-viable.
  const rowFacets = parseJsonSafe(entry.facets, {}) || {};
  const webOnly = rowFacets.sold_on_amazon === false;
  // Service detection must mirror the orchestrator's ASIN-resolution gate
  // (is_service facet) — the category-string heuristic alone misses services
  // whose category label isn't in the hints list (e.g. "wedding photographer"),
  // which would render Amazon CTAs for a hire-a-professional page.
  const isService = isNonProductCategory(entry.category) || rowFacets.is_service === true;
  // sources persist as either plain URL strings (legacy) or {url, credibility}
  // objects (engine port). Normalize to the URL string for rendering.
  const sourceList = parseJsonSafe(entry.sources, [])
    .map((s) => (typeof s === 'string' ? s : s && typeof s.url === 'string' ? s.url : ''))
    .filter(isValidHttpsUrl);
  const clarifications = parseJsonSafe(entry.clarifications, {});

  const date = new Date(entry.created_at * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const createdIso = new Date(entry.created_at * 1000).toISOString().slice(0, 10);
  const lastModifiedTs = entry.completed_at ?? entry.created_at;
  const lastUpdatedLabel = new Date(lastModifiedTs * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lastUpdatedIso = new Date(lastModifiedTs * 1000).toISOString().slice(0, 10);
  // cleanLinks: strip ALL affiliate IDs for this render. Used when the page is
  // being linked from a community that prohibits affiliate URLs (e.g. Reddit).
  // Known retailer URLs still render as buy CTAs; they just go to the plain
  // retailer page instead of the tagged/redirect affiliate version.
  const affiliateIds = cleanLinks
    ? { amazonTag: '' }
    : {
        amazonTag: env.AMAZON_AFFILIATE_TAG || DEFAULT_AFFILIATE_TAG,
        walmartImpact: env.WALMART_IMPACT_ID || undefined,
        targetImpact: env.IMPACT_TARGET_ID || undefined,
        bestbuyImpact: env.IMPACT_BESTBUY_ID || undefined,
        neweggImpact: env.IMPACT_NEWEGG_ID || undefined,
        bhphoto: env.BHPHOTO_AFFILIATE_ID || undefined,
      };
  const pageUrl = `https://chrisputer.tech/research/${escapeHtml(slug)}`;
  const displayTitle = displayQuery(entry.query);
  const shareText = encodeURIComponent(displayTitle);
  const shareUrl = encodeURIComponent(pageUrl);

  const body = `<div class="container" style="max-width:64rem;padding:3rem 1.5rem">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--ink-2);margin-bottom:1rem">
<a href="/" style="color:var(--ink-2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--ink-3)">/</span>
<a href="/research" style="color:var(--ink-2)">Research</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--ink-3)">/</span>
<span style="color:var(--ink)">${escapeHtml(displayTitle)}</span>
</nav>
<div class="page-header">
<h1>${escapeHtml(displayTitle)}</h1>
${entry.category ? `<span class="card-badge">${escapeHtml(entry.category)}</span>` : ''}
<div class="page-meta">
<span>Published <time datetime="${createdIso}">${date}</time></span>
${entry.completed_at && entry.completed_at !== entry.created_at ? `<span>Last updated <time datetime="${lastUpdatedIso}">${lastUpdatedLabel}</time></span>` : ''}
<span>${entry.view_count} views</span>
<span>${products.length} products compared</span>
</div>
${entry.status === 'complete' ? `<div class="share-bar">
<span>Share:</span>
<a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener noreferrer" class="share-btn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Post</a>
<a href="https://reddit.com/submit?url=${shareUrl}&title=${shareText}" target="_blank" rel="noopener noreferrer" class="share-btn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.463.327.327 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>Reddit</a>
<button type="button" class="share-btn js-copy-link" data-url="${pageUrl}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>Copy link</button>
<form action="/research/new" method="POST" style="margin:0;display:inline-block"><input type="hidden" name="q" value="${escapeHtml(entry.query)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="share-btn" title="Skip the 14-day cluster cache and run the full pipeline again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582M20 20v-5h-.581M5.635 9A8 8 0 0118.418 7M18.418 15A8 8 0 015.635 13"/></svg>Re-run fresh</button></form>
</div>` : ''}
</div>

${fromQuery && fromQuery !== entry.query ? `<div class="cluster-banner" style="padding:.9rem 1.15rem;background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:12px;margin:1.25rem 0;display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between">
<div style="font-size:.88rem;color:var(--ink-2);flex:1;min-width:0">
<strong style="color:var(--ink)">Matched to existing research.</strong> You asked &ldquo;${escapeHtml(fromQuery)}&rdquo; — we already researched a very similar question (${date}).
</div>
<form action="/research/new" method="POST" style="margin:0"><input type="hidden" name="q" value="${escapeHtml(fromQuery)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="btn" style="font-size:.82rem;padding:.5rem .85rem;white-space:nowrap">Re-research with fresh data</button></form>
</div>` : ''}

${Object.keys(clarifications).length > 0 ? `<div class="clarifications-bar" style="margin:1.25rem 0;padding:.75rem 1rem;background:var(--surface-1);border:1px solid var(--line);border-radius:10px">
<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:600;margin-bottom:.4rem">Researched for</div>
<div style="display:flex;flex-wrap:wrap;gap:.4rem">
${Object.entries(clarifications).map(([k, v]) => `<span class="card-badge" style="font-size:.78rem"><strong style="color:var(--ink)">${escapeHtml(k.replace(/_/g, ' '))}:</strong> ${escapeHtml(v)}</span>`).join('')}
</div>
</div>` : ''}

${isProcessing ? `<div id="processing" style="padding:1.5rem;background:var(--surface-1);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:0.875rem;margin:2rem 0">
<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem">
<div class="spinner" style="width:1.5rem;height:1.5rem;border-width:2px;margin:0;flex-shrink:0"></div>
<div>
<h2 style="font-size:1.1rem;font-weight:600;margin-bottom:.15rem">Researching</h2>
<p style="color:var(--ink-3);font-size:.8rem" id="source-count">Starting...</p>
</div>
</div>
<div id="preview-box" style="display:none;padding:1rem 1.15rem;margin-bottom:1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 8%,transparent),color-mix(in srgb,var(--accent) 8%,transparent));border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:10px">
<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:600;margin-bottom:.5rem">Quick answer &middot; from prior knowledge</div>
<div id="preview-text" style="font-size:.92rem;line-height:1.55;color:var(--ink-2);white-space:pre-wrap"></div>
</div>
<div id="activity-feed" class="activity-feed"></div>
<div class="notify-box" style="margin-top:1.25rem;padding:.9rem 1.05rem;background:color-mix(in srgb,var(--accent) 6%,transparent);border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:10px">
<label for="notify-email" style="display:block;font-size:.82rem;color:var(--ink-2);margin-bottom:.5rem">This can take a minute. Want an email when it&rsquo;s ready?</label>
<form id="notify-form" style="display:flex;gap:.5rem;flex-wrap:wrap;margin:0">
<input id="notify-email" type="email" name="email" required placeholder="you@example.com" autocomplete="email" maxlength="254" style="flex:1;min-width:12rem;padding:.55rem .7rem;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--ink);font-size:.88rem">
<button type="submit" class="btn" style="font-size:.85rem;padding:.55rem 1rem;white-space:nowrap">Notify me</button>
</form>
<p id="notify-msg" role="status" aria-live="polite" style="font-size:.8rem;color:var(--ink-3);margin-top:.5rem;min-height:1em"></p>
</div>
</div>` : ''}

${isFailed ? `<div style="padding:1.5rem;background:var(--trust-low-bg);border:1px solid color-mix(in srgb,var(--trust-low) 40%,transparent);border-radius:0.875rem;margin:2rem 0">
<h2 style="color:var(--trust-low);font-size:1.1rem;font-weight:600;margin-bottom:.5rem">Research failed</h2>
<p style="color:var(--ink-2)">Something went wrong during analysis. This could be due to insufficient source data.</p>
<form method="POST" action="/research/new" style="margin-top:1rem"><input type="hidden" name="q" value="${escapeHtml(entry.query)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="btn">Try again</button></form>
</div>` : ''}

${entry.status === 'complete' ? (() => {
  const tocItems = [];
  if (entry.summary) tocItems.push({ id: 'summary', label: 'Summary' });
  if (hasBuyersGuide) tocItems.push({ id: 'buyers-guide', label: "Buyer's guide" });
  if (products.length > 0) tocItems.push({ id: 'products', label: isService ? 'Recommendations' : 'Products compared' });
  if (resultData.methodology) tocItems.push({ id: 'methodology', label: 'Methodology' });
  if (sourceList.length > 0) tocItems.push({ id: 'sources', label: `Sources (${sourceList.length})` });
  if (related.length > 0) tocItems.push({ id: 'related', label: 'Related research' });
  if (tocItems.length < 3) return '';
  return `<nav class="toc" aria-label="Table of contents" style="margin:1.5rem 0;padding:.85rem 1rem;background:var(--surface-1);border:1px solid var(--line);border-radius:10px">
<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:600;margin-bottom:.5rem">On this page</div>
<ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.5rem .9rem;font-size:.88rem">${tocItems.map((t) => `<li><a href="#${t.id}" style="color:var(--ink-2);text-decoration:none;border-bottom:1px dotted var(--ink-3)">${escapeHtml(t.label)}</a></li>`).join('')}</ul>
</nav>`;
})() : ''}

${entry.summary ? `<div class="summary-box"><h2 id="summary">Summary</h2><p>${escapeHtml(entry.summary)}</p></div>` : ''}

${entry.status === 'complete' && products.length > 0 ? renderOurPick(products.find((p) => p.rank === 1) || products[0], affiliateIds, isService, slug, cleanLinks, webOnly) : ''}

${entry.status === 'complete' ? renderTrustPanel(entry.sources, entry.completed_at) : ''}

${entry.status === 'complete' ? adSlot(env, 'top', 'Advertisement') : ''}

${hasBuyersGuide && buyersGuide ? `<section class="buyers-guide" style="background:var(--surface-1);border:1px solid var(--line);border-radius:0.875rem;padding:1.5rem;margin-bottom:2rem">
<h2 id="buyers-guide" style="font-size:1.1rem;font-weight:600;margin-bottom:1rem">Buyer's guide</h2>
${buyersGuide.howToChoose ? `<h3 style="font-size:.85rem;font-weight:600;color:var(--ink);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">How to choose</h3>
<p style="color:var(--ink-2);font-size:.92rem;line-height:1.65;margin-bottom:1.25rem">${escapeHtml(buyersGuide.howToChoose)}</p>` : ''}
${(buyersGuide.pitfalls?.length ?? 0) > 0 ? `<h3 style="font-size:.85rem;font-weight:600;color:var(--trust-medium);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Common pitfalls</h3>
<ul style="color:var(--ink-2);font-size:.92rem;line-height:1.65;margin-bottom:1.25rem;padding-left:1.1rem">${buyersGuide.pitfalls.map((p) => `<li style="margin-bottom:.35rem">${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
${(buyersGuide.marketingToIgnore?.length ?? 0) > 0 ? `<h3 style="font-size:.85rem;font-weight:600;color:var(--trust-low);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Marketing to ignore</h3>
<ul style="color:var(--ink-2);font-size:.92rem;line-height:1.65;padding-left:1.1rem">${buyersGuide.marketingToIgnore.map((p) => `<li style="margin-bottom:.35rem">${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
</section>` : ''}

${products.length > 0 ? `<h2 id="products" style="font-size:1.25rem;font-weight:700;margin-bottom:1.5rem">${isService ? 'Recommendations' : 'Products compared'}</h2>
<div class="product-grid">${products.map((p, i) => {
  const card = renderProduct(p, i, affiliateIds, isService, slug, cleanLinks, webOnly);
  // Mid-list ad after rank 3 when there are 5+ items — keeps the ad out of
  // the above-fold view on short comparisons but catches mid-scroll engagement.
  const midAd = (i === 2 && products.length >= 5) ? adSlot(env, 'mid', 'Advertisement') : '';
  return card + midAd;
}).join('')}</div>
${adSlot(env, 'bottom', 'Advertisement')}` : ''}

${(resultData.methodology || sourceList.length > 0) ? `<div class="sources" style="margin-top:2rem">
${resultData.methodology ? `<h2 id="methodology" style="font-size:1.1rem;font-weight:600;margin-bottom:.5rem">Methodology</h2><p style="font-size:.85rem;color:var(--ink-2);margin-bottom:1rem">${escapeHtml(resultData.methodology)}</p>` : ''}
${sourceList.length > 0 ? `<h2 id="sources" style="font-size:1.1rem;font-weight:600;margin-bottom:.5rem">Sources (${sourceList.length})</h2>${sourceList.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="${sourceRel(u)}">${escapeHtml(sourceLabel(u))}</a>`).join('')}` : ''}
</div>` : ''}

${related.length > 0 ? `<section class="related-research" style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)">
<h2 id="related" style="font-size:1.1rem;font-weight:600;margin-bottom:1rem">Related research</h2>
<div class="grid">${related.map((r) => `<a class="card" href="/research/${escapeHtml(r.slug)}">
${r.category ? `<div class="card-top"><span class="card-badge">${escapeHtml(r.category)}</span><span class="card-time">${timeAgo(r.created_at * 1000)}</span></div>` : `<div class="card-top"><span class="card-time">${timeAgo(r.created_at * 1000)}</span></div>`}
<h3>${escapeHtml(displayQuery(r.query))}</h3>
</a>`).join('')}</div>
</section>` : ''}

${entry.status === 'complete' ? `<section id="talk-about-it" style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)">
<h2 style="font-size:1.1rem;font-weight:600;margin-bottom:.35rem">Talk about it</h2>
<p style="font-size:.88rem;color:var(--ink-2);margin-bottom:1rem">Ask anything about this comparison — why one ranked above another, which fits your situation, what to watch out for.</p>
<div class="chat-panel" style="background:var(--surface-1);border:1px solid var(--line);border-radius:0.875rem;padding:1rem">
<div id="chat-messages" style="display:flex;flex-direction:column;gap:.6rem;max-height:22rem;overflow-y:auto;margin-bottom:.75rem" aria-live="polite"></div>
<form id="chat-form" style="display:flex;gap:.5rem;margin:0">
<label for="chat-input" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Your question</label>
<input id="chat-input" type="text" maxlength="2000" autocomplete="off" placeholder="e.g. Which one is best for a small apartment?" style="flex:1;min-width:0;padding:.6rem .75rem;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--ink);font-size:.9rem">
<button type="submit" class="btn" style="font-size:.85rem;padding:.6rem 1rem;white-space:nowrap">Ask</button>
</form>
<p id="chat-status" role="status" aria-live="polite" style="font-size:.78rem;color:var(--ink-3);margin-top:.5rem;min-height:1em"></p>
</div>
</section>` : ''}

<div style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)">
<h2 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem">Research something else</h2>
${searchBar('compact')}
</div>
${entry.status === 'complete' ? `<div class="notify-footer" style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--line)">
<form id="notify-form" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:0">
<label for="notify-email" style="font-size:.88rem;color:var(--ink-2);flex:1;min-width:14rem">Get notified when we re-research this category</label>
<input id="notify-email" type="email" name="email" required placeholder="you@example.com" autocomplete="email" maxlength="254" style="flex:1;min-width:12rem;padding:.55rem .7rem;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--ink);font-size:.88rem">
<button type="submit" class="btn" style="font-size:.85rem;padding:.55rem 1rem;white-space:nowrap">Notify me</button>
</form>
<p id="notify-msg" role="status" aria-live="polite" style="font-size:.8rem;color:var(--ink-3);margin-top:.5rem;min-height:1em"></p>
</div>` : ''}
</div>`;

  // JSON-LD structured data for SEO
  const isoDate = new Date(entry.created_at * 1000).toISOString();
  // priceValidUntil: 30 days from page's last completion (Google Product rich-snippet requirement)
  const priceValidUntil = new Date((lastModifiedTs + 30 * 86400) * 1000).toISOString().split('T')[0];
  const jsonLdProducts = products.map((p) => {
    const item = {
      '@type': 'Product',
      name: p.name,
    };
    if (p.brand) item.brand = { '@type': 'Brand', name: p.brand };
    // p.pros is already parsed to an array (parsed once after the products
    // fetch). The column is best_for, not bestFor.
    const prosArr = p.pros;
    const descSource = p.verdict || p.best_for || (prosArr.length > 0 ? prosArr.slice(0, 3).join('. ') : '');
    if (descSource) item.description = descSource;
    // Only emit an Offer if we have a real retailer URL for this specific SKU.
    // Google's Product guidelines want offers.url to be the actual buy page;
    // search-results URLs are explicitly discouraged and can hurt rankings.
    const offerRaw = p.affiliate_url || p.product_url || '';
    const offerAffiliate = offerRaw ? buildAffiliateUrl(offerRaw, affiliateIds) : '';
    if (p.price != null && offerAffiliate) {
      // We don't run transactions or know real-time stock, so we omit
      // `availability`. `seller` mirrors the retailer we link out to.
      let sellerHost = '';
      try { sellerHost = new URL(offerAffiliate).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
      const offer = {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'USD',
        priceValidUntil,
        url: offerAffiliate,
        ...(sellerHost ? { seller: { '@type': 'Organization', name: retailerLabel(offerAffiliate) } } : {}),
      };
      item.offers = offer;
    }
    if (p.verdict) {
      const review = {
        '@type': 'Review',
        reviewBody: p.verdict,
        datePublished: isoDate,
        author: { '@type': 'Organization', name: 'Chrisputer Labs', url: 'https://chrisputer.tech' },
      };
      if (p.rating != null) review.reviewRating = { '@type': 'Rating', ratingValue: p.rating, bestRating: 5, worstRating: 0 };
      item.review = review;
    }
    return item;
  });

  const isoModified = new Date(lastModifiedTs * 1000).toISOString();
  const articleImage = `https://chrisputer.tech/research/${slug}/og.svg`;
  const keywordTerms = entry.query.split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|best|top|good|great)$/i.test(w)).slice(0, 8);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${pageUrl}#article`,
    url: pageUrl,
    isPartOf: { '@id': 'https://chrisputer.tech/#website' },
    headline: displayTitle,
    description: entry.summary ?? '',
    image: [articleImage],
    inLanguage: 'en-US',
    datePublished: isoDate,
    dateModified: isoModified,
    ...(entry.category ? { articleSection: entry.category } : {}),
    ...(keywordTerms.length > 0 ? { keywords: keywordTerms.join(', ') } : {}),
    author: {
      '@id': 'https://chrisputer.tech/#organization',
      '@type': 'Organization',
      name: 'Chrisputer Labs',
      url: 'https://chrisputer.tech',
    },
    publisher: {
      '@id': 'https://chrisputer.tech/#organization',
      '@type': 'Organization',
      name: 'Chrisputer Labs',
      url: 'https://chrisputer.tech',
      logo: { '@type': 'ImageObject', url: 'https://chrisputer.tech/og.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };

  // Separate top-level ItemList is what Google Rich Results actually parses
  // for "list of products" display. Nesting Products inside Article.about is
  // valid schema.org but rarely triggers list rich snippets.
  const itemListLd = jsonLdProducts.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: displayTitle,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: jsonLdProducts.length,
    itemListElement: jsonLdProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: p,
    })),
  } : null;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chrisputer.tech/' },
      { '@type': 'ListItem', position: 2, name: 'Research', item: 'https://chrisputer.tech/research' },
      { '@type': 'ListItem', position: 3, name: displayTitle, item: pageUrl },
    ],
  };

  const structuredData = entry.status === 'complete'
    ? jsonLdScript(jsonLd) +
      (itemListLd ? jsonLdScript(itemListLd) : '') +
      jsonLdScript(breadcrumbLd)
    : '';

  const layoutMeta = {
    ogUrl: pageUrl,
    ogType: 'article',
    ogImage: `https://chrisputer.tech/research/${escapeHtml(slug)}/og.svg`,
    twitterCard: 'summary_large_image',
    // Always canonical to the clean URL so ?src=... variants don't fragment SEO.
    canonical: pageUrl,
    article: {
      publishedTime: isoDate,
      modifiedTime: isoModified,
      author: 'Chrisputer Labs',
      ...(entry.category ? { section: entry.category } : {}),
      ...(keywordTerms.length > 0 ? { tags: keywordTerms } : {}),
    },
  };

  const turnstileScript = env.TURNSTILE_SITE_KEY
    ? '<script nonce="__CSP_NONCE__" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : '';

  // Always-on wiring: copy-link buttons + image fallback swap on error. These
  // replace the old inline onclick/onerror handlers that nonce-based CSP
  // refuses to execute.
  const pageBehaviorScript = `<script nonce="__CSP_NONCE__">
(function(){
  function wireCopy(){
    document.querySelectorAll('.js-copy-link').forEach(function(btn){
      if(btn.__wired)return;btn.__wired=true;
      var original=btn.innerHTML;
      btn.addEventListener('click',function(){
        var url=btn.dataset.url||'';
        if(!url||!navigator.clipboard)return;
        navigator.clipboard.writeText(url).then(function(){
          btn.textContent='Copied!';
          setTimeout(function(){btn.innerHTML=original},2000);
        });
      });
    });
  }
  function wireImages(){
    document.querySelectorAll('.item-image-photo').forEach(function(img){
      if(img.__wired)return;img.__wired=true;
      img.addEventListener('error',function(){
        img.hidden=true;
        var fb=img.nextElementSibling;
        if(fb&&fb.classList.contains('item-image-fallback'))fb.hidden=false;
      });
    });
  }
  function run(){wireCopy();wireImages()}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run)}else{run()}
  // Expose for post-swap rewiring after the activity feed completes a research.
  window.__rewire=run;
})();
</script>`;

  const activityFeedScript = `<noscript><meta http-equiv="refresh" content="10"></noscript>
<script nonce="__CSP_NONCE__">
document.addEventListener('DOMContentLoaded',function(){
  var feed=document.getElementById('activity-feed');
  var counter=document.getElementById('source-count');
  if(!feed)return;
  var slug='${escapeHtml(slug)}';
  var lastSeq=0;
  var sources=0;
  var pollCount=0;
  var icons={search:'\u{1F50D}',fetch:'\u{1F4D6}',note:'\u{1F4DD}',synthesize:'\u{2728}',status:'\u{2139}\uFE0F',error:'\u{26A0}\uFE0F'};
  function poll(){
    pollCount++;
    fetch('/api/research/'+slug+'/events?since='+lastSeq)
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.preview){
          var box=document.getElementById('preview-box');
          var txt=document.getElementById('preview-text');
          if(box&&txt&&box.style.display==='none'){
            txt.textContent=d.preview;
            box.style.display='block';
          }
        }
        if(d.events&&d.events.length>0){
          d.events.forEach(function(e){
            var div=document.createElement('div');
            div.className='activity-item activity-'+e.event_type;
            div.textContent=(icons[e.event_type]||'\u{25CF}')+' '+e.message;
            feed.appendChild(div);
            feed.scrollTop=feed.scrollHeight;
            lastSeq=e.seq;
            if(e.event_type==='search')sources++;
          });
          if(counter)counter.textContent=sources+' searches completed';
        }
        if(d.status==='complete'){
          // In-place swap: fetch the now-rendered page, splice in .container content.
          // Falls back to reload if anything goes wrong. Also re-wires inline
          // handlers on the freshly-inserted DOM via window.__rewire.
          fetch(location.pathname,{cache:'no-store'})
            .then(function(r){return r.text()})
            .then(function(html){
              try{
                var parser=new DOMParser();
                var doc=parser.parseFromString(html,'text/html');
                var fresh=doc.querySelector('.container');
                var current=document.querySelector('.container');
                if(fresh&&current){
                  current.replaceWith(fresh);
                  document.title=doc.title;
                  if(typeof window.__rewire==='function')window.__rewire();
                  window.scrollTo({top:0,behavior:'smooth'});
                }else{location.reload()}
              }catch(e){location.reload()}
            })
            .catch(function(){location.reload()});
        }else if(d.status==='failed'){
          var div=document.createElement('div');
          div.className='activity-item activity-error';
          div.textContent='\u{26A0}\uFE0F Research failed. Reloading...';
          feed.appendChild(div);
          setTimeout(function(){location.reload()},2000);
        }else{
          setTimeout(poll,pollCount<3?500:1000);
        }
      })
      .catch(function(){setTimeout(poll,3000)});
  }
  poll();
});
</script>`;
  // Email capture: wires whichever #notify-form is on the page (the compact box
  // on processing pages, or the footer form on completed pages) to POST
  // /api/subscribe. researchId is the report id so we can notify on re-research.
  const subscribeScript = `<script nonce="__CSP_NONCE__">
(function(){
  function wire(){
    var form=document.getElementById('notify-form');
    if(!form||form.__wired)return;form.__wired=true;
    var input=document.getElementById('notify-email');
    var msg=document.getElementById('notify-msg');
    var researchId='${escapeHtml(entry.id)}';
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var email=(input&&input.value||'').trim();
      if(!email)return;
      if(msg)msg.textContent='Saving...';
      fetch('/api/subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email,researchId:researchId})
      }).then(function(r){return r.json()}).then(function(d){
        if(d&&d.ok){
          if(msg)msg.textContent="Thanks! We'll email you.";
          form.style.display='none';
        }else{
          if(msg)msg.textContent='That email looks off. Try again?';
        }
      }).catch(function(){
        if(msg)msg.textContent='Something went wrong. Try again later.';
      });
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',wire)}else{wire()}
  // Re-wire the footer form that appears after the processing->complete in-place
  // swap (window.__rewire is defined by the page behavior script above).
  var prev=window.__rewire;
  window.__rewire=function(){if(typeof prev==='function')prev();wire()};
})();
</script>`;
  // "Talk about it": grounded follow-up chat against this report via /api/chat.
  // Transcript lives client-side (max 16 turns, matching the API cap); when the
  // model suggests a fresh research query, render a one-click run button.
  const chatScript = `<script nonce="__CSP_NONCE__">
(function(){
  function wire(){
    var form=document.getElementById('chat-form');
    if(!form||form.__wired)return;form.__wired=true;
    var input=document.getElementById('chat-input');
    var box=document.getElementById('chat-messages');
    var status=document.getElementById('chat-status');
    var slug='${escapeHtml(slug)}';
    var transcript=[];
    function bubble(role,text){
      var div=document.createElement('div');
      div.style.cssText='max-width:85%;padding:.55rem .8rem;border-radius:10px;font-size:.9rem;line-height:1.5;white-space:pre-wrap;'+(role==='user'
        ?'align-self:flex-end;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--ink)'
        :'align-self:flex-start;background:var(--surface-2);color:var(--ink-2)');
      div.textContent=text;
      box.appendChild(div);
      box.scrollTop=box.scrollHeight;
      return div;
    }
    function suggestBtn(q){
      var f=document.createElement('form');
      f.method='POST';f.action='/research/new';
      f.style.cssText='align-self:flex-start;margin:0';
      var h=document.createElement('input');h.type='hidden';h.name='q';h.value=q;f.appendChild(h);
      var b=document.createElement('button');b.type='submit';b.className='btn';
      b.style.cssText='font-size:.82rem;padding:.5rem .85rem';
      b.textContent='Research: '+q;
      f.appendChild(b);box.appendChild(f);box.scrollTop=box.scrollHeight;
    }
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var text=(input.value||'').trim();
      if(!text||form.__busy)return;
      form.__busy=true;input.value='';
      if(transcript.length>=14)transcript=transcript.slice(transcript.length-13);
      transcript.push({role:'user',content:text});
      bubble('user',text);
      var thinking=bubble('assistant','\\u2026');
      if(status)status.textContent='';
      fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,messages:transcript})})
        .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
        .then(function(res){
          form.__busy=false;
          if(res.ok&&res.d&&res.d.reply){
            thinking.textContent=res.d.reply;
            transcript.push({role:'assistant',content:res.d.reply});
            if(res.d.suggestedQuery)suggestBtn(res.d.suggestedQuery);
          }else{
            thinking.remove();transcript.pop();
            if(status)status.textContent=(res.d&&res.d.error)||'Something went wrong. Try again.';
          }
        })
        .catch(function(){
          form.__busy=false;thinking.remove();transcript.pop();
          if(status)status.textContent='Network error. Try again.';
        });
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',wire)}else{wire()}
  var prev=window.__rewire;
  window.__rewire=function(){if(typeof prev==='function')prev();wire()};
})();
</script>`;
  const extra = pageBehaviorScript + subscribeScript + (entry.status === 'complete' ? chatScript : '') + (isProcessing ? activityFeedScript : '');
  // Canonical is emitted by layout() from layoutMeta.canonical — don't add a
  // second hand-built <link rel="canonical"> here.
  // Keep thin and failed pages out of the index (mirrors publicResearchFilter:
  // >= 3 products, or >= 2 for comparative "X vs Y" queries). Direct links
  // still work — only crawlers are turned away.
  const isComparative = rowFacets.is_comparative === true || /\bvs\.?\b|versus/i.test(entry.query);
  const minIndexableProducts = isComparative ? 2 : 3;
  const isThin = entry.status === 'complete' && products.length < minIndexableProducts;
  const noindex = (isThin || isFailed || isProcessing) ? '<meta name="robots" content="noindex, follow">' : '';
  // Amazon-viable pages carry Amazon buy-links on every card. dns-prefetch is
  // cheap (DNS-only, no TLS handshake) and shaves ~50-200ms off the first
  // affiliate click. Web-only/service pages have no Amazon links to warm.
  const amazonHint = products.length > 0 && !webOnly && !isService ? '<link rel="dns-prefetch" href="//www.amazon.com">' : '';
  const htmlOut = layout(displayTitle, entry.summary ?? 'AI-powered product research', body, amazonHint + noindex + structuredData + turnstileScript + extra, layoutMeta);
  return { html: htmlOut, lastModified: lastModifiedTs };
}
