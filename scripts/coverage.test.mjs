// node:test harness so Node's built-in V8 coverage (zero npm) can measure the
// pure test suites. Run:
//   node --test --experimental-test-coverage \
//     --test-coverage-include='worker/lib/**' --test-coverage-include='worker/engine/**' \
//     scripts/coverage.test.mjs
// Each suite is a hand-rolled runner returning {passed, failed, failures}; we
// just assert zero failures so coverage reflects what the suites exercise.
import test from 'node:test';
import assert from 'node:assert';

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
