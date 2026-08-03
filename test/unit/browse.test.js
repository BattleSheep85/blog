// Render-smoke + pagination-bounds tests for /research (worker/pages/browse.js).
// Mirrors the reviews.test.js pattern: a mock D1 that answers by SQL shape,
// driven through renderBrowse for page 1 / a middle page / the last page /
// a page number past the end / a non-numeric page value. Guards against a
// 500 on any of those and checks the self-referencing canonical + numbered
// pager land where they should.

import { renderBrowse } from '../../worker/pages/browse.js';

const TOTAL_ROWS = 687; // matches the measured production report count
const PER_PAGE = 48;

function makeRow(i) {
  return {
    id: `id${i}`, slug: `product-${i}`, query: `product ${i}`, created_at: 1700000000 - i,
    category: 'Test', summary: 'A short summary.', product_count: 2, view_count: 1,
  };
}

function mockEnv() {
  return {
    DB: {
      prepare(sql) {
        const stmt = {
          bind(...args) { stmt._args = args; return stmt; },
          async all() {
            if (sql.includes('LIMIT ?2 OFFSET ?3') || sql.includes('LIMIT ?1 OFFSET ?2')) {
              const limitPlusOne = stmt._args[stmt._args.length - 2];
              const offset = stmt._args[stmt._args.length - 1];
              const rows = [];
              for (let i = 0; i < limitPlusOne && offset + i < TOTAL_ROWS; i++) rows.push(makeRow(offset + i));
              return { results: rows };
            }
            return { results: [] };
          },
          async first() {
            if (sql.includes('SELECT COUNT(*) AS n FROM (')) return { n: TOTAL_ROWS };
            return null;
          },
        };
        return stmt;
      },
    },
  };
}

async function renderPage(pageParam) {
  const url = new URL(`https://chrisputer.tech/research${pageParam != null ? `?page=${pageParam}` : ''}`);
  return renderBrowse(url, mockEnv());
}

export async function runBrowseRenderTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  const totalPages = Math.ceil(TOTAL_ROWS / PER_PAGE); // 15

  // Page 1: cards present, self-referencing canonical (bare /research), full
  // numbered pager linking every page including the last.
  {
    let html = null, threw = null;
    try { html = await renderPage(null); } catch (e) { threw = e; }
    ok('page 1: no throw', !threw);
    ok('page 1: renders report cards', html.includes('href="/research/product-0"'));
    ok('page 1: canonical is bare /research', html.includes('<link rel="canonical" href="https://chrisputer.tech/research">'));
    ok('page 1: has no rel=prev', !html.includes('rel="prev"'));
    ok('page 1: has rel=next', html.includes(`rel="next" href="https://chrisputer.tech/research?page=2"`));
    ok('page 1: numbered pager links the last page', html.includes(`href="/research?page=${totalPages}"`));
    ok('page 1: not noindexed', !html.includes('noindex, follow'));
  }

  // A middle page.
  {
    const mid = 8;
    let html = null, threw = null;
    try { html = await renderPage(mid); } catch (e) { threw = e; }
    ok('middle page: no throw', !threw);
    ok('middle page: self-referencing canonical', html.includes(`<link rel="canonical" href="https://chrisputer.tech/research?page=${mid}">`));
    ok('middle page: has rel=prev', html.includes(`rel="prev" href="https://chrisputer.tech/research?page=${mid - 1}"`));
    ok('middle page: has rel=next', html.includes(`rel="next" href="https://chrisputer.tech/research?page=${mid + 1}"`));
    ok('middle page: NOT noindexed (pagination alone stays indexable)', !html.includes('noindex, follow'));
  }

  // A page with an active search query: noindex must be present regardless
  // of page number, since open-ended search results should not be indexed.
  {
    const url = new URL('https://chrisputer.tech/research?q=keyboard&page=2');
    let html = null, threw = null;
    try { html = await renderBrowse(url, mockEnv()); } catch (e) { threw = e; }
    ok('search page: no throw', !threw);
    ok('search page: noindexed', html.includes('noindex, follow'));
  }

  // The last real page.
  {
    let html = null, threw = null;
    try { html = await renderPage(totalPages); } catch (e) { threw = e; }
    ok('last page: no throw', !threw);
    ok('last page: has cards', html.includes(`href="/research/product-${(totalPages - 1) * PER_PAGE}"`));
    ok('last page: no rel=next (nothing past it)', !html.includes('rel="next"'));
    ok('last page: self-referencing canonical', html.includes(`<link rel="canonical" href="https://chrisputer.tech/research?page=${totalPages}">`));
  }

  // A page number past the end: must render gracefully, not 500.
  {
    let html = null, threw = null;
    try { html = await renderPage(totalPages + 50); } catch (e) { threw = e; }
    ok('beyond-end page: no throw', !threw);
    ok('beyond-end page: renders a string', typeof html === 'string' && html.length > 0);
  }

  // A non-numeric page value: falls back to page 1 behavior, not 500.
  {
    let html = null, threw = null;
    try { html = await renderPage('not-a-number'); } catch (e) { threw = e; }
    ok('non-numeric page: no throw', !threw);
    ok('non-numeric page: falls back to page 1 canonical', html.includes('<link rel="canonical" href="https://chrisputer.tech/research">'));
  }

  return report;
}
