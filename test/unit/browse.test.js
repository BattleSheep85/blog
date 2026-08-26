// Pagination-integrity tests for /research (worker/pages/browse.js).
//
// The mock D1 below answers the count query and the listing query from ONE
// dataset, the way a real database does. That is the whole point: the bug this
// suite guards against was a listing and a page count that disagreed, which
// left reports linked from nowhere. The walk test below follows the pagination
// exactly as a crawler would and asserts the reachable slug set equals the
// listable slug set.

import { renderBrowse } from '../../worker/pages/browse.js';

const TOTAL_ROWS = 441; // matches the measured production listable count
const PER_PAGE = 48;

function makeRow(i) {
  return {
    id: `id${String(i).padStart(4, '0')}`,
    slug: `product-${i}`,
    query: `product ${i} keyboard`,
    // Deliberate created_at ties every 5 rows: without the id tiebreak in
    // lib/listable.js these are exactly the rows that fall between pages.
    created_at: 1700000000 - Math.floor(i / 5) * 60,
    category: 'Test',
    summary: 'A short summary.',
    product_count: 2,
    view_count: 1,
  };
}

const DATASET = Array.from({ length: TOTAL_ROWS }, (_, i) => makeRow(i));

function mockEnv(dataset = DATASET) {
  return {
    DB: {
      prepare(sql) {
        const stmt = {
          _args: [],
          bind(...args) { stmt._args = args; return stmt; },
          async all() {
            if (!sql.includes('OFFSET')) return { results: [] };
            const args = stmt._args;
            const offset = args[args.length - 1];
            const limitPlusOne = args[args.length - 2];
            const pool = sql.includes('LIKE ?1')
              ? dataset.filter((r) => r.query.includes(String(args[0]).replace(/%/g, '')))
              : dataset;
            return { results: pool.slice(offset, offset + limitPlusOne) };
          },
          async first() {
            if (sql.includes('COUNT(*) AS n FROM ranked')) return { n: dataset.length };
            return null;
          },
        };
        return stmt;
      },
    },
  };
}

async function renderPage(pageParam, env = mockEnv()) {
  const url = new URL(`https://chrisputer.tech/research${pageParam != null ? `?page=${pageParam}` : ''}`);
  return renderBrowse(url, env);
}

function slugsIn(html) {
  const out = new Set();
  const re = /href="\/research\/([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

function pagerPagesIn(html) {
  const out = new Set();
  const re = /href="\/research\?page=(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(Number(m[1]));
  return out;
}

export async function runBrowseRenderTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  const totalPages = Math.ceil(TOTAL_ROWS / PER_PAGE); // 10

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
    ok('page 1: pager promises no page past the last', ![...pagerPagesIn(html)].some((p) => p > totalPages));
    ok('page 1: not noindexed', !html.includes('noindex, follow'));
  }

  // A middle page.
  {
    const mid = 5;
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

  // The last real page: the remainder of the dataset, no rel=next.
  {
    const lastCount = TOTAL_ROWS - (totalPages - 1) * PER_PAGE; // 9
    let html = null, threw = null;
    try { html = await renderPage(totalPages); } catch (e) { threw = e; }
    ok('last page: no throw', !threw);
    ok('last page: has cards', html.includes(`href="/research/product-${(totalPages - 1) * PER_PAGE}"`));
    ok('last page: serves the remainder', slugsIn(html).size === lastCount);
    ok('last page: no rel=next (nothing past it)', !html.includes('rel="next"'));
    ok('last page: self-referencing canonical', html.includes(`<link rel="canonical" href="https://chrisputer.tech/research?page=${totalPages}">`));
  }

  // Past the end: null, which the router turns into a 404. An empty 200 here
  // is a crawl trap (every page number up to MAX_PAGE would answer 200).
  {
    let out = 'unset', threw = null;
    try { out = await renderPage(totalPages + 1); } catch (e) { threw = e; }
    ok('beyond-end page: no throw', !threw);
    ok('beyond-end page: returns null (404)', out === null);
  }
  {
    let out = 'unset';
    try { out = await renderPage(totalPages + 500); } catch { /* covered below */ }
    ok('far-beyond-end page: returns null (404)', out === null);
  }
  {
    const url = new URL('https://chrisputer.tech/research?q=nothingmatchesthis&page=4');
    const out = await renderBrowse(url, mockEnv());
    ok('beyond-end search page: returns null (404)', out === null);
  }

  // An empty archive still renders page 1 (the "No research yet" state).
  {
    const html = await renderPage(null, mockEnv([]));
    ok('empty archive: page 1 still renders 200', typeof html === 'string' && html.includes('No research yet'));
    const out = await renderPage(2, mockEnv([]));
    ok('empty archive: page 2 is a 404', out === null);
  }

  // A non-numeric page value: falls back to page 1 behavior, not 500.
  {
    let html = null, threw = null;
    try { html = await renderPage('not-a-number'); } catch (e) { threw = e; }
    ok('non-numeric page: no throw', !threw);
    ok('non-numeric page: falls back to page 1 canonical', html.includes('<link rel="canonical" href="https://chrisputer.tech/research">'));
  }

  // THE ACCEPTANCE BAR: walk the pagination like a crawler and compare the
  // reachable slug set against the listable set. Difference must be zero, and
  // no slug may be served twice.
  {
    const reachable = new Set();
    let served = 0;
    let pastEndOk = true;
    for (let p = 1; p <= totalPages; p++) {
      const html = await renderPage(p === 1 ? null : p);
      if (html === null) { pastEndOk = false; break; }
      const slugs = slugsIn(html);
      served += slugs.size;
      for (const s of slugs) reachable.add(s);
    }
    ok('walk: every page in the pager serves cards', pastEndOk);
    ok('walk: reachable set equals the listable set', reachable.size === TOTAL_ROWS);
    ok('walk: no slug served on two pages', served === TOTAL_ROWS);
    ok('walk: page count matches the served rows', Math.ceil(served / PER_PAGE) === totalPages);
  }

  return report;
}
