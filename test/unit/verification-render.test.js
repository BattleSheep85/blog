// Render smoke test for the /verify/:slug Truth Audit report (worker/pages/
// verify-page.js's renderCompleteReport). Mirrors test/unit/reviews.test.js's
// approach: drive the real render with a mock env.DB and assert on the
// produced HTML string, rather than re-testing the pure verdict core (that's
// covered by test/unit/verdict.test.js). Catches render-time throws and
// verifies the ledger's verdict labels, independence chips, methodology
// block, XSS escaping, and the non-https link gate.

import { renderVerifyResultPage, renderAlternatives } from '../../worker/pages/verify-page.js';

const RESULT_FIXTURE = {
  product: 'Acme Noise-Canceling Headphones',
  productUrl: 'https://acme.example.com/product/nc-headphones',
  subjectClaimSources: ['https://acme.example.com/product/nc-headphones'],
  overall: { score: 62, label: 'Mostly holds up' },
  evidenceCount: 9,
  costUsd: 0.42,
  claims: [
    {
      id: 'c1',
      text: 'Battery lasts up to 40 hours with ANC on <script>alert(1)</script>',
      type: 'spec',
      claimType: 'spec',
      status: 'verified',
      confidence: 0.82,
      support: 1.4,
      contradict: 0,
      independentCount: 2,
      supporting: [
        {
          url: 'https://rtings.com/headphones/reviews/acme-nc',
          stance: 'support',
          credibility: 92,
          independence: 80,
          span: 'We measured 41.5 hours of continuous playback with ANC enabled in our lab test.',
          tags: ['hands-on', 'expert-domain'],
        },
        {
          url: 'https://soundguys.com/acme-nc-review',
          stance: 'support',
          credibility: 85,
          independence: 70,
          span: 'In our testing the battery held up for just over 40 hours.',
          tags: ['hands-on'],
        },
      ],
      contradicting: [],
    },
    {
      id: 'c2',
      text: 'Industry-leading noise cancellation',
      type: 'marketing',
      claimType: 'marketing',
      status: 'partially-verified',
      confidence: 0.35,
      support: 0.4,
      contradict: 0.1,
      independentCount: 1,
      supporting: [
        {
          url: 'https://acme.example.com/product/nc-headphones',
          stance: 'support',
          credibility: 40,
          independence: 5,
          span: 'Industry-leading noise cancellation.',
          tags: ['manufacturer', 'affiliate-conflict'],
        },
      ],
      contradicting: [
        {
          url: 'https://headphonesty.com/acme-nc',
          stance: 'contradict',
          credibility: 75,
          independence: 60,
          span: 'ANC performance trailed the class leaders in our booth test.',
          tags: ['hands-on'],
        },
      ],
    },
    {
      id: 'c3',
      text: 'Free lifetime firmware updates',
      type: 'support',
      claimType: 'support',
      status: 'unsubstantiated',
      confidence: 0,
      support: 0,
      contradict: 0,
      independentCount: 0,
      supporting: [],
      contradicting: [],
    },
    {
      id: 'c4',
      text: '2-year warranty on all parts',
      type: 'warranty',
      claimType: 'warranty',
      status: 'contradicted',
      confidence: 0.55,
      support: 0,
      contradict: 0.6,
      independentCount: 0,
      supporting: [],
      contradicting: [
        {
          url: 'https://reddit.com/r/headphones/comments/acme_warranty',
          stance: 'contradict',
          credibility: 55,
          independence: 65,
          span: 'Support confirmed my unit only had a 1-year warranty, not 2.',
          tags: ['community'],
        },
        {
          url: 'http://insecure-forum.example/thread/1',
          stance: 'contradict',
          credibility: 30,
          independence: 40,
          span: 'Same experience — only got 1 year of coverage.',
          tags: ['seeded-unit', 'incentivized-review'],
        },
      ],
    },
  ],
};

function mockEnv(resultOverride) {
  const row = {
    id: 'r1',
    slug: 'acme-nc-headphones-abcd1234',
    kind: 'verification',
    status: 'complete',
    query: 'Acme Noise-Canceling Headphones',
    summary: 'Acme Noise-Canceling Headphones: Mostly holds up (62/100).',
    subject_url: 'https://acme.example.com/product/nc-headphones',
    overall_verdict: 'Mostly holds up',
    overall_score: 62,
    result: JSON.stringify(resultOverride ?? RESULT_FIXTURE),
    created_at: 1700000000,
    completed_at: 1700000100,
  };
  return {
    DB: {
      prepare() {
        const stmt = {
          bind() { return stmt; },
          async first() { return row; },
        };
        return stmt;
      },
    },
  };
}

