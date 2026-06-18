// node:test harness so Node's built-in V8 coverage (zero npm) can measure the
// pure test suites. Run:
//   node --test --experimental-test-coverage \
//     --test-coverage-include='worker/lib/**' --test-coverage-include='worker/engine/**' \
//     scripts/coverage.test.mjs
// Each suite is a hand-rolled runner returning {passed, failed, failures}; we
// just assert zero failures so coverage reflects what the suites exercise.
import test from 'node:test';
import assert from 'node:assert';

import { runCredibilityTests } from '../worker/lib/credibility.test.js';
import { runValidateTests } from '../worker/engine/validate.test.js';
import { runProductSearchTests } from '../worker/lib/product-search.test.js';
import { runReviewsRenderTests } from '../worker/pages/reviews.test.js';
import { runCredibilityExtraTests } from '../worker/lib/credibility-extra.test.js';
import { runPromptsTests } from '../worker/engine/prompts.test.js';
import { runLlmTests } from '../worker/engine/llm.test.js';
import { runUtilsTests } from '../worker/lib/utils.test.js';
import { runAffiliateLinksTests } from '../worker/lib/affiliate-links.test.js';
import { runLibPureTests } from '../worker/lib/lib-pure.test.js';

const suites = [
  ['credibility', runCredibilityTests],
  ['validate-quality-gate', runValidateTests],
  ['product-search', runProductSearchTests],
  ['reviews-render', runReviewsRenderTests],
  ['utils', runUtilsTests],
  ['affiliate-links', runAffiliateLinksTests],
  ['lib-pure', runLibPureTests],
  ['credibility-extra', runCredibilityExtraTests],
  ['prompts', runPromptsTests],
  ['llm', runLlmTests],
];

for (const [name, fn] of suites) {
  test(name, async () => {
    const report = await fn();
    assert.strictEqual(report.failed, 0, `${name}: ${report.failures.join('; ')}`);
  });
}
