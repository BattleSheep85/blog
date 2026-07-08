// Render smoke test for the faceted /reviews page. renderReviewsPage can't be
// unit-tested by the pure-builder suite, yet it's exactly where a DB-less runtime
// throw hides (e.g. the `valueOf` Object.prototype-collision that 500'd every
// request and passed `node --check`). This drives the real render with a mock
// env.DB across base / single-category / multi-facet / custom-range variants and
// asserts it produces HTML without throwing, with the right indexable/noindex
// signal. Cheap insurance against shipping another render 500.

import { renderReviewsPage } from '../../worker/pages/reviews.js';

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

// Mock D1: route each statement by its SQL (the 6 queries run concurrently via
// Promise.all, so call-order can't distinguish them) — list → product rows,
// each facet GROUP BY → {key,n} rows, count/rating-sum → .first shapes.
function mockEnv() {
  return {
    AMAZON_AFFILIATE_TAG: 'battlesheep0a-20',
    DB: {
      prepare(sql) {
        const stmt = {
          bind() { return stmt; },
          async all() {
            if (sql.includes('GROUP BY r.category')) return { results: [{ key: 'NAS', n: 5 }, { key: 'Audio', n: 3 }] };
            if (sql.includes('GROUP BY p.brand')) return { results: [{ key: 'Synology', n: 3 }, { key: 'Sony', n: 2 }] };
            if (sql.includes('GROUP BY key')) return { results: [{ key: 'u25', n: 2 }, { key: '250-500', n: 1 }] };
            return { results: [PRODUCT, WEB_ONLY] }; // the list query (Amazon + web-only CTAs)
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

  const cases = [
    { url: '/reviews', wantNoindex: false },
    { url: '/reviews?category=NAS', wantNoindex: false },
    { url: '/reviews?brand=Synology&price=250-500&rating=4&sort=rating&q=nas', wantNoindex: true },
    { url: '/reviews?pmin=50&pmax=300', wantNoindex: true },
  ];
  for (const c of cases) {
    let html = null, threw = null;
    try { html = await renderReviewsPage(new URL('https://chrisputer.tech' + c.url), mockEnv()); }
    catch (e) { threw = e; }
    ok(`render ${c.url}: no throw`, !threw);
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
