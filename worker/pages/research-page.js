import { layout, html, jsonLdScript } from '../lib/html.js';
import { parseJsonSafe, isValidHttpsUrl, escapeHtml, timeAgo, displayQuery } from '../lib/utils.js';
import { buildAffiliateUrl, buildAmazonSearchFallback, retailerLabel, resolveAmazonTag } from '../lib/affiliate-links.js';
import { adSlot } from '../lib/ads.js';
import { getResearchBySlug, getProductsByResearchId } from '../lib/db.js';
import { searchBar } from '../lib/search-bar.js';
import { RESEARCH_ETA } from '../lib/tiers.js';
import { jsonEmbed, productLayoutBoot } from '../lib/list-layout-boot.js';

// Forensic-instrument button classes (mono, square, uppercase) — shared
// across this page's CTAs so re-run/notify/copy-link controls read as the
// same instrument as verify-page.js instead of the legacy rounded `.btn`.
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 bg-accent-strong px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover';
const BTN_GHOST = 'inline-flex items-center justify-center gap-2 border border-line px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-ink-2 transition-colors hover:border-ink-3 hover:text-ink';

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
  return `<dl class="item-metadata mt-2.5 grid grid-cols-[max-content_1fr] gap-x-2.5 gap-y-1.5 font-mono text-[11px] text-ink-2">
${entries.map(([k, v]) => {
    const icon = METADATA_ICONS[k] ?? '&#9679;';
    const label = escapeHtml(labelForMetadataKey(k));
    // Render mapsUrl / URL-ish values as links when they look like URLs
    const isUrl = /^https?:\/\//i.test(v) && isValidHttpsUrl(v);
    const value = isUrl
      ? `<a href="${escapeHtml(v)}" target="_blank" rel="noopener noreferrer nofollow" class="text-accent hover:text-accent-hover">${escapeHtml(new URL(v).hostname.replace(/^www\./, ''))}</a>`
      : escapeHtml(v);
    return `<dt class="whitespace-nowrap uppercase tracking-wide text-ink-3"><span aria-hidden="true" class="mr-1">${icon}</span>${label}</dt><dd class="m-0">${value}</dd>`;
  }).join('')}
</dl>`;
}

