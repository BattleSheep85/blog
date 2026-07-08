/**
 * /reviews — sitewide product-review directory.
 *
 * Every reviewed product across all completed research, as full review cards:
 * photo, star rating, price, the review verdict, pros/cons, a link to the
 * parent research report (the full review with sources), and a click-tracked
 * buy CTA. Filterable by category, paginated. ItemList JSON-LD for rich
 * results. Products with photos sort first so the page leads with its
 * strongest visual content.
 */

import { layout, jsonLdScript } from '../lib/html.js';
import { escapeHtml, parseJsonSafe, isValidHttpsUrl, displayQuery } from '../lib/utils.js';
import { renderItemImage, resolveProductCtas, isNonProductCategory } from './research-page.js';
import { adSlot } from '../lib/ads.js';
import { jsonEmbed, listLayoutBoot } from '../lib/list-layout-boot.js';
import {
  PAGE_SIZE, PRICE_BANDS, RATING_OPTIONS, SORT_OPTIONS,
  parseProductFilters, isNarrowed, buildProductWhere, orderByClause, reviewsHref,
} from '../lib/product-search.js';

const DEFAULT_AFFILIATE_TAG = 'battlesheep0a-20';

// SQL CASE that buckets p.price into PRICE_BANDS keys — generated from the
// constant so the JS bands and the SQL facet counts can never drift. Bounds are
// our own numeric constants (never user input), so inlining them is safe.
const PRICE_BAND_CASE = `CASE ${PRICE_BANDS.map((b) =>
  b.max == null ? `WHEN p.price >= ${b.min} THEN '${b.key}'`
    : `WHEN p.price >= ${b.min} AND p.price < ${b.max} THEN '${b.key}'`).join(' ')} END`;

function starsHtml(rating) {
  if (rating == null) return '';
  const full = Math.max(0, Math.min(5, Math.floor(rating)));
  return `<span class="review-stars" aria-label="Rated ${rating} out of 5"><span aria-hidden="true" style="color:var(--accent)">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span> <span style="font-size:.82rem;color:var(--ink-2)">${rating}/5</span></span>`;
}

