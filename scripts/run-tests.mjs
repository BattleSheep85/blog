#!/usr/bin/env node
// Test runner for the worker's in-repo test suites. Zero dependencies —
// run with plain `node scripts/run-tests.mjs`. Exits non-zero on any failure
// so it can gate commits or deploys.
//
// This is THE way the credibility rubric (PRD §2 trust-weight table) is
// re-verified. If you touch worker/lib/credibility.js, run this.

import { runCredibilityTests } from '../worker/lib/credibility.test.js';
import { runValidateTests } from '../worker/engine/validate.test.js';
import { runProductSearchTests } from '../worker/lib/product-search.test.js';
import { runReviewsRenderTests } from '../worker/pages/reviews.test.js';

const suites = [
  ['credibility', runCredibilityTests],
  ['validate-quality-gate', runValidateTests],
  ['product-search', runProductSearchTests],
  ['reviews-render', runReviewsRenderTests], // async suite (awaited below)
];

let failed = 0;
for (const [name, fn] of suites) {
  const report = await fn();
  const total = report.passed + report.failed;
  console.log(`${name}: ${report.passed}/${total} passed`);
  if (report.failed > 0) {
    failed += report.failed;
    for (const f of report.failures) console.log(`  FAIL ${f}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll suites green');