// Star row for a rating. Clamps to 0..5 so a bad rating (>5, negative, NaN,
// null) never makes String.repeat throw a RangeError (which 500s the page).
export function starMarkup(rating) {
  const full = Math.max(0, Math.min(5, Math.floor(Number(rating) || 0)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// Soft gradient fallback when imageUrl is missing or fails to load. Keyed by
// first letter so different items get distinct visual treatments without
// needing a real image pipeline.
export function renderItemImage(imageUrl, name, productId) {
  const safe = String(name ?? '').trim() || 'Product';
  const safeName = escapeHtml(safe.slice(0, 60));
  const letter = escapeHtml((safe.charAt(0) || '?').toUpperCase());
  const colorIndex = safe.charCodeAt(0) % 6;
  const gradients = [
    'linear-gradient(135deg,#1e3a8a,#2563eb)',
    'linear-gradient(135deg,#4c1d95,#7c3aed)',
    'linear-gradient(135deg,#14532d,#16a34a)',
    'linear-gradient(135deg,#7c2d12,#ea580c)',
    'linear-gradient(135deg,#831843,#db2777)',
    'linear-gradient(135deg,#0c4a6e,#0284c7)',
  ];
  const fallback = `<div class="item-image-fallback aspect-video w-full items-center justify-center border border-line mb-3" aria-hidden="true" style="display:flex;background:${gradients[colorIndex]}"><span class="font-mono text-4xl font-extrabold tracking-tight text-white/85">${letter}</span></div>`;
  if (!imageUrl || !isValidHttpsUrl(imageUrl)) return fallback;
  // Serve through the same-origin /api/img proxy when we know the product id:
  // the worker-side fetch carries no Referer (defeating hotlink blocks) and
  // edge-caches the bytes. Direct URL only as a legacy fallback.
  const src = productId ? `/api/img/${encodeURIComponent(productId)}` : imageUrl;
  // Broken images degrade gracefully: emit img + sibling fallback; a page-
  // level script swaps them on 'error'. Replaces the old inline onerror= that
  // was incompatible with nonce-based CSP.
  // NB: hide via inline display:none, NOT the [hidden] attribute — the fallback's own
  // inline `display:flex` OVERRIDES [hidden]'s UA display:none, so the letter-block was
  // rendering on top of a perfectly good picture. The onerror handler restores display:flex.
  const hiddenFallback = fallback.replace('display:flex', 'display:none');
  return `<img class="item-image-photo aspect-video w-full border border-line bg-surface-1 object-cover mb-3" src="${escapeHtml(src)}" alt="${safeName}" loading="lazy" referrerpolicy="no-referrer">
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
// a real Google search via /find (a 302 redirect; logged as a guide_click).
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

// At-a-glance comparison TABLE — a scannable, server-rendered side-by-side of
// every ranked pick with a Buy column, shown above the long detail cards. SSR
// (crawlable + no-JS safe + AI-answer-extractable) and a second cluster of
// above-the-fold affiliate CTAs. Reuses resolveProductCtas so each Buy link is
// byte-identical to the matching product card / Our-pick CTA.
function renderComparisonTable(products, ids, isService, slug, cleanLinks, webOnly) {
  if (!Array.isArray(products) || products.length < 2) return '';
  const anyPrice = products.some((p) => p.price != null);
  const muted = '<span class="text-ink-3">&mdash;</span>';
  const rows = products.map((p, i) => {
    const ctas = resolveProductCtas(p, ids, isService, slug, cleanLinks, webOnly);
    const a = ctas.amazon, r = ctas.retailer, g = ctas.google;
    const buyCls = 'inline-block whitespace-nowrap bg-accent-strong px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-accent-hover';
    let buy = muted;
    if (a.url && isValidHttpsUrl(a.url)) {
      buy = `<a href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="${buyCls}">${escapeHtml(a.label)}</a>`;
    } else if (r.url && isValidHttpsUrl(r.url)) {
      buy = `<a href="${escapeHtml(r.url)}" target="_blank" rel="${r.rel}" class="${buyCls}">${escapeHtml(r.label)}</a>`;
    } else if (g.url) {
      buy = `<a href="${escapeHtml(g.url)}" class="${buyCls}">${escapeHtml(g.label)}</a>`;
    }
    const rating = p.rating != null
      ? `<span class="whitespace-nowrap"><span aria-hidden="true">${starMarkup(p.rating)}</span> <span class="readout">${escapeHtml(String(p.rating))}/5</span></span>`
      : muted;
    const price = p.price != null ? `<span class="readout">$${p.price.toLocaleString()}</span>` : muted;
    const bestFor = p.best_for ? escapeHtml(String(p.best_for).slice(0, 90)) : muted;
    const rankCell = p.rank != null ? `#${escapeHtml(String(p.rank))}` : String(i + 1);
    return `<tr class="border-t border-line align-top hover:bg-surface-1">
<td class="px-4 py-3.5 font-mono font-bold text-ink readout">${rankCell}</td>
<th scope="row" class="px-4 py-3.5 text-left font-semibold text-ink"><a href="#product-${i + 1}" class="border-b border-dotted border-ink-3 hover:text-accent hover:border-accent">${escapeHtml(p.name)}</a>${p.brand ? `<span class="block font-mono text-[11px] font-normal text-ink-3">${escapeHtml(p.brand)}</span>` : ''}</th>
<td class="px-4 py-3.5">${rating}</td>
${anyPrice ? `<td class="whitespace-nowrap px-4 py-3.5">${price}</td>` : ''}
<td class="px-4 py-3.5">${bestFor}</td>
<td class="px-4 py-3.5">${buy}</td>
</tr>`;
  }).join('');
  return `<section class="compare-section mt-8">
<h2 id="compare" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">${isService ? 'At a glance' : `Compare all ${products.length}`}</h2>
<div class="mt-4 overflow-x-auto border border-line">
<table class="w-full min-w-[36rem] border-collapse font-mono text-xs">
<caption class="sr-only">Side-by-side comparison of all ${products.length} ranked picks with ratings${anyPrice ? ', price,' : ''} and where to buy.</caption>
<thead><tr class="border-b border-line bg-surface-2 text-left uppercase tracking-wide text-ink-3">
<th scope="col" class="px-4 py-3 font-medium">#</th>
<th scope="col" class="px-4 py-3 font-medium">Product</th>
<th scope="col" class="px-4 py-3 font-medium">Rating</th>
${anyPrice ? '<th scope="col" class="px-4 py-3 font-medium">Price</th>' : ''}
<th scope="col" class="px-4 py-3 font-medium">Best for</th>
<th scope="col" class="px-4 py-3 font-medium">Where to buy</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
</section>`;
}

// `p` arrives with pros/cons/specs/metadata already parsed (see
// renderResearchResult — the JSON columns are parsed exactly once after fetch).
const RANK_BADGE_CLASS = {
  1: 'border-trust-medium text-trust-medium',
  2: 'border-line-strong text-ink-2',
  3: 'border-trust-medium/60 text-trust-medium',
};

function renderProduct(p, index, ids, isService, slug, cleanLinks, webOnly) {
  const { pros, cons, specs, metadata } = p;
  const rankBadgeClass = RANK_BADGE_CLASS[p.rank] || 'border-line text-ink-3';

  // CTAs per product:
  //   1. amazonCta — BIG full-width button at the card bottom. Exact /dp/ URL
  //      → "Buy on Amazon"; no exact match → explicit "Search Amazon". Hidden
  //      for services/web-only categories and clean-link renders.
  //   2. googleCta — replaces the Amazon button for categories Amazon doesn't
  //      sell; internal /find hand-off (302-redirects to a Google search).
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

  const prosHtml = pros.map((pr) => html`<li class="relative pl-4 before:absolute before:left-0 before:font-bold before:text-trust-high before:content-['✓']">${pr}</li>`).join('');
  const consHtml = cons.map((c) => html`<li class="relative pl-4 before:absolute before:left-0 before:font-bold before:text-trust-low before:content-['✕']">${c}</li>`).join('');
  const specsHtml = Object.entries(specs).map(([k, v]) => html`<dt class="text-ink-3">${k}</dt><dd class="text-ink-2">${v}</dd>`).join('');

  // Secondary links row: manufacturer page + non-Amazon retailers (Walmart, etc.).
  const links = [];
  const linkClsBase = 'inline-flex items-center gap-1 border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide';
  const linkClsMfr = `${linkClsBase} border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink`;
  const linkClsBuy = `${linkClsBase} border-accent-strong bg-accent-strong text-white hover:bg-accent-hover hover:border-accent-hover`;
  if (mfrUrl && !(isService && retailerCtaUrl === mfrUrl)) {
    links.push(`<a href="${escapeHtml(mfrUrl)}" target="_blank" rel="noopener noreferrer" class="${linkClsMfr}">Product page <span aria-hidden="true">&#8599;</span></a>`);
  }
  if (retailerCtaUrl && isValidHttpsUrl(retailerCtaUrl)) {
    const cls = retailerCtaIsSponsored ? linkClsBuy : linkClsMfr;
    links.push(`<a href="${escapeHtml(retailerCtaUrl)}" target="_blank" rel="${retailerCtaRel}" class="${cls}">${escapeHtml(retailerCtaLabel)} <span aria-hidden="true">&#8599;</span></a>`);
  }

  // Primary CTA: full-width button at the very bottom of the card. Amazon when
  // the category is Amazon-viable (click-tracked href resolved in
  // resolveProductCtas, shared with Our pick); the /find Google hand-off when
  // it isn't. Never both.
  const ctaCls = 'product-cta-amazon mt-4 flex w-full items-center justify-center gap-2 bg-accent-strong px-4 py-3 font-mono text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover';
  let amazonCtaBlock = '';
  if (amazonCtaUrl && isValidHttpsUrl(amazonCtaUrl)) {
    amazonCtaBlock = `<a href="${escapeHtml(amazonCtaHref)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="${ctaCls}">${escapeHtml(amazonCtaLabel)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (ctas.google.url) {
    amazonCtaBlock = `<a href="${escapeHtml(ctas.google.url)}" class="${ctaCls}">${escapeHtml(ctas.google.label)} <span aria-hidden="true">&#8599;</span></a>`;
  }

  const imageBlock = renderItemImage(p.image_url, p.name, p.id);
  const metadataBlock = renderMetadataPairs(metadata);

  return `<article class="product border border-line bg-surface-1 p-5" id="product-${index + 1}">
${imageBlock}
<div class="flex items-start justify-between gap-4">
<div>
${p.rank != null ? `<span class="inline-block border ${rankBadgeClass} px-2 py-0.5 font-mono text-xs font-bold readout">#${p.rank}</span>` : ''}
<h3 class="wrap-anywhere mt-1.5 font-sans text-lg font-bold text-ink">${escapeHtml(p.name)}</h3>
${p.brand ? `<p class="font-mono text-xs text-ink-2">${escapeHtml(p.brand)}</p>` : ''}
</div>
<div class="shrink-0 text-right">
${p.price != null ? `<p class="readout font-mono text-2xl font-bold text-ink">$${p.price.toLocaleString()}</p>` : ''}
${p.rating != null ? `<p class="mt-1 font-mono text-xs text-trust-medium"><span aria-hidden="true">${starMarkup(p.rating)}</span> <span class="readout">${p.rating}/5</span></p>` : ''}
</div>
</div>
${p.best_for ? `<div class="mt-3 border-l-2 border-accent bg-accent-quiet px-3 py-2 font-mono text-[11px] text-ink-2"><span class="uppercase tracking-wide text-ink-3">Best for</span> ${escapeHtml(p.best_for)}</div>` : ''}
${ratingNote(p, cons)}
${metadataBlock}
${p.verdict ? `<p class="mt-3 text-body-sm leading-relaxed text-ink-2">${escapeHtml(p.verdict)}</p>` : ''}
${criticalReviewsBlock(p, cons)}
${(pros.length > 0 || (cons.length > 0 && !isBelow4(p))) ? `<div class="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
${pros.length > 0 ? `<div><h4 class="font-mono text-[11px] font-semibold uppercase tracking-wide text-trust-high">Pros</h4><ul class="mt-2 space-y-1.5 text-body-sm text-ink-2">${prosHtml}</ul></div>` : ''}
${(cons.length > 0 && !isBelow4(p)) ? `<div><h4 class="font-mono text-[11px] font-semibold uppercase tracking-wide text-trust-low">Cons</h4><ul class="mt-2 space-y-1.5 text-body-sm text-ink-2">${consHtml}</ul></div>` : ''}
</div>` : ''}
${specsHtml ? `<details class="mt-4 border-t border-line pt-3"><summary class="cursor-pointer font-mono text-xs font-medium uppercase tracking-wide text-ink-3">Specifications</summary>
<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 bg-surface-2 p-3 font-mono text-[11px]">${specsHtml}</dl></details>` : ''}
${links.length > 0 ? `<div class="mt-4 flex flex-wrap gap-2">${links.join('')}</div>` : ''}
${amazonCtaBlock}
</article>`;
}

// A one-line, plain-English explanation of WHY a product earned its rating — so a
// score (especially a low one) never appears without its reason. Built at render
// time from the rating band + the top con, so it works for BOTH the extraction
// engine and the live synth output. Honest about thin evidence (null rating).
function ratingNote(p, cons) {
  if (p.rating == null) {
    return `<p class="rating-why mt-2 font-mono text-[11px] text-ink-3">Not enough independent reviews to score this confidently — shown for context, not as a strong pick.</p>`;
  }
  const r = Number(p.rating);
  const con = (cons && cons[0]) ? String(cons[0]).replace(/^[\s"'“”]+|[\s"'“”.]+$/g, '') : '';
  let lead;
  if (r >= 4.5) lead = 'Strong, consistent praise across our credible sources';
  else if (r >= 4) lead = 'Well-reviewed overall, with only minor trade-offs';
  else if (r >= 3.5) lead = 'A solid, usable pick — but not the best in its class';
  else if (r >= 3) lead = 'Recommended only if it fits a specific need';
  else lead = 'Low marks from reviewers — included only because it suits a particular need';
  const why = con
    ? ` Main caveat reviewers raised: ${escapeHtml(con)}.`
    : (r >= 4.5 ? ' No recurring complaint surfaced in our sources.' : '');
  return `<p class="rating-why mt-2 font-mono text-[11px] leading-relaxed text-ink-3"><strong class="font-semibold text-ink">Why ${escapeHtml(String(r))}/5:</strong> ${escapeHtml(lead)}.${why}</p>`;
}

// A buyer often won't purchase a sub-4★ pick WITHOUT reading the actual criticism
// first (real user feedback). For products rated below 4 (or unrated) we surface the
// critical points PROMINENTLY and framed as "here's why some passed — judge for
// yourself"; when no credible criticism was found we say so honestly instead of
// hiding the gap. Render-time, so it works for both the extraction + synth output.
function isBelow4(p) { return p.rating != null && Number(p.rating) < 4; }
function criticalReviewsBlock(p, cons) {
  const r = p.rating == null ? null : Number(p.rating);
  if (r != null && r >= 4) return ''; // 4★+ : criticism stays in the normal Cons grid
  // cons[0] is already surfaced directly above by ratingNote() as the "main
  // caveat" — list the REMAINING criticism here so the top con doesn't print
  // twice within a few lines.
  const rest = (cons || []).slice(1);
  const items = rest.map((c) => `<li class="text-body-sm text-ink">${escapeHtml(String(c))}</li>`).join('');
  const intro = r == null
    ? 'We didn’t find enough independent reviews to score this confidently — read the criticism we did find before buying:'
    : 'This scores below 4★. Here’s the criticism reviewers actually raised — read it and decide whether any of it is a dealbreaker for you:';
  const introCls = 'mb-2 text-body-sm leading-relaxed text-ink-2';
  const body = items
    ? `<p class="${introCls}">${intro}</p><ul class="crit-list flex flex-col gap-1.5 pl-4 [&>li]:list-disc">${items}</ul>`
    : ((cons || []).length
        ? `<p class="${introCls}">The main caveat reviewers raised is noted above. We didn’t surface additional specific criticism — read recent buyer reviews before purchasing.</p>`
        : `<p class="${introCls}">This scores below 4★ and we couldn’t surface specific, credible criticism — treat the rating cautiously and read recent buyer reviews before purchasing.</p>`);
  return `<section class="critical-reviews mt-4 border border-trust-low bg-trust-low-bg p-4" aria-label="Critical reviews">
<h4 class="crit-head flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-trust-low"><span aria-hidden="true">&#9888;</span> Why some reviewers rated it low</h4>
<div class="mt-2">${body}</div></section>`;
}

// "Our pick" box: a high-visibility card for the rank-1 product, shown above the
// fold (right after the summary, before the top ad) so the answer beats the ad.
// Reuses resolveProductCtas so the CTA is byte-identical to the product card's.
function renderOurPick(p, ids, isService, slug, cleanLinks, webOnly) {
  if (!p) return '';
  const ctas = resolveProductCtas(p, ids, isService, slug, cleanLinks, webOnly);
  const ratingHtml = p.rating != null
    ? `<span class="ourpick-rating inline-flex items-center gap-1.5 font-mono text-sm text-trust-medium"><span aria-hidden="true">${starMarkup(p.rating)}</span> <span class="readout text-ink-2">${p.rating}/5</span></span>`
    : '';
  const priceHtml = p.price != null ? `<span class="ourpick-price readout font-mono text-lg font-bold text-ink">$${p.price.toLocaleString()}</span>` : '';
  const a = ctas.amazon;
  const r = ctas.retailer;
  // Prefer the Amazon button (matches the card's primary CTA); fall back to the
  // retailer/service pill so services and non-Amazon picks still get a CTA.
  const ctaCls = 'product-cta-amazon ourpick-cta mt-4 inline-flex max-w-sm items-center justify-center gap-2 bg-accent-strong px-4 py-3 font-mono text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover';
  let ctaHtml = '';
  if (a.url && isValidHttpsUrl(a.url)) {
    ctaHtml = `<a href="${escapeHtml(a.href)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="${ctaCls}">${escapeHtml(a.label)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (r.url && isValidHttpsUrl(r.url)) {
    ctaHtml = `<a href="${escapeHtml(r.url)}" target="_blank" rel="${r.rel}" class="${ctaCls}">${escapeHtml(r.label)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (ctas.google.url) {
    ctaHtml = `<a href="${escapeHtml(ctas.google.url)}" class="${ctaCls}">${escapeHtml(ctas.google.label)} <span aria-hidden="true">&#8599;</span></a>`;
  }
  return `<div class="ourpick-box mt-6 border-2 border-trust-medium bg-surface-1 p-6" id="our-pick">
<div class="ourpick-eyebrow font-mono text-[11px] font-semibold uppercase tracking-widest text-trust-medium">Our pick</div>
<h2 class="ourpick-name wrap-anywhere mt-2 font-serif text-h3 font-semibold text-ink">${escapeHtml(p.name)}</h2>
${(ratingHtml || priceHtml) ? `<div class="ourpick-meta mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">${ratingHtml}${priceHtml}</div>` : ''}
${ratingNote(p, Array.isArray(p.cons) ? p.cons : [])}
${p.verdict ? `<p class="ourpick-verdict mt-3 text-body leading-relaxed text-ink-2">${escapeHtml(p.verdict)}</p>` : ''}
${isBelow4(p) ? criticalReviewsBlock(p, Array.isArray(p.cons) ? p.cons : []) : ''}
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
    if (lower.some((t) => t.includes('affiliate-conflict') || t.includes('listicle') || t.includes('ai-injection'))) stats.downWeighted++;
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
  const chipCls = 'trust-chip inline-flex items-center gap-1 border border-line-strong px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-2';
  const chipWarnCls = 'trust-chip trust-chip-warn inline-flex items-center gap-1 border border-trust-medium bg-trust-medium-bg px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-trust-medium';
  const chips = [];
  chips.push(`<span class="${chipCls}"><strong class="readout text-ink">${s.total}</strong> source${s.total === 1 ? '' : 's'} analyzed</span>`);
  if (s.hasCredibility) {
    if (s.handsOn > 0) chips.push(`<span class="${chipCls}"><strong class="readout text-ink">${s.handsOn}</strong> hands-on</span>`);
    if (s.expert > 0) chips.push(`<span class="${chipCls}"><strong class="readout text-ink">${s.expert}</strong> expert</span>`);
    if (s.community > 0) chips.push(`<span class="${chipCls}"><strong class="readout text-ink">${s.community}</strong> community</span>`);
    if (s.downWeighted > 0) chips.push(`<span class="${chipWarnCls}"><strong class="readout">${s.downWeighted}</strong> down-weighted</span>`);
  }
  return `<aside class="trust-panel mt-6 border border-line bg-surface-1 p-5" aria-label="Why trust this">
<div class="trust-panel-head font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-3">Why trust this</div>
<div class="trust-chips mt-3 flex flex-wrap gap-2">${chips.join('')}</div>
${dateLabel ? `<p class="trust-panel-date mt-3 font-mono text-[11px] text-ink-3">Synthesized <time datetime="${dateIso}">${escapeHtml(dateLabel)}</time>${s.hasCredibility ? '' : ' &middot; legacy report (no per-source credibility data)'}</p>` : ''}
<p class="trust-panel-disclosure mt-2 font-mono text-[10.5px] leading-relaxed text-ink-3">We may earn a commission on purchases made through links on this page. Rankings are produced from independent source analysis and are never paid placements.</p>
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
  // Only surface a stored failure reason if it's a clean, short, user-facing
  // message (e.g. "No reliable products found for this query."). Raw provider /
  // HTTP / JSON errors (e.g. an OpenRouter 403) must never leak to users.
  const failReason = (() => {
    const e = String(resultData.error || '').trim();
    if (!e || e.length > 160) return '';
    if (/[{}]|https?:|\b[45]\d\d\b|openrouter|api key|token|timeout|stack|undefined|null|prompt injection/i.test(e)) return '';
    return e;
  })();
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
        amazonTag: resolveAmazonTag(env),
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

  const productListItems = products.map((p, i) => ({
    id: p.id,
    rank: p.rank ?? i + 1,
    name: p.name,
    price: p.price,
    rating: p.rating,
    best_for: p.best_for || '',
    href: `#product-${i + 1}`,
  }));

  const chatSection = `<section id="talk-about-it" class="report-chat-feature mt-6 border border-line border-l-2 border-l-accent bg-surface-1 p-5">
<div class="mb-3.5 flex flex-wrap items-start justify-between gap-3">
<div>
<span class="mb-1 inline-block font-mono text-[11px] font-bold uppercase tracking-widest text-accent">Interactive</span>
<h2 class="font-sans text-lg font-bold text-ink">Talk about this research</h2>
<p class="mt-1.5 max-w-xl text-body-sm text-ink-2">Ask follow-up questions about the ranking, or refine the search and rerun it with new constraints.</p>
</div>
</div>
<div class="mb-3.5 flex gap-2" role="tablist" aria-label="Chat mode">
<button type="button" id="chat-tab-ask" role="tab" aria-selected="true" aria-controls="chat-panel-ask" data-chat-tab="ask" class="border border-accent bg-accent-quiet px-3.5 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-accent">Ask about it</button>
<button type="button" id="chat-tab-refine" role="tab" aria-selected="false" aria-controls="chat-panel-refine" data-chat-tab="refine" class="border border-line px-3.5 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-ink-2 hover:border-ink-3">Refine this search</button>
</div>
<div class="chat-panel border border-line bg-bg p-4">
<div id="chat-messages" class="mb-3 flex max-h-64 flex-col gap-2.5 overflow-y-auto" aria-live="polite"></div>
<form id="chat-form" class="m-0 flex gap-2">
<label for="chat-input" class="sr-only">Your message</label>
<input id="chat-input" type="text" maxlength="2000" autocomplete="off" placeholder="e.g. Which one is best for a small apartment?" class="min-w-0 flex-1 border border-line bg-surface-1 px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-3">
<button type="submit" class="${BTN_PRIMARY} whitespace-nowrap text-sm">Send</button>
</form>
<p id="chat-status" role="status" aria-live="polite" class="mt-2 min-h-[1em] text-xs text-ink-3"></p>
</div>
</section>`;

  const body = `<div class="grid-bg border-b border-line">
<div class="mx-auto max-w-4xl px-6 py-12">
<nav aria-label="Breadcrumb" class="breadcrumb mb-4 font-mono text-[11px] uppercase tracking-widest text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<a href="/research" class="hover:text-ink">Research</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">${escapeHtml(displayTitle)}</span>
</nav>
<div class="page-header">
<p class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Ledger &middot; Ranked comparison report</p>
<h1 class="mt-3 font-serif text-h1 font-semibold text-ink">${escapeHtml(displayTitle)}</h1>
${entry.category ? `<span class="card-badge mt-3 inline-block">${escapeHtml(entry.category)}</span>` : ''}
<div class="page-meta mt-4 flex flex-wrap gap-4 font-mono text-[13px] text-ink-3 readout">
<span>Published <time datetime="${createdIso}">${date}</time></span>
${entry.completed_at && entry.completed_at !== entry.created_at ? `<span>Last updated <time datetime="${lastUpdatedIso}">${lastUpdatedLabel}</time></span>` : ''}
<span>${entry.view_count} views</span>
<span>${products.length === 0 ? 'No products found' : `${products.length} product${products.length === 1 ? '' : 's'} compared`}</span>
</div>
${entry.status === 'complete' ? `<div class="share-bar mt-4 flex flex-wrap items-center gap-2">
<span class="font-mono text-xs uppercase tracking-wide text-ink-3">Share:</span>
<a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener noreferrer" class="share-btn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Post</a>
<a href="https://reddit.com/submit?url=${shareUrl}&title=${shareText}" target="_blank" rel="noopener noreferrer" class="share-btn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.463.327.327 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z"/></svg>Reddit</a>
<button type="button" class="share-btn js-copy-link" data-url="${pageUrl}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>Copy link</button>
<button type="button" class="share-btn js-native-share hidden" data-url="${pageUrl}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>Share</button>
<form action="/research/new" method="POST" class="m-0 inline-block"><input type="hidden" name="q" value="${escapeHtml(entry.query)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="share-btn" title="Ignore the saved report and research this again from scratch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582M20 20v-5h-.581M5.635 9A8 8 0 0118.418 7M18.418 15A8 8 0 015.635 13"/></svg>Re-run fresh</button></form>
</div>` : ''}
</div>
</div>
</div>

<div class="container mx-auto max-w-4xl px-6 py-8">
${fromQuery && fromQuery !== entry.query ? `<div class="cluster-banner mt-0 mb-5 flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent-quiet p-4">
<div class="min-w-0 flex-1 text-body-sm text-ink-2">
<strong class="text-ink">Matched to existing research.</strong> You asked &ldquo;${escapeHtml(fromQuery)}&rdquo; — we already researched a very similar question (${date}).
</div>
<form action="/research/new" method="POST" class="m-0"><input type="hidden" name="q" value="${escapeHtml(fromQuery)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="${BTN_PRIMARY} whitespace-nowrap">Re-research with fresh data</button></form>
</div>` : ''}

${Object.keys(clarifications).length > 0 ? `<div class="clarifications-bar mt-5 border border-line bg-surface-1 p-4">
<div class="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-3">Researched for</div>
<div class="flex flex-wrap gap-2">
${Object.entries(clarifications).map(([k, v]) => `<span class="card-badge"><strong class="text-ink">${escapeHtml(k.replace(/_/g, ' '))}:</strong> ${escapeHtml(v)}</span>`).join('')}
</div>
</div>` : ''}

${isProcessing ? `<div id="processing" class="my-8 border border-accent/30 bg-surface-1 p-6">
<div class="mb-4 flex items-center gap-3">
<div class="spinner" style="width:1.5rem;height:1.5rem;border-width:2px;margin:0;flex-shrink:0"></div>
<div>
<h2 class="font-sans text-lg font-semibold text-ink">Researching</h2>
<p class="font-mono text-xs text-ink-3" id="source-count">Starting...</p>
</div>
</div>
<ol id="progress-steps" class="progress-steps" aria-hidden="true">
<li class="progress-step is-active" data-step="0"><span class="progress-dot"></span><span>Searching</span></li>
<li class="progress-step" data-step="1"><span class="progress-dot"></span><span>Reading</span></li>
<li class="progress-step" data-step="2"><span class="progress-dot"></span><span>Ranking</span></li>
<li class="progress-step" data-step="3"><span class="progress-dot"></span><span>Writing</span></li>
</ol>
<div id="preview-box" class="mb-4 hidden border border-accent/25 bg-accent-quiet p-4">
<div class="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-3">Quick answer &middot; from prior knowledge</div>
<div id="preview-text" class="whitespace-pre-wrap text-body-sm leading-relaxed text-ink-2"></div>
</div>
<div id="activity-feed" class="activity-feed"></div>
<div class="notify-box mt-5 border border-accent/25 bg-accent-quiet p-4">
<label for="notify-email" class="mb-2 block text-body-sm text-ink-2">This usually takes ${RESEARCH_ETA}. Want an email when it&rsquo;s ready?</label>
<form id="notify-form" class="m-0 flex flex-wrap gap-2">
<input id="notify-email" type="email" name="email" required placeholder="you@example.com" autocomplete="email" maxlength="254" class="min-w-[12rem] flex-1 border border-line bg-bg px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3">
<button type="submit" class="${BTN_PRIMARY} whitespace-nowrap">Notify me</button>
</form>
<p id="notify-msg" role="status" aria-live="polite" class="mt-2 min-h-[1em] font-mono text-xs text-ink-3"></p>
</div>
</div>` : ''}

${isFailed ? `<div class="my-8 border border-trust-low/40 bg-trust-low-bg p-6">
<h2 class="font-sans text-lg font-semibold text-trust-low">Research failed</h2>
<p class="mt-2 text-body-sm text-ink-2">${failReason ? escapeHtml(failReason) : 'Something went wrong during analysis. This could be due to insufficient source data.'}</p>
<form method="POST" action="/research/new" class="mt-4"><input type="hidden" name="q" value="${escapeHtml(entry.query)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="${BTN_PRIMARY}">Try again</button></form>
</div>` : ''}

${entry.status === 'complete' ? (() => {
  const tocItems = [];
  if (entry.summary) tocItems.push({ id: 'summary', label: 'Summary' });
  if (products.length > 1) tocItems.push({ id: 'compare', label: 'Compare' });
  tocItems.push({ id: 'talk-about-it', label: 'Ask or refine' });
  if (hasBuyersGuide) tocItems.push({ id: 'buyers-guide', label: "Buyer's guide" });
  if (products.length > 0) tocItems.push({ id: 'products', label: isService ? 'Recommendations' : 'Products compared' });
  if (resultData.methodology) tocItems.push({ id: 'methodology', label: 'Methodology' });
  if (sourceList.length > 0) tocItems.push({ id: 'sources', label: `Sources (${sourceList.length})` });
  if (related.length > 0) tocItems.push({ id: 'related', label: 'Related research' });
  if (tocItems.length < 3) return '';
  return `<nav class="toc my-6 border border-line bg-surface-1 p-4" aria-label="Table of contents">
<div class="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-3">On this page</div>
<ul class="m-0 flex flex-wrap gap-x-3.5 gap-y-2 p-0 font-mono text-xs">${tocItems.map((t) => `<li class="list-none"><a href="#${t.id}" class="border-b border-dotted border-ink-3 text-ink-2 no-underline hover:border-accent hover:text-accent">${escapeHtml(t.label)}</a></li>`).join('')}</ul>
</nav>`;
})() : ''}

${entry.summary ? `<div class="summary-box border border-line bg-surface-1 p-5"><h2 id="summary" class="font-serif text-h3 font-semibold text-ink">Summary</h2><p class="mt-2 text-body leading-relaxed text-ink-2">${escapeHtml(entry.summary)}</p></div>` : ''}

${entry.status === 'complete' && products.length === 0 ? `<div class="my-8 border border-line bg-surface-1 p-6">
<h2 class="font-sans text-xl font-bold text-ink">No clear picks this time</h2>
<p class="mt-2 text-body-sm text-ink-2">We couldn't find enough trustworthy sources to confidently rank products for this query.</p>
<form method="POST" action="/research/new" class="mt-4"><input type="hidden" name="q" value="${escapeHtml(entry.query)}"><input type="hidden" name="fresh" value="1"><button type="submit" class="${BTN_PRIMARY}">Try again</button></form>
</div>` : ''}

${entry.status === 'complete' && products.length > 0 ? renderOurPick(products.find((p) => p.rank === 1) || products[0], affiliateIds, isService, slug, cleanLinks, webOnly) : ''}

${entry.status === 'complete' ? renderComparisonTable(products, affiliateIds, isService, slug, cleanLinks, webOnly) : ''}

${entry.status === 'complete' ? chatSection : ''}

${entry.status === 'complete' ? renderTrustPanel(entry.sources, entry.completed_at) : ''}

${entry.status === 'complete' ? adSlot(env, 'top', 'Advertisement') : ''}

${hasBuyersGuide && buyersGuide ? `<section class="buyers-guide mb-8 border border-line bg-surface-1 p-6">
<h2 id="buyers-guide" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Buyer's guide</h2>
${buyersGuide.howToChoose ? `<h3 class="mt-4 font-mono text-xs font-semibold uppercase tracking-wide text-ink">How to choose</h3>
<p class="mt-2 text-body-sm leading-relaxed text-ink-2">${escapeHtml(buyersGuide.howToChoose)}</p>` : ''}
${(buyersGuide.pitfalls?.length ?? 0) > 0 ? `<h3 class="mt-5 font-mono text-xs font-semibold uppercase tracking-wide text-trust-medium">Common pitfalls</h3>
<ul class="mt-2 list-disc space-y-1.5 pl-5 text-body-sm leading-relaxed text-ink-2">${buyersGuide.pitfalls.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
${(buyersGuide.marketingToIgnore?.length ?? 0) > 0 ? `<h3 class="mt-5 font-mono text-xs font-semibold uppercase tracking-wide text-trust-low">Marketing to ignore</h3>
<ul class="mt-2 list-disc space-y-1.5 pl-5 text-body-sm leading-relaxed text-ink-2">${buyersGuide.marketingToIgnore.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
</section>` : ''}

${products.length > 0 ? `<h2 id="products" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">${isService ? 'Recommendations' : 'Products compared'}</h2>
${(!isService && products.some((p) => p.price != null)) ? `<p class="mb-5 mt-2 font-mono text-[11px] text-ink-3">Prices were last checked ${new Date(lastModifiedTs * 1000).toISOString().split('T')[0]} and can change — confirm the current price at the retailer before buying.</p>` : ''}
${jsonEmbed('product-list-data', productListItems)}
<div id="product-list" class="mt-4"></div>
<div id="product-grid-detail" class="product-grid mt-4" style="display:none">${products.map((p, i) => {
  const card = renderProduct(p, i, affiliateIds, isService, slug, cleanLinks, webOnly);
  const midAd = (i === 2 && products.length >= 5) ? adSlot(env, 'mid', 'Advertisement') : '';
  return card + midAd;
}).join('')}</div>
${adSlot(env, 'bottom', 'Advertisement')}` : ''}

${(resultData.methodology || sourceList.length > 0) ? `<div class="sources mt-8 border-t border-line pt-6">
${resultData.methodology ? `<h2 id="methodology" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Methodology</h2><p class="mt-2 mb-4 text-body-sm leading-relaxed text-ink-2">${escapeHtml(resultData.methodology)}</p>` : ''}
${sourceList.length > 0 ? `<h2 id="sources" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Sources (${sourceList.length})</h2><div class="mt-3 space-y-1.5">${sourceList.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="${sourceRel(u)}" class="block truncate font-mono text-xs text-accent hover:text-accent-hover">${escapeHtml(sourceLabel(u))}</a>`).join('')}</div>` : ''}
</div>` : ''}

${related.length > 0 ? `<section class="related-research mt-10 border-t border-line pt-6">
<h2 id="related" class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Related research</h2>
<div class="grid mt-4">${related.map((r) => `<a class="card" href="/research/${escapeHtml(r.slug)}">
${r.category ? `<div class="card-top"><span class="card-badge">${escapeHtml(r.category)}</span><span class="card-time">${timeAgo(r.created_at * 1000)}</span></div>` : `<div class="card-top"><span class="card-time">${timeAgo(r.created_at * 1000)}</span></div>`}
<h3>${escapeHtml(displayQuery(r.query))}</h3>
</a>`).join('')}</div>
</section>` : ''}

<div class="mt-10 border-t border-line pt-6">
<h2 class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Research something else</h2>
<div class="mt-4">${searchBar('compact')}</div>
</div>
${entry.status === 'complete' ? `<div class="notify-footer mt-8 border-t border-line pt-6">
<form id="notify-form" class="m-0 flex flex-wrap items-center gap-2">
<label for="notify-email" class="min-w-[14rem] flex-1 text-body-sm text-ink-2">Get notified when we re-research this category</label>
<input id="notify-email" type="email" name="email" required placeholder="you@example.com" autocomplete="email" maxlength="254" class="min-w-[12rem] flex-1 border border-line bg-bg px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3">
<button type="submit" class="${BTN_PRIMARY} whitespace-nowrap">Notify me</button>
</form>
<p id="notify-msg" role="status" aria-live="polite" class="mt-2 min-h-[1em] font-mono text-xs text-ink-3"></p>
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
  // Social platforms (FB/X/LinkedIn/Slack/Discord/iMessage/WhatsApp) and Google
  // rich-result image guidelines do NOT support SVG — an SVG og:image renders a
  // blank share card. Use the static PNG until a vendored raster generator
  // (resvg/satori wasm) can produce per-page PNGs at /research/:slug/og.png.
  const articleImage = 'https://chrisputer.tech/og.png';
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

  // FAQPage — assembled from data already rendered on the page (buyer's guide +
  // top pick). Plain-text answers only. Note: Google deprecated FAQ rich-result
  // *display* for non-gov/health sites (2023), but the markup is still valid
  // structured data used for entity understanding and AI-answer grounding.
  const faqSubject = displayTitle.replace(/^best\s+/i, '').trim() || displayTitle;
  const faqEntities = [];
  if (hasBuyersGuide && buyersGuide) {
    if (buyersGuide.howToChoose) {
      faqEntities.push({ q: `What should I consider when choosing ${faqSubject}?`, a: buyersGuide.howToChoose });
    }
    if ((buyersGuide.pitfalls?.length ?? 0) > 0) {
      faqEntities.push({ q: `What common mistakes should I avoid with ${faqSubject}?`, a: buyersGuide.pitfalls.join(' ') });
    }
    if ((buyersGuide.marketingToIgnore?.length ?? 0) > 0) {
      faqEntities.push({ q: `What marketing claims about ${faqSubject} should I ignore?`, a: buyersGuide.marketingToIgnore.join(' ') });
    }
  }
  if (products.length > 0 && products[0].name) {
    const top = products[0];
    const topAnswer = top.verdict ? `${top.name} — ${top.verdict}` : top.name;
    faqEntities.push({ q: `What's the top ${isService ? 'recommendation' : 'pick'} for ${faqSubject}?`, a: topAnswer });
  }
  const faqLd = faqEntities.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faqEntities.map((e) => ({
      '@type': 'Question',
      name: e.q,
      acceptedAnswer: { '@type': 'Answer', text: e.a },
    })),
  } : null;

  const structuredData = entry.status === 'complete'
    ? jsonLdScript(jsonLd) +
      (itemListLd ? jsonLdScript(itemListLd) : '') +
      (faqLd ? jsonLdScript(faqLd) : '') +
      jsonLdScript(breadcrumbLd)
    : '';

  const layoutMeta = {
    ogUrl: pageUrl,
    ogType: 'article',
    // PNG, not the per-page og.svg — SVG share cards render blank everywhere.
    ogImage: 'https://chrisputer.tech/og.png',
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
        if(fb&&fb.classList.contains('item-image-fallback'))fb.style.display='flex';
      });
    });
  }
  function wireNativeShare(){
    if(!navigator.share)return;
    document.querySelectorAll('.js-native-share').forEach(function(btn){
      if(btn.__wired)return;btn.__wired=true;
      btn.style.display='';
      btn.addEventListener('click',function(){
        navigator.share({title:document.title,url:btn.dataset.url||location.href}).catch(function(){});
      });
    });
  }
  function run(){wireCopy();wireNativeShare();wireImages()}
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
  var slug=${JSON.stringify(slug).replace(/</g,'\\u003c')};
  var lastSeq=0;
  var sources=0;
  var pollCount=0;
  var failCount=0;
  var icons={search:'\u{1F50D}',fetch:'\u{1F4D6}',note:'\u{1F4DD}',synthesize:'\u{2728}',status:'\u{2139}\uFE0F',error:'\u{26A0}\uFE0F'};
  var STEP_OF={search:0,fetch:1,note:2,synthesize:3};var maxStep=0;
  function updateSteps(cur){var steps=document.querySelectorAll('#progress-steps .progress-step');for(var i=0;i<steps.length;i++){var s=parseInt(steps[i].dataset.step,10);steps[i].classList.toggle('is-done',s<cur);steps[i].classList.toggle('is-active',s===cur);}}
  function poll(){
    pollCount++;
    fetch('/api/research/'+slug+'/events?since='+lastSeq)
      .then(function(r){var ct=r.headers.get('content-type')||'';if(ct.indexOf('application/json')===-1){throw new Error('non-json')}return r.json()})
      .then(function(d){
        failCount=0;
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
            if(e.event_type in STEP_OF){var st=STEP_OF[e.event_type];if(st>maxStep){maxStep=st;updateSteps(maxStep);}}
          });
          if(counter)counter.textContent=sources+' searches completed';
        }
        if(d.status==='complete'){
          maxStep=3;updateSteps(3);
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
      .catch(function(){
        failCount++;
        if(failCount>10){
          if(counter)counter.textContent='Connection lost — refresh to continue.';
          var div=document.createElement('div');
          div.className='activity-item activity-error';
          div.textContent='\u{26A0}️ Connection lost — refresh to continue.';
          feed.appendChild(div);
          return;
        }
        setTimeout(poll,3000);
      });
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
    var researchId=${JSON.stringify(entry.id).replace(/</g,'\\u003c')};
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var email=(input&&input.value||'').trim();
      if(!email)return;
      if(msg)msg.textContent='Saving...';
      fetch('/api/subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email,researchId:researchId})
      }).then(function(r){var ct=r.headers.get('content-type')||'';if(ct.indexOf('application/json')===-1){throw new Error('non-json')}return r.json()}).then(function(d){
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
  // Report chat: "Ask about it" Q&A + "Refine this search" re-run via /api/chat.
  const chatScript = `<script nonce="__CSP_NONCE__">
(function(){
  function wire(){
    var form=document.getElementById('chat-form');
    if(!form||form.__wired)return;form.__wired=true;
    var input=document.getElementById('chat-input');
    var box=document.getElementById('chat-messages');
    var status=document.getElementById('chat-status');
    var slug=${JSON.stringify(slug).replace(/</g,'\\u003c')};
    var mode='ask';
    var askTranscript=[];
    var refineTranscript=[];
    var seeded={ask:false,refine:false};

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

    function seedIntro(){
      if(mode==='ask'&&!seeded.ask){
        bubble('assistant','Ask anything about this comparison \\u2014 why one ranked above another, which fits your situation, what to watch out for.');
        seeded.ask=true;
      }
      if(mode==='refine'&&!seeded.refine){
        bubble('assistant','Tell me what to change \\u2014 budget, use case, things to exclude \\u2014 and I\\u2019ll help you rerun the research with sharper constraints.');
        seeded.refine=true;
      }
    }

    function runRefinedResearch(query,refinements){
      if(status)status.textContent='Starting refined research\\u2026';
      fetch('/api/research',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:query,clarifications:refinements||{},fresh:true})
      }).then(function(r){return r.json()}).then(function(d){
        if(d.error){if(status)status.textContent=d.error;return;}
        if(d.slug){window.location.href='/research/'+d.slug;return;}
        if(d.id){window.location.href='/research/'+d.id;return;}
        if(status)status.textContent='Something went wrong. Try again.';
      }).catch(function(){if(status)status.textContent='Network error. Try again.'});
    }

    function actionBtn(label,query,refinements){
      var btn=document.createElement('button');
      btn.type='button';btn.className='btn';
      btn.style.cssText='align-self:flex-start;font-size:.82rem;padding:.5rem .85rem';
      btn.textContent=label;
      btn.addEventListener('click',function(){runRefinedResearch(query,refinements)});
      box.appendChild(btn);box.scrollTop=box.scrollHeight;
    }

    var chatTabs=document.querySelectorAll('[data-chat-tab]');
    function activateChatTab(name){
      mode=name;
      chatTabs.forEach(function(t){
        var active=t.dataset.chatTab===mode;
        t.setAttribute('aria-selected',active?'true':'false');
        t.setAttribute('tabindex',active?'0':'-1');
        t.style.background=active?'var(--accent-quiet)':'';
        t.style.borderColor=active?'var(--accent)':'';
        t.style.color=active?'var(--accent)':'';
      });
      box.innerHTML='';
      if(status)status.textContent='';
      input.placeholder=mode==='refine'
        ?'e.g. Narrow it to under $100, or focus on quiet models'
        :'e.g. Which one is best for a small apartment?';
      seedIntro();
    }
    chatTabs.forEach(function(tab,i){
      tab.setAttribute('tabindex',tab.getAttribute('aria-selected')==='true'?'0':'-1');
      tab.addEventListener('click',function(){activateChatTab(tab.dataset.chatTab)});
      tab.addEventListener('keydown',function(ev){
        var next=i;
        if(ev.key==='ArrowRight')next=(i+1)%chatTabs.length;
        else if(ev.key==='ArrowLeft')next=(i-1+chatTabs.length)%chatTabs.length;
        else if(ev.key==='Home')next=0;
        else if(ev.key==='End')next=chatTabs.length-1;
        else return;
        ev.preventDefault();
        activateChatTab(chatTabs[next].dataset.chatTab);
        chatTabs[next].focus();
      });
    });

    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var text=(input.value||'').trim();
      if(!text||form.__busy)return;
      form.__busy=true;input.value='';
      var transcript=mode==='refine'?refineTranscript:askTranscript;
      if(transcript.length>=14)transcript.splice(0,transcript.length-13);
      transcript.push({role:'user',content:text});
      bubble('user',text);
      var thinking=bubble('assistant','\\u2026');
      if(status)status.textContent='';
      var body={slug:slug,messages:transcript};
      if(mode==='refine')body.mode='refine';
      fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){var ct=r.headers.get('content-type')||'';if(ct.indexOf('application/json')===-1){throw new Error('non-json')}return r.json().then(function(d){return{ok:r.ok,d:d}})})
        .then(function(res){
          form.__busy=false;
          if(res.ok&&res.d&&res.d.reply){
            thinking.textContent=res.d.reply;
            transcript.push({role:'assistant',content:res.d.reply});
            if(mode==='refine'&&res.d.suggestedQuery){
              actionBtn('Run refined research: '+res.d.suggestedQuery,res.d.suggestedQuery,res.d.refinements);
            }else if(res.d.suggestedQuery){
              var f=document.createElement('form');
              f.method='POST';f.action='/research/new';
              f.style.cssText='align-self:flex-start;margin:0';
              var h=document.createElement('input');h.type='hidden';h.name='q';h.value=res.d.suggestedQuery;f.appendChild(h);
              var b=document.createElement('button');b.type='submit';b.className='btn';
              b.style.cssText='font-size:.82rem;padding:.5rem .85rem';
              b.textContent='Research: '+res.d.suggestedQuery;
              f.appendChild(b);box.appendChild(f);box.scrollTop=box.scrollHeight;
            }
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
    seedIntro();
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',wire)}else{wire()}
  var prev=window.__rewire;
  window.__rewire=function(){if(typeof prev==='function')prev();wire()};
})();
</script>`;
  const extra = pageBehaviorScript + subscribeScript + (entry.status === 'complete' ? chatScript : '') + (isProcessing ? activityFeedScript : '') + (products.length > 0 ? productLayoutBoot() : '');
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
  // Append the freshness year to the <title>/OG title only (not the on-page H1 or
  // schema headline) — a measurable CTR lift on commercial "best X" queries. Use
  // the page's last-completion year (honest: reflects actual freshness) and only
  // when the title doesn't already carry a 4-digit year.
  const titleYear = new Date(lastModifiedTs * 1000).getUTCFullYear();
  const seoTitle = (entry.status === 'complete' && !/\b20\d{2}\b/.test(displayTitle))
    ? `${displayTitle} (${titleYear})`
    : displayTitle;
  const htmlOut = layout(seoTitle, entry.summary ?? 'AI-powered product research', body, amazonHint + noindex + structuredData + turnstileScript + extra, layoutMeta);
  return { html: htmlOut, lastModified: lastModifiedTs };
}
