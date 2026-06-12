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

const PAGE_SIZE = 24;
const DEFAULT_AFFILIATE_TAG = 'battlesheep0a-20';

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

export async function renderReviewsPage(url, env) {
  const pageNum = Math.max(1, Math.min(200, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const category = (url.searchParams.get('category') || '').trim().slice(0, 120);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const whereCategory = category ? 'AND r.category = ?1' : '';
  const baseWhere = `FROM products p JOIN research r ON r.id = p.research_id
     WHERE r.status = 'complete' AND p.verdict IS NOT NULL AND p.verdict != '' ${whereCategory}`;

  const listBinds = category ? [category, PAGE_SIZE, offset] : [PAGE_SIZE, offset];
  const limitIdx = category ? 2 : 1;
  const [listRes, countRes, catRes] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.name, p.brand, p.price, p.rating, p.image_url, p.product_url,
              p.affiliate_url, p.manufacturer_url, p.pros, p.cons, p.verdict, p.rank,
              r.slug, r.query, r.category, r.facets, r.completed_at, r.view_count
       ${baseWhere}
       ORDER BY (p.image_url IS NULL OR p.image_url = '') ASC, r.view_count DESC, r.completed_at DESC, p.rank ASC
       LIMIT ?${limitIdx} OFFSET ?${limitIdx + 1}`
    ).bind(...listBinds).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n ${baseWhere}`).bind(...(category ? [category] : [])).first(),
    env.DB.prepare(
      `SELECT r.category, COUNT(*) AS n FROM products p JOIN research r ON r.id = p.research_id
       WHERE r.status = 'complete' AND p.verdict IS NOT NULL AND p.verdict != '' AND r.category IS NOT NULL
       GROUP BY r.category ORDER BY n DESC LIMIT 12`
    ).all(),
  ]);

  const rows = listRes.results ?? [];
  const total = countRes?.n ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (rows.length === 0 && pageNum > 1) return null; // out-of-range page → 404

  const affiliateIds = {
    amazonTag: env.AMAZON_AFFILIATE_TAG || env.AMAZON_ASSOCIATE_TAG || DEFAULT_AFFILIATE_TAG,
    walmartImpact: env.WALMART_IMPACT_ID || undefined,
    targetImpact: env.IMPACT_TARGET_ID || undefined,
    bestbuyImpact: env.IMPACT_BESTBUY_ID || undefined,
    neweggImpact: env.IMPACT_NEWEGG_ID || undefined,
    bhphoto: env.BHPHOTO_AFFILIATE_ID || undefined,
  };

  const categories = (catRes.results ?? []).filter((c) => c.category);
  const chip = (label, href, active) =>
    `<a href="${escapeHtml(href)}" class="card-badge" style="text-decoration:none;${active ? 'background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--ink);border-color:color-mix(in srgb,var(--accent) 45%,transparent)' : ''}">${escapeHtml(label)}</a>`;
  const chipsHtml = categories.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:.45rem;margin:1.25rem 0">
${chip('All', '/reviews', !category)}
${categories.map((c) => chip(`${c.category} (${c.n})`, `/reviews?category=${encodeURIComponent(c.category)}`, category === c.category)).join('')}
</div>` : '';

  const pageHref = (n) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (n > 1) params.set('page', String(n));
    const qs = params.toString();
    return `/reviews${qs ? `?${qs}` : ''}`;
  };
  const pagerHtml = totalPages > 1
    ? `<nav aria-label="Pagination" style="display:flex;justify-content:center;gap:.6rem;align-items:center;margin-top:2rem">
${pageNum > 1 ? `<a href="${escapeHtml(pageHref(pageNum - 1))}" class="btn" style="font-size:.85rem;padding:.5rem .9rem">&larr; Newer</a>` : ''}
<span style="font-size:.85rem;color:var(--ink-3)">Page ${pageNum} of ${totalPages}</span>
${pageNum < totalPages ? `<a href="${escapeHtml(pageHref(pageNum + 1))}" class="btn" style="font-size:.85rem;padding:.5rem .9rem">Older &rarr;</a>` : ''}
</nav>` : '';

  const heading = category ? `Product reviews: ${category}` : 'Product reviews';
  const body = `<div class="container" style="max-width:72rem;padding:3rem 1.5rem;margin:0 auto">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--ink-2);margin-bottom:1rem">
<a href="/" style="color:var(--ink-2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--ink-3)">/</span>
<span style="color:var(--ink)">Reviews</span>
</nav>
<div class="page-header">
<h1>${escapeHtml(heading)}</h1>
<p style="color:var(--ink-2);font-size:.95rem;margin-top:.5rem;max-width:60ch">${total.toLocaleString()} products reviewed across our research reports. Every rating is synthesized from real user reviews and independent testing — never paid placements. Click through to any report for the full review with sources.</p>
</div>
${chipsHtml}
${adSlot(env, 'top', 'Advertisement')}
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(17rem,1fr));gap:1.1rem;margin-top:1.5rem">
${rows.map((r) => renderReviewCard(r, affiliateIds)).join('')}
</div>
${pagerHtml}
${adSlot(env, 'bottom', 'Advertisement')}
</div>`;

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

  // Self-canonical per filter/page so paginated/filtered variants don't
  // collapse into one URL (Google treats ?page= as distinct content here).
  const canonical = `https://chrisputer.tech${pageHref(pageNum)}`;
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
  const desc = category
    ? `Honest reviews of ${category} — ratings, pros and cons, and verdicts synthesized from real user reviews. No paid placements.`
    : 'Every product TrueRank has reviewed: photos, honest ratings, pros and cons, and verdicts synthesized from real user reviews. No paid placements.';
  return layout(heading, desc, body,
    jsonLdScript(itemListLd) + jsonLdScript(breadcrumbLd) + imgWireScript,
    { canonical });
}
