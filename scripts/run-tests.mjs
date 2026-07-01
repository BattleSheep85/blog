#!/usr/bin/env node
// Test runner for the worker's in-repo test suites. Zero dependencies —
// run with plain `node scripts/run-tests.mjs`. Exits non-zero on any failure
// so it can gate commits or deploys.
//
// This is THE way the credibility rubric (PRD §2 trust-weight table) is
// re-verified. If you touch worker/lib/credibility.js, run this.

import { runCredibilityTests } from '../test/unit/credibility.test.js';
import { runValidateTests } from '../test/unit/validate.test.js';
import { runProductSearchTests } from '../test/unit/product-search.test.js';
import { runReviewsRenderTests } from '../test/unit/reviews.test.js';
import { runCredibilityExtraTests } from '../test/unit/credibility-extra.test.js';
import { runPromptsTests } from '../test/unit/prompts.test.js';
import { runLlmTests } from '../test/unit/llm.test.js';
import { runUtilsTests } from '../test/unit/utils.test.js';
import { runAffiliateLinksTests } from '../test/unit/affiliate-links.test.js';
import { runLibPureTests } from '../test/unit/lib-pure.test.js';
import { runAsinResolverTests } from '../test/unit/asin-resolver.test.js';

const suites = [
  ['credibility', runCredibilityTests],
  ['validate-quality-gate', runValidateTests],
  ['product-search', runProductSearchTests],
  ['reviews-render', runReviewsRenderTests], // async suite (awaited below)
  ['utils', runUtilsTests],
  ['affiliate-links', runAffiliateLinksTests],
  ['lib-pure', runLibPureTests],
  ['credibility-extra', runCredibilityExtraTests],
  ['prompts', runPromptsTests],
  ['llm', runLlmTests],
  ['asin-resolver', runAsinResolverTests],
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