function renderReviewCard(row, affiliateIds) {
  const pros = parseJsonSafe(row.pros, []).slice(0, 3);
  const cons = parseJsonSafe(row.cons, []).slice(0, 2);
  const facets = parseJsonSafe(row.facets, {}) || {};
  const isService = isNonProductCategory(row.category) || facets.is_service === true;
  const webOnly = facets.sold_on_amazon === false;

  // Reuse the research page's CTA resolver so labels/tracking stay identical.
  const p = {
    id: row.id, name: row.name, brand: row.brand,
    affiliate_url: row.affiliate_url, product_url: row.product_url,
    manufacturer_url: row.manufacturer_url,
  };
  const ctas = resolveProductCtas(p, affiliateIds, isService, row.slug, false, webOnly);
  let ctaHtml = '';
  if (ctas.amazon.url && isValidHttpsUrl(ctas.amazon.url)) {
    ctaHtml = `<a href="${escapeHtml(ctas.amazon.href)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="product-cta-amazon" style="margin-top:auto">${escapeHtml(ctas.amazon.label)} <span aria-hidden="true">&#8599;</span></a>`;
  } else if (ctas.google.url) {
    ctaHtml = `<a href="${escapeHtml(ctas.google.url)}" class="product-cta-amazon" style="margin-top:auto">${escapeHtml(ctas.google.label)} <span aria-hidden="true">&#8599;</span></a>`;
  }

  const reviewDate = row.completed_at
    ? new Date(row.completed_at * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return `<article class="review-card" style="display:flex;flex-direction:column;background:var(--surface-1);border:1px solid var(--line);border-radius:0.875rem;padding:1.1rem">
${renderItemImage(row.image_url, row.name, row.id)}
<div style="display:flex;justify-content:space-between;gap:.6rem;align-items:flex-start">
<div style="min-width:0">
<h3 style="font-size:1.02rem;font-weight:700;color:var(--ink);line-height:1.35">${escapeHtml(row.name)}</h3>
${row.brand ? `<p style="color:var(--ink-3);font-size:.8rem">${escapeHtml(row.brand)}</p>` : ''}
</div>
${row.price != null ? `<p class="product-price" style="flex-shrink:0">$${row.price.toLocaleString()}</p>` : ''}
</div>
<div style="margin:.45rem 0 .2rem">${starsHtml(row.rating)}</div>
${row.verdict ? `<p style="font-size:.88rem;line-height:1.55;color:var(--ink-2);margin:.4rem 0">${escapeHtml(row.verdict)}</p>` : ''}
${(pros.length > 0 || cons.length > 0) ? `<div style="font-size:.82rem;line-height:1.5;margin:.4rem 0 .6rem">
${pros.map((pr) => `<div style="display:flex;gap:.4rem;color:var(--ink-2)"><span style="color:var(--trust-high)">+</span><span>${escapeHtml(pr)}</span></div>`).join('')}
${cons.map((c) => `<div style="display:flex;gap:.4rem;color:var(--ink-2)"><span style="color:var(--trust-low)">&minus;</span><span>${escapeHtml(c)}</span></div>`).join('')}
</div>` : ''}
<p style="font-size:.78rem;color:var(--ink-3);margin-bottom:.7rem">From <a href="/research/${escapeHtml(row.slug)}" style="color:var(--accent)">${escapeHtml(displayQuery(row.query))}</a>${reviewDate ? ` &middot; ${reviewDate}` : ''}</p>
${ctaHtml}
</article>`;
}

// One facet group in the left rail: a heading + value rows with counts. The
// active value toggles off (links back to the cleared filter); inactive values
// link to the narrowed filter. `keyOf` extracts the comparison key per row.
// NB: the option is `keyOf`, NOT `valueOf` — `valueOf` is an Object.prototype
// method, so a destructuring default `{ valueOf = … } = {}` reads the inherited
// native method instead of applying the default, then throws when called.
function facetGroup(title, filters, dim, rows, opts = {}) {
  const { activeKey = filters[dim] || '', keyOf = (r) => r.key, labelOf = (r) => r.label, countOf = (r) => r.n } = opts;
  const items = rows.filter((r) => countOf(r) > 0 || keyOf(r) === activeKey);
  if (items.length === 0 && !activeKey) return '';
  const row = (label, count, href, active) =>
    `<li><a href="${escapeHtml(href)}" rel="nofollow" style="display:flex;justify-content:space-between;gap:.5rem;padding:.28rem .1rem;font-size:.85rem;text-decoration:none;color:${active ? 'var(--ink)' : 'var(--ink-2)'};font-weight:${active ? '600' : '400'}">
<span style="display:flex;gap:.4rem;align-items:center;min-width:0"><span aria-hidden="true" style="flex-shrink:0">${active ? '☑' : '☐'}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</span></span>
${count != null ? `<span style="color:var(--ink-3);flex-shrink:0">${count.toLocaleString()}</span>` : ''}</a></li>`;
  return `<div style="margin-bottom:1.4rem">
<h3 style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:.5rem">${escapeHtml(title)}</h3>
<ul style="list-style:none;margin:0;padding:0">
${items.map((r) => {
    const key = keyOf(r);
    const active = key === activeKey;
    return row(labelOf(r), countOf(r), reviewsHref(filters, { [dim]: active ? '' : key }), active);
  }).join('')}
</ul></div>`;
}

export async function renderReviewsPage(url, env) {
  const filters = parseProductFilters((n) => url.searchParams.get(n));
  const offset = (filters.page - 1) * PAGE_SIZE;

  const join = 'FROM products p JOIN research r ON r.id = p.research_id';
  const main = buildProductWhere(filters);                 // full filter (list + count)
  const wCat = buildProductWhere(filters, 'category');     // facet contexts exclude their own dim
  const wBrand = buildProductWhere(filters, 'brand');
  const wPrice = buildProductWhere(filters, 'price');
  const wRating = buildProductWhere(filters, 'rating');

  const [listRes, countRes, catRes, brandRes, priceRes, ratingRes] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.name, p.brand, p.price, p.rating, p.image_url, p.product_url,
              p.affiliate_url, p.manufacturer_url, p.pros, p.cons, p.verdict, p.rank,
              r.slug, r.query, r.category, r.facets, r.completed_at, r.view_count
       ${join} WHERE ${main.clause}
       ORDER BY ${orderByClause(filters.sort)}
       LIMIT ? OFFSET ?`
    ).bind(...main.binds, PAGE_SIZE, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n ${join} WHERE ${main.clause}`).bind(...main.binds).first(),
    env.DB.prepare(
      `SELECT r.category AS key, COUNT(*) AS n ${join} WHERE ${wCat.clause} AND r.category IS NOT NULL AND r.category != ''
       GROUP BY r.category ORDER BY n DESC LIMIT 15`
    ).bind(...wCat.binds).all(),
    env.DB.prepare(
      `SELECT p.brand AS key, COUNT(*) AS n ${join} WHERE ${wBrand.clause} AND p.brand IS NOT NULL AND p.brand != ''
       GROUP BY p.brand ORDER BY n DESC LIMIT 15`
    ).bind(...wBrand.binds).all(),
    env.DB.prepare(
      `SELECT ${PRICE_BAND_CASE} AS key, COUNT(*) AS n ${join} WHERE ${wPrice.clause} AND p.price IS NOT NULL
       GROUP BY key`
    ).bind(...wPrice.binds).all(),
    env.DB.prepare(
      `SELECT SUM(CASE WHEN p.rating >= 4.5 THEN 1 ELSE 0 END) AS r45,
              SUM(CASE WHEN p.rating >= 4 THEN 1 ELSE 0 END) AS r4,
              SUM(CASE WHEN p.rating >= 3.5 THEN 1 ELSE 0 END) AS r35
       ${join} WHERE ${wRating.clause}`
    ).bind(...wRating.binds).first(),
  ]);

  const rows = listRes.results ?? [];
  const total = countRes?.n ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (rows.length === 0 && filters.page > 1) return null; // out-of-range page → 404

  const affiliateIds = {
    amazonTag: env.AMAZON_AFFILIATE_TAG || env.AMAZON_ASSOCIATE_TAG || DEFAULT_AFFILIATE_TAG,
    walmartImpact: env.WALMART_IMPACT_ID || undefined,
    targetImpact: env.IMPACT_TARGET_ID || undefined,
    bestbuyImpact: env.IMPACT_BESTBUY_ID || undefined,
    neweggImpact: env.IMPACT_NEWEGG_ID || undefined,
    bhphoto: env.BHPHOTO_AFFILIATE_ID || undefined,
  };

  // ── Left rail: search box + facet groups ──────────────────────────────────
  const priceCounts = new Map((priceRes.results ?? []).map((r) => [r.key, r.n]));
  const ratingCounts = { '4.5': ratingRes?.r45 ?? 0, '4': ratingRes?.r4 ?? 0, '3.5': ratingRes?.r35 ?? 0 };

  const hidden = (name, val) => (val ? `<input type="hidden" name="${name}" value="${escapeHtml(val)}">` : '');
  const searchForm = `<form method="get" action="/reviews" role="search" style="margin-bottom:1.4rem">
${hidden('category', filters.category)}${hidden('brand', filters.brand)}${hidden('price', filters.price)}${hidden('rating', filters.rating)}${filters.sort !== 'featured' ? hidden('sort', filters.sort) : ''}
<label for="rev-q" style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);display:block;margin-bottom:.4rem">Search products</label>
<div style="display:flex;gap:.4rem">
<input id="rev-q" type="search" name="q" value="${escapeHtml(filters.q)}" placeholder="e.g. nas, headphones" maxlength="80" style="flex:1;min-width:0;padding:.5rem .6rem;border:1px solid var(--line);border-radius:.5rem;background:var(--surface-1);color:var(--ink);font-size:.85rem">
<button type="submit" class="btn" style="font-size:.82rem;padding:.5rem .8rem">Go</button>
</div></form>`;

  // Custom price-range form. Preserves every other filter as hidden inputs but
  // NOT the preset band — entering a range replaces the band (parseProductFilters
  // gives the band precedence, so we must drop it here to honor the range).
  const priceRangeForm = `<form method="get" action="/reviews" style="margin:-.4rem 0 1.4rem">
${hidden('q', filters.q)}${hidden('category', filters.category)}${hidden('brand', filters.brand)}${hidden('rating', filters.rating)}${filters.sort !== 'featured' ? hidden('sort', filters.sort) : ''}
<div style="display:flex;gap:.35rem;align-items:center">
<input type="number" name="pmin" min="0" step="1" value="${filters.pmin ?? ''}" aria-label="Minimum price" placeholder="Min" style="width:100%;min-width:0;padding:.4rem .5rem;border:1px solid var(--line);border-radius:.45rem;background:var(--surface-1);color:var(--ink);font-size:.82rem">
<span style="color:var(--ink-3)">–</span>
<input type="number" name="pmax" min="0" step="1" value="${filters.pmax ?? ''}" aria-label="Maximum price" placeholder="Max" style="width:100%;min-width:0;padding:.4rem .5rem;border:1px solid var(--line);border-radius:.45rem;background:var(--surface-1);color:var(--ink);font-size:.82rem">
<button type="submit" class="btn" style="font-size:.8rem;padding:.4rem .7rem">Go</button>
</div></form>`;

  const sidebar = `<aside aria-label="Filters" style="position:sticky;top:5rem">
${searchForm}
${facetGroup('Category', filters, 'category', catRes.results ?? [], { labelOf: (r) => r.key, keyOf: (r) => r.key })}
${facetGroup('Brand', filters, 'brand', brandRes.results ?? [], { labelOf: (r) => r.key, keyOf: (r) => r.key })}
${facetGroup('Price', filters, 'price', PRICE_BANDS.map((b) => ({ ...b, n: priceCounts.get(b.key) ?? 0 })))}
${priceRangeForm}
${facetGroup('Rating', filters, 'rating', RATING_OPTIONS.map((o) => ({ ...o, n: ratingCounts[o.key] ?? 0 })))}
</aside>`;

  // ── Active-filter chips + sort row ─────────────────────────────────────────
  const activeChips = [];
  const chipFor = (dim, label) => `<a href="${escapeHtml(reviewsHref(filters, { [dim]: '' }))}" rel="nofollow" class="card-badge" style="text-decoration:none">${escapeHtml(label)} <span aria-hidden="true">&times;</span></a>`;
  if (filters.q) activeChips.push(chipFor('q', `“${filters.q}”`));
  if (filters.category) activeChips.push(chipFor('category', filters.category));
  if (filters.brand) activeChips.push(chipFor('brand', filters.brand));
  // Price: a preset band OR a custom pmin/pmax range. Either way, the chip clears
  // all three price keys so the price filter fully resets in one click.
  if (filters.price || filters.pmin != null || filters.pmax != null) {
    const label = filters.price
      ? (PRICE_BANDS.find((b) => b.key === filters.price)?.label || filters.price)
      : `${filters.pmin != null ? '$' + filters.pmin : '$0'} – ${filters.pmax != null ? '$' + filters.pmax : 'any'}`;
    activeChips.push(`<a href="${escapeHtml(reviewsHref(filters, { price: '', pmin: '', pmax: '' }))}" rel="nofollow" class="card-badge" style="text-decoration:none">${escapeHtml(label)} <span aria-hidden="true">&times;</span></a>`);
  }
  if (filters.rating) activeChips.push(chipFor('rating', RATING_OPTIONS.find((o) => o.key === filters.rating)?.label || filters.rating));
  const chipsRow = activeChips.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin-bottom:1rem">