export async function runVerificationRenderTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => { if (cond) report.passed++; else { report.failed++; report.failures.push(name); } };

  let page = null, threw = null;
  try {
    page = await renderVerifyResultPage('acme-nc-headphones-abcd1234', mockEnv());
  } catch (e) {
    threw = e;
  }
  ok('renderVerifyResultPage: no throw', !threw);
  ok('renderVerifyResultPage: returns html + lastModified', !!page && typeof page.html === 'string' && Number.isFinite(page.lastModified));

  const html = page ? page.html : '';

  // Verdict labels for each of the four statuses.
  ok('has Verified label', html.includes('Verified'));
  ok('has Partially verified label', html.includes('Partially verified'));
  ok('has Unsubstantiated label', html.includes('Unsubstantiated'));
  ok('has Contradicted label', html.includes('Contradicted'));

  // Overall verdict header.
  ok('overall label rendered', html.includes('Mostly holds up'));
  ok('overall score rendered', html.includes('62/100'));
  ok('explainer line mentions claim count + evidence count', html.includes('4') && html.includes('9'));

  // Independence/conflict chips.
  ok('affiliate chip rendered', html.includes('>affiliate<'));
  ok('manufacturer chip rendered', html.includes('>manufacturer<'));
  ok('seeded unit chip rendered', html.includes('>seeded unit<'));
  ok('incentivized chip rendered', html.includes('>incentivized<'));

  // Unsubstantiated honest framing.
  ok('unsubstantiated honest framing present', html.includes("No independent source corroborated this"));

  // Methodology block.
  ok('methodology block present', html.includes('How this Truth Audit works'));
  ok('methodology mentions independent corroboration bar', html.includes('at least two independent sources'));

  // XSS escaping of a claim's span/text.
  ok('script tag in claim text is escaped, not executed', !html.includes('<script>alert(1)</script>'));
  ok('escaped script marker present', html.includes('&lt;script&gt;'));

  // Non-https URL must not render as a clickable <a href>.
  ok('non-https evidence URL does not render as <a href>', !html.includes('href="http://insecure-forum.example/thread/1"'));
  ok('non-https evidence host still shown as text', html.includes('insecure-forum.example'));

  // Buy CTA — productUrl is not a recognized retailer host, so no fabricated
  // "Buy on X" button should render for this fixture's manufacturer domain.
  ok('no fabricated buy CTA for unknown retailer host', !html.includes('Buy on Acme'));

  // Full-page render: mockEnv's DB stub has no products table, so
  // findRankingForCategory's real query throws/no-ops — renderAlternatives
  // catches that and falls back to the "Compare the best…" CTA.
  ok('fallback alternatives CTA renders on the full page', html.includes('Compare the best'));
  ok('no leftover TODO placeholder', !html.includes('TODO(2d)'));

  // Healthy score (62/100 in this fixture): alternatives render AFTER the
  // claim ledger, as a lower-pressure "you might also like" nudge.
  const ledgerIdx = html.indexOf('Claim ledger');
  const compareIdx = html.indexOf('Compare the best');
  ok('healthy score: alternatives section appears after the claim ledger', ledgerIdx > -1 && compareIdx > ledgerIdx);

  // Low-score full-page render: alternatives section moves ABOVE the claim
  // ledger with the stronger "falls short" heading.
  const lowScoreFullResult = { ...RESULT_FIXTURE, overall: { score: 28, label: 'Falls short' } };
  let lowScorePage = null, lowScoreThrew = null;
  try {
    lowScorePage = await renderVerifyResultPage('acme-nc-headphones-abcd1234', mockEnv(lowScoreFullResult));
  } catch (e) {
    lowScoreThrew = e;
  }
  ok('low-score full page: no throw', !lowScoreThrew);
  const lowScoreHtml = lowScorePage ? lowScorePage.html : '';
  const lowScoreLedgerIdx = lowScoreHtml.indexOf('Claim ledger');
  const lowScoreFallsShortIdx = lowScoreHtml.indexOf('This one falls short');
  ok('low-score full page: "falls short" heading present', lowScoreFallsShortIdx > -1);
  ok('low-score full page: alternatives section appears BEFORE the claim ledger', lowScoreLedgerIdx > -1 && lowScoreFallsShortIdx > -1 && lowScoreFallsShortIdx < lowScoreLedgerIdx);
  ok('low-score full page: alternatives not duplicated at the bottom', lowScoreHtml.indexOf('This one falls short', lowScoreFallsShortIdx + 1) === -1);

  // Buy CTA renders for a recognized retailer host (Amazon).
  let amazonPage = null, amazonThrew = null;
  const amazonResult = { ...RESULT_FIXTURE, productUrl: 'https://www.amazon.com/dp/B0TESTXYZ' };
  try {
    amazonPage = await renderVerifyResultPage('acme-nc-headphones-abcd1234', mockEnv(amazonResult));
  } catch (e) {
    amazonThrew = e;
  }
  ok('amazon buy CTA render: no throw', !amazonThrew);
  ok('amazon buy CTA rendered', !!amazonPage && amazonPage.html.includes('Buy on Amazon'));

  // --- renderAlternatives: dependency-injected findRankingForCategory, no DB ---

  const baseRow = { query: 'Acme Noise-Canceling Headphones', category: 'noise-canceling headphones', topical_category: '' };
  const highScoreResult = { category: 'noise-canceling headphones', overall: { score: 78 } };
  const lowScoreResult = { category: 'noise-canceling headphones', overall: { score: 32 } };

  const rankingProducts = [
    {
      id: 'p1',
      name: 'Sony WH-1000XM6',
      rating: 4.7,
      best_for: 'Best overall noise cancellation',
      image_url: 'https://images.example.com/sony.jpg',
      affiliate_url: 'https://www.amazon.com/dp/B0SONYXM6',
    },
    {
      id: 'p2',
      name: 'Bose QuietComfort Ultra',
      rating: 4.5,
      best_for: 'Best comfort for long flights',
      image_url: 'http://insecure.example.com/bose.jpg',
      product_url: 'https://www.bestbuy.com/site/bose-qc-ultra/123.p',
    },
    {
      id: 'p3',
      name: '<script>alert(1)</script>Evil Headphones',
      rating: 3.9,
      best_for: 'Budget pick',
      image_url: '',
      product_url: 'https://not-a-buy-host.example.com/product/1',
    },
  ];

  const fakeFindRankingFound = async () => ({
    research: { slug: 'best-noise-canceling-headphones-2026-xyz12345' },
    products: rankingProducts,
  });
  const fakeFindRankingNotFound = async () => null;

  // (a) found: renders product cards + affiliate CTA + link to full ranking.
  const foundHtml = await renderAlternatives(baseRow, highScoreResult, {}, fakeFindRankingFound);
  ok('found: renders Sony product card', foundHtml.includes('Sony WH-1000XM6'));
  ok('found: renders Bose product card', foundHtml.includes('Bose QuietComfort Ultra'));
  ok('found: renders Amazon affiliate CTA for exact /dp/ URL', foundHtml.includes('Buy on Amazon'));
  ok('found: renders Best Buy affiliate CTA', foundHtml.includes('Buy on Best Buy'));
  ok('found: links to the full ranking page', foundHtml.includes('/research/best-noise-canceling-headphones-2026-xyz12345'));
  ok('found: heading uses the independently-ranked framing at a healthy score', foundHtml.includes('Better-rated alternatives'));

  // (b) fallback: no ranking found -> "Compare the best…" CTA into /research/new.
  const fallbackHtml = await renderAlternatives(baseRow, highScoreResult, {}, fakeFindRankingNotFound);
  ok('fallback: renders Compare the best CTA', fallbackHtml.includes('Compare the best'));
  ok('fallback: links into the ranking flow', fallbackHtml.includes('/research/new?q='));
  ok('fallback: category is url-encoded in the query param', fallbackHtml.includes(encodeURIComponent('best noise-canceling headphones')));

  // (c) low-score emphasis: stronger heading + wrapped in the trust-low emphasis box.
  const lowScoreFoundHtml = await renderAlternatives(baseRow, lowScoreResult, {}, fakeFindRankingFound);
  ok('low-score: uses the "falls short" heading', lowScoreFoundHtml.includes('This one falls short'));
  ok('low-score: wraps section in trust-low emphasis styling', lowScoreFoundHtml.includes('border-trust-low'));

  const lowScoreFallbackHtml = await renderAlternatives(baseRow, lowScoreResult, {}, fakeFindRankingNotFound);
  ok('low-score fallback: uses the "falls short" heading', lowScoreFallbackHtml.includes('This one falls short'));

  // (d) non-https product/image URLs never render as <a href> / <img src>.
  ok('non-https image URL does not render as <img src>', !foundHtml.includes('src="http://insecure.example.com/bose.jpg"'));
  ok('non-https-buy host (not-a-buy-host.example.com) renders no fabricated Buy CTA for that product', !foundHtml.includes('Buy on Not-a-buy-host'));

  // (e) <script> in a product name is escaped, never executed raw.
  ok('script tag in alternative product name is escaped', !foundHtml.includes('<script>alert(1)</script>'));
  ok('escaped script marker present for alternative product name', foundHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

  // No category -> renders nothing (defensive; should not throw).
  let noCategoryHtml = null, noCategoryThrew = null;
  try {
    noCategoryHtml = await renderAlternatives({ query: '', category: '', topical_category: '' }, {}, {}, fakeFindRankingNotFound);
  } catch (e) {
    noCategoryThrew = e;
  }
  ok('no category: does not throw', !noCategoryThrew);
  ok('no category: renders empty string', noCategoryHtml === '');

  // findRanking throwing is caught and degrades to the fallback CTA, not a 500.
  const throwingFindRanking = async () => { throw new Error('D1 unavailable'); };
  let thrownHandledHtml = null, thrownHandledErr = null;
  try {
    thrownHandledHtml = await renderAlternatives(baseRow, highScoreResult, {}, throwingFindRanking);
  } catch (e) {
    thrownHandledErr = e;
  }
  ok('findRanking throwing: no throw propagates', !thrownHandledErr);
  ok('findRanking throwing: falls back to Compare the best CTA', !!thrownHandledHtml && thrownHandledHtml.includes('Compare the best'));

  return report;
}
