// Render smoke test for the cross-page canonical that consolidates non-winning
// cluster members onto their cluster's winner (see worker/lib/db.js
// getClusterWinnerSlug + worker/pages/research-page.js). Drives the real
// renderResearchResult with a mock env.DB, same approach as
// test/unit/reviews.test.js, and asserts on the produced HTML string.

import { renderResearchResult } from '../../worker/pages/research-page.js';

const PRODUCT = {
  id: 'p1', name: 'Widget Pro', brand: 'Acme', price: 99, rating: 4.5,
  image_url: '', product_url: 'https://amazon.com/dp/B0TEST000', affiliate_url: '',
  manufacturer_url: '', pros: '["fast"]', cons: '["pricey"]',
  verdict: 'Solid pick overall.', rank: 1, best_for: 'most people',
};

// Three products so publicResearchFilter's thin-page gate (>= 3) is satisfied
// — the cluster-winner query itself also runs through publicResearchFilter,
// so a thin fixture would make the mock's own filter reasoning moot.
const PRODUCTS = [PRODUCT, { ...PRODUCT, id: 'p2', rank: 2 }, { ...PRODUCT, id: 'p3', rank: 3 }];

function baseEntry(overrides) {
  return {
    id: 'r1', slug: 'best-widget', query: 'best widget for home use',
    status: 'complete', category: 'Widgets', canonical_query: null,
    facets: '{}', sources: '[]', clarifications: '{}', result: '{}',
    summary: 'Widgets compared.', created_at: 1700000000, completed_at: 1700000100,
    view_count: 3,
    ...overrides,
  };
}

// mockEnv: routes each prepared statement by a distinctive SQL substring.
// `winnerSlug` controls what getClusterWinnerSlug's query returns.
function mockEnv(entry, winnerSlug) {
  return {
    DB: {
      prepare(sql) {
        const stmt = {
          bind(...args) { stmt._args = args; return stmt; },
          async first() {
            if (sql.includes('FROM research WHERE slug = ?')) return entry;
            if (sql.includes('r.canonical_query = ?1')) {
              return winnerSlug ? { slug: winnerSlug } : null;
            }
            return null;
          },
          async all() {
            if (sql.includes('FROM products WHERE research_id')) return { results: PRODUCTS };
            return { results: [] };
          },
          async run() { return {}; },
        };
        return stmt;
      },
    },
  };
}

function canonicalHref(html) {
  const m = html.match(/<link rel="canonical" href="([^"]+)">/);
  return m ? m[1] : null;
}

function jsonLdArticleUrl(html) {
  const m = html.match(/"@type":"Article"[^}]*"url":"([^"]+)"/);
  return m ? m[1] : null;
}

export async function runResearchCanonicalTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  // 1. A cluster winner renders a self canonical.
  {
    const entry = baseEntry({ slug: 'best-widget', canonical_query: 'a a a' });
    const { html } = await renderResearchResult('best-widget', mockEnv(entry, 'best-widget'));
    const canonical = canonicalHref(html);
    ok('winner: canonical points at itself', canonical === 'https://chrisputer.tech/research/best-widget');
    ok('winner: canonical matches JSON-LD Article url', canonical === jsonLdArticleUrl(html));
    ok('winner: no "newer report" banner', !html.includes('A newer report answers this question'));
  }

  // 2. A non-winner renders the winner's URL.
  {
    const entry = baseEntry({ slug: 'best-widget-old', canonical_query: 'a a a' });
    const { html } = await renderResearchResult('best-widget-old', mockEnv(entry, 'best-widget-new'));
    const canonical = canonicalHref(html);
    ok('non-winner: canonical points at the winner', canonical === 'https://chrisputer.tech/research/best-widget-new');
    ok('non-winner: canonical matches JSON-LD Article url', canonical === jsonLdArticleUrl(html));
    ok('non-winner: page still returns content, not a redirect', html.includes('Widget Pro'));
    ok('non-winner: shows the "newer report" banner linking to the winner',
      html.includes('A newer report answers this question') &&
      html.includes('href="https://chrisputer.tech/research/best-widget-new"'));
  }

  // 3. A report in a cluster of one (no canonical_query) renders a self canonical.
  {
    const entry = baseEntry({ slug: 'best-widget-solo', canonical_query: null });
    const { html } = await renderResearchResult('best-widget-solo', mockEnv(entry, null));
    const canonical = canonicalHref(html);
    ok('solo cluster: canonical points at itself', canonical === 'https://chrisputer.tech/research/best-widget-solo');
    ok('solo cluster: canonical matches JSON-LD Article url', canonical === jsonLdArticleUrl(html));
    ok('solo cluster: no "newer report" banner', !html.includes('A newer report answers this question'));
  }

  // 4. renderResearchResult returns status field on all rendered return paths.
  {
    const completeEntry = baseEntry({ status: 'complete' });
    const completeRes = await renderResearchResult('best-widget', mockEnv(completeEntry, null));
    ok('complete entry returns status === complete', completeRes.status === 'complete');

    const pendingEntry = baseEntry({ status: 'pending' });
    const pendingRes = await renderResearchResult('best-widget', mockEnv(pendingEntry, null));
    ok('pending entry returns status === pending', pendingRes.status === 'pending');

    const processingEntry = baseEntry({ status: 'processing' });
    const processingRes = await renderResearchResult('best-widget', mockEnv(processingEntry, null));
    ok('processing entry returns status === processing', processingRes.status === 'processing');

    const failedEntry = baseEntry({ status: 'failed' });
    const failedRes = await renderResearchResult('best-widget', mockEnv(failedEntry, null));
    ok('failed entry returns status === failed', failedRes.status === 'failed');

    const notFoundRes = await renderResearchResult('not-found-slug', mockEnv(null, null));
    ok('missing entry returns Response object with status 404', notFoundRes instanceof Response && notFoundRes.status === 404);
  }

  return report;
}
