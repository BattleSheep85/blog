// Render smoke test for the faceted /reviews page. renderReviewsPage can't be
// unit-tested by the pure-builder suite, yet it's exactly where a DB-less runtime
// throw hides (e.g. the `valueOf` Object.prototype-collision that 500'd every
// request and passed `node --check`). This drives the real render with a mock
// env.DB across base / single-category / multi-facet / custom-range variants and
// asserts it produces HTML without throwing, with the right indexable/noindex
// signal. Cheap insurance against shipping another render 500.

import { renderReviewsPage } from '../../worker/pages/reviews.js';
import { starMarkup } from '../../worker/pages/research-primitives.js';

const PRODUCT = {
  id: 'abcd1234', name: 'Synology DS224+', brand: 'Synology', price: 499, rating: 4.5,
  image_url: '', product_url: 'https://amazon.com/dp/B0TEST000', affiliate_url: '',
  manufacturer_url: '', pros: '["fast","quiet","easy"]', cons: '["pricey","2-bay"]',
  verdict: 'Solid pick for home backup overall, easy setup.', rank: 1,
  slug: 'best-nas', query: 'best nas', category: 'NAS', facets: '{}',
  completed_at: 1700000000, view_count: 9,
};

// A web-only (not-sold-on-Amazon) product so the card renders the Google-handoff
// CTA branch instead of the Amazon CTA.
const WEB_ONLY = {
  id: 'svc1', name: 'Lawn Care Service', brand: '', price: null, rating: 4,
  image_url: '', product_url: '', affiliate_url: '', manufacturer_url: '',
  pros: '["reliable"]', cons: '["regional"]', verdict: 'Solid local service overall.',
  rank: 2, slug: 'best-lawn-care', query: 'best lawn care service', category: 'services',
  facets: '{"sold_on_amazon":false,"is_service":true}', completed_at: 1700000000, view_count: 1,
};

// A 42-row synthetic product list (matches the mocked COUNT = 42, PAGE_SIZE =
// 24 → 2 pages) so offset/limit-driven pagination behaves like the real query.
const PRODUCT_ROWS = Array.from({ length: 42 }, (_, i) => ({
  ...PRODUCT, id: `p${i}`, slug: `best-nas-${i}`,
}));

// Mock D1: route each statement by its SQL (the 6 queries run concurrently via
// Promise.all, so call-order can't distinguish them) — list → product rows,
// each facet GROUP BY → {key,n} rows, count/rating-sum → .first shapes.
function mockEnv() {
  return {
    AMAZON_AFFILIATE_TAG: 'battlesheep0a-20',
    DB: {
      prepare(sql) {
        const stmt = {
          bind(...args) { stmt._args = args; return stmt; },
          async all() {
            if (sql.includes('GROUP BY r.category')) return { results: [{ key: 'NAS', n: 5 }, { key: 'Audio', n: 3 }] };
            if (sql.includes('GROUP BY p.brand')) return { results: [{ key: 'Synology', n: 3 }, { key: 'Sony', n: 2 }] };
            if (sql.includes('GROUP BY key')) return { results: [{ key: 'u25', n: 2 }, { key: '250-500', n: 1 }] };
            if (sql.includes('r.slug, r.query, r.category, r.facets')) {
              // The main list query: last two binds are LIMIT, OFFSET.
              const [limit, offset] = stmt._args.slice(-2);
              return { results: [...PRODUCT_ROWS, WEB_ONLY].slice(offset, offset + limit) };
            }
            return { results: [PRODUCT, WEB_ONLY] };
          },
          async first() {
            if (sql.includes('SUM(CASE WHEN p.rating')) return { r45: 10, r4: 20, r35: 30 };
            return { n: 42 }; // count
          },
        };
        return stmt;
      },
    },
  };
}

export async function runReviewsRenderTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  // starMarkup must clamp out-of-range/NaN ratings so String.repeat never throws
  // a RangeError (which would 500 the report page). Always exactly 5 glyphs.
  for (const r of [6, -1, NaN, 3.7, null, undefined, '4']) {
    let s = null, threw = null;
    try { s = starMarkup(r); } catch (e) { threw = e; }
    ok(`starMarkup(${String(r)}): no throw`, !threw);
    ok(`starMarkup(${String(r)}): 5 glyphs`, typeof s === 'string' && [...s].length === 5 && /^[★☆]{5}$/u.test(s));
  }

  const cases = [
    { url: '/reviews', wantNoindex: false },
    { url: '/reviews?category=NAS', wantNoindex: false },
    { url: '/reviews?brand=Synology&price=250-500&rating=4&sort=rating&q=nas', wantNoindex: true },
    { url: '/reviews?pmin=50&pmax=300', wantNoindex: true },
    // Pagination bounds: page 1 baseline, a middle page, the last page (with
    // the mocked count=42 / PAGE_SIZE=24 that's totalPages=2, so "last" here
    // is page 2), a page number past the end, and a non-numeric page value —
    // none of these should throw or produce a 500-shaped result.
    { url: '/reviews?page=1', wantNoindex: false },
    { url: '/reviews?page=2', wantNoindex: false },
    { url: '/reviews?page=999', wantNoindex: false, expectNull: true },
    { url: '/reviews?page=not-a-number', wantNoindex: false },
    // A search query on a paginated page must stay noindex regardless of page.
    { url: '/reviews?q=nas&page=2', wantNoindex: true },
  ];
  for (const c of cases) {
    let html = null, threw = null;
    try { html = await renderReviewsPage(new URL('https://chrisputer.tech' + c.url), mockEnv()); }
    catch (e) { threw = e; }
    ok(`render ${c.url}: no throw`, !threw);
    if (c.expectNull) {
      ok(`render ${c.url}: out-of-range page returns null (→ 404, not 500)`, html === null);
      continue;
    }
    if (html) {
      ok(`render ${c.url}: has filter sidebar`, html.includes('aria-label="Filters"'));
      ok(`render ${c.url}: has all four facets`, html.includes('>Category<') && html.includes('>Brand<') && html.includes('>Price<') && html.includes('>Rating<'));
      ok(`render ${c.url}: noindex=${c.wantNoindex}`, html.includes('noindex,follow') === c.wantNoindex);
      if (c.url === '/reviews') {
        ok('base: renders SSR review cards (not empty container)', html.includes('class="review-card"'));
        ok('base: renders a buy CTA', html.includes('product-cta-amazon'));
        ok('base: card links to parent research report', html.includes('/research/best-nas'));
      }
    }
  }
  return report;
}
