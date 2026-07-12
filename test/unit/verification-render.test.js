// Render smoke test for the /verify/:slug Truth Audit report (worker/pages/
// verify-page.js's renderCompleteReport). Mirrors test/unit/reviews.test.js's
// approach: drive the real render with a mock env.DB and assert on the
// produced HTML string, rather than re-testing the pure verdict core (that's
// covered by test/unit/verdict.test.js). Catches render-time throws and
// verifies the ledger's verdict labels, independence chips, methodology
// block, XSS escaping, and the non-https link gate.

import { renderVerifyResultPage } from '../../worker/pages/verify-page.js';

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

  // Alternatives placeholder left in place for the next task.
  ok('alternatives TODO placeholder present', html.includes('<!-- TODO(2d): alternatives section -->'));

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

  return report;
}
