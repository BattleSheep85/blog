// Assertions for the dead-URL disposition map (worker/lib/dead-urls.js).
import { deadUrlResponse, DEAD_URL_DISPOSITIONS } from '../../worker/lib/dead-urls.js';

export function runDeadUrlsTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // Unknown path is a pass-through (null), so the router falls back to
  // normal asset serving / 404 handling.
  eq('unknown path returns null', deadUrlResponse('/some/random/path/'), null);

  // Both known-dead posts return 410 Gone (both were live-checked 404 with
  // no equivalent content elsewhere, per the 2026-08-03 GSC audit).
  for (const path of Object.keys(DEAD_URL_DISPOSITIONS)) {
    const disposition = DEAD_URL_DISPOSITIONS[path];
    const res = deadUrlResponse(path);
    ok(`${path} returns a Response`, res instanceof Response);
    eq(`${path} status`, res.status, disposition.status);
    if (disposition.status === 301) {
      eq(`${path} Location header`, res.headers.get('Location'), disposition.location);
    }
  }

  // 410 responses carry a short public cache so Google keeps re-checking the
  // verdict (rather than caching it forever) until it drops the URL.
  const gone = deadUrlResponse('/posts/zero-trust-small-business-budget/');
  ok('410 has Cache-Control', gone.headers.get('Cache-Control').includes('max-age'));

  return report;
}
