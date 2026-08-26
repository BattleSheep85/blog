// Pure-logic tests for the shared numbered pager (worker/lib/pager.js).
// Covers the "every report reachable" contract: page 1, a middle page, the
// last page, and the switch from a full run to a windowed run.

import { pagerNumbers, renderPagerNav } from '../../worker/lib/pager.js';

export function runPagerTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  ok('totalPages<=1: no numbers', pagerNumbers(1, 1).length === 0);
  ok('totalPages=0: no numbers', pagerNumbers(0, 1).length === 0);

  const full = pagerNumbers(15, 1);
  ok('full run: lists every page 1..15', full.length === 15 && full[0] === 1 && full[14] === 15);
  ok('full run: no ellipsis under the cap', !full.includes('...'));

  const windowedFirst = pagerNumbers(60, 1);
  ok('windowed: still includes page 1', windowedFirst[0] === 1);
  ok('windowed: still includes the last page', windowedFirst[windowedFirst.length - 1] === 60);
  ok('windowed: has an ellipsis gap', windowedFirst.includes('...'));

  const windowedMiddle = pagerNumbers(60, 30);
  ok('windowed middle: includes current page', windowedMiddle.includes(30));
  ok('windowed middle: includes first page', windowedMiddle[0] === 1);
  ok('windowed middle: includes last page', windowedMiddle[windowedMiddle.length - 1] === 60);

  const windowedLast = pagerNumbers(60, 60);
  ok('windowed last: current page reachable', windowedLast.includes(60));

  // renderPagerNav: no throw, and every page number produces a real <a href>.
  const html = renderPagerNav(15, 5, (n) => `/research?page=${n}`, 'Test pages');
  ok('renderPagerNav: no throw / non-empty', typeof html === 'string' && html.length > 0);
  ok('renderPagerNav: links every page 1..15', Array.from({ length: 15 }, (_, i) => i + 1)
    .every((n) => html.includes(`href="/research?page=${n}"`) || (n === 1 && html.includes('href="/research?page=1"'))));
  ok('renderPagerNav: marks current page', html.includes('aria-current="page"'));

  ok('renderPagerNav: empty for a single page', renderPagerNav(1, 1, (n) => `/x?page=${n}`, 'x') === '');

  return report;
}