${activeChips.join('')}
<a href="/reviews" rel="nofollow" style="font-size:.8rem;color:var(--accent);text-decoration:none">Clear all</a></div>`
    : '';

  const sortLinks = SORT_OPTIONS.map((o) =>
    `<a href="${escapeHtml(reviewsHref(filters, { sort: o.key }))}" rel="nofollow" style="font-size:.82rem;text-decoration:none;padding:.2rem .1rem;color:${filters.sort === o.key ? 'var(--ink)' : 'var(--ink-3)'};font-weight:${filters.sort === o.key ? '600' : '400'};border-bottom:2px solid ${filters.sort === o.key ? 'var(--accent)' : 'transparent'}">${escapeHtml(o.label)}</a>`).join('');

  const pagerHtml = totalPages > 1
    ? `<nav aria-label="Pagination" style="display:flex;justify-content:center;gap:.6rem;align-items:center;margin-top:2rem">
${filters.page > 1 ? `<a href="${escapeHtml(reviewsHref(filters, { page: filters.page - 1 }))}" rel="nofollow" class="btn" style="font-size:.85rem;padding:.5rem .9rem">&larr; Newer</a>` : ''}
<span style="font-size:.85rem;color:var(--ink-3)">Page ${filters.page} of ${totalPages}</span>
${filters.page < totalPages ? `<a href="${escapeHtml(reviewsHref(filters, { page: filters.page + 1 }))}" rel="nofollow" class="btn" style="font-size:.85rem;padding:.5rem .9rem">Older &rarr;</a>` : ''}
</nav>` : '';

  // Category-specific heading only when category is the SOLE active filter (so
  // the H1/title match the indexable category listing); any further narrowing
  // falls back to the generic heading (those variants are noindex anyway).
  const categoryOnly = filters.category && !filters.brand && !filters.price && !filters.rating && !filters.q
    && filters.pmin == null && filters.pmax == null;
  const heading = categoryOnly ? `Product reviews: ${filters.category}` : 'Product reviews';
  const reviewListItems = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    brand: r.brand || '',
    price: r.price,
    rating: r.rating,
    query: displayQuery(r.query),
    category: r.category || '',
    verdict: r.verdict || '',
    ts: (r.completed_at || 0) * 1000,
  }));
  const resultsHtml = rows.length
    ? `${jsonEmbed('reviews-list-data', reviewListItems)}<div id="reviews-list"><div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">${rows.map((r) => renderReviewCard(r, affiliateIds)).join('')}</div></div>`
    : `<p style="color:var(--ink-2);padding:2rem 0">No products match these filters. <a href="/reviews" style="color:var(--accent)">Clear all filters</a> and try again.</p>`;

  const body = `<div class="container" style="max-width:78rem;padding:2.5rem 1.5rem;margin:0 auto">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--ink-2);margin-bottom:1rem">
<a href="/" style="color:var(--ink-2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--ink-3)">/</span>
<span style="color:var(--ink)">Reviews</span>
</nav>
<div class="page-header">
<h1>${escapeHtml(heading)}</h1>
<p style="color:var(--ink-2);font-size:.95rem;margin-top:.5rem;max-width:62ch">Filter every product we've reviewed by category, brand, price, and rating. Ratings are synthesized from real user reviews and independent testing — never paid placements.</p>
</div>
${adSlot(env, 'top', 'Advertisement')}
<div class="reviews-shell" style="display:grid;grid-template-columns:15rem minmax(0,1fr);gap:2rem;align-items:start;margin-top:1.5rem">
${sidebar}
<div>
<div style="display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:.7rem;margin-bottom:1.1rem">
<p style="font-size:.9rem;color:var(--ink-2)"><strong style="color:var(--ink)">${total.toLocaleString()}</strong> product${total === 1 ? '' : 's'}</p>
<div style="display:flex;flex-wrap:wrap;gap:.1rem 1rem;align-items:center"><span style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)">Sort</span>${sortLinks}</div>
</div>
${chipsRow}
${resultsHtml}
${pagerHtml}
</div>
</div>
${adSlot(env, 'bottom', 'Advertisement')}
</div>
<style>@media (max-width:780px){.reviews-shell{grid-template-columns:1fr !important}.reviews-shell aside{position:static !important}}</style>`;

  // ItemList JSON-LD: products with ratings + review bodies — the structure
  // Google parses for review rich results on directory pages.
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: heading,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => {
      const item = { '@type': 'Product', name: r.name };
      if (r.brand) item.brand = { '@type': 'Brand', name: r.brand };
      if (r.image_url && isValidHttpsUrl(r.image_url)) item.image = r.image_url;
      if (r.verdict) {
        item.review = {
          '@type': 'Review',
          reviewBody: r.verdict,
          author: { '@type': 'Organization', name: 'Chrisputer Labs', url: 'https://chrisputer.tech' },
          ...(r.rating != null ? { reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 0 } } : {}),
        };
      }
      item.url = `https://chrisputer.tech/research/${r.slug}`;
      return { '@type': 'ListItem', position: offset + i + 1, item };
    }),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chrisputer.tech/' },
      { '@type': 'ListItem', position: 2, name: 'Reviews', item: 'https://chrisputer.tech/reviews' },
    ],
  };

  // SEO: only the base listing and a single-category listing are indexable.
  // Every further facet combination (brand/price/rating/keyword/sort/page>1) is
  // noindex,follow and canonicals up to the nearest indexable parent — this is
  // the standard defense against faceted-navigation index bloat (a 192-category
  // × 570-brand × 7-price × 3-rating space is millions of thin URLs otherwise).
  const narrowed = isNarrowed(filters);
  const canonical = `https://chrisputer.tech${reviewsHref({ category: filters.category })}`;
  const imgWireScript = `<script nonce="__CSP_NONCE__">
(function(){
  document.querySelectorAll('.item-image-photo').forEach(function(img){
    img.addEventListener('error',function(){
      img.hidden=true;
      var fb=img.nextElementSibling;
      if(fb&&fb.classList.contains('item-image-fallback'))fb.hidden=false;
    });
  });
})();
</script>`;
  const desc = categoryOnly
    ? `Honest reviews of ${filters.category} — ratings, pros and cons, and verdicts synthesized from real user reviews. No paid placements.`
    : 'Every product TrueRank has reviewed, filterable by category, brand, price, and rating. Honest ratings, pros and cons, and verdicts synthesized from real user reviews. No paid placements.';
  const reviewsListBoot = reviewListItems.length > 0
    ? listLayoutBoot({ dataId: 'reviews-list-data', containerId: 'reviews-list', kind: 'review' })
    : '';
  return layout(heading, desc, body,
    jsonLdScript(itemListLd) + jsonLdScript(breadcrumbLd) + imgWireScript + reviewsListBoot,
    { canonical, noindex: narrowed });
}
