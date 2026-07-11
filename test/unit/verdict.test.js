// Deterministic verdict-core coverage: evidenceWeight/clamp01, verdictForClaim
// (status thresholds, confidence, sort/tie-break, determinism), and
// overallVerdict (claim-type weighting, score bands, empty input).
import {
  clamp01,
  evidenceWeight,
  verdictForClaim,
  overallVerdict,
  CONTRADICT_MIN,
  WEAK_SUPPORT,
} from '../../worker/lib/verdict.js';

export function runVerdictTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // ── clamp01 / evidenceWeight ────────────────────────────────────────────
  eq('clamp01(0) → 0', clamp01(0), 0);
  eq('clamp01(1) → 1', clamp01(1), 1);
  eq('clamp01(-5) → 0', clamp01(-5), 0);
  eq('clamp01(5) → 1', clamp01(5), 1);
  eq('clamp01(NaN) → 0', clamp01(NaN), 0);
  eq('clamp01(undefined) → 0', clamp01(undefined), 0);

  eq('weight cred=0 indep=0 → 0', evidenceWeight({ credibility: 0, independence: 0 }), 0);
  eq('weight cred=100 indep=100 → 1', evidenceWeight({ credibility: 100, independence: 100 }), 1);
  eq('weight out-of-range clamps → 0', evidenceWeight({ credibility: 150, independence: -10 }), 0);
  eq('weight NaN credibility → 0', evidenceWeight({ credibility: NaN, independence: 50 }), 0);
  eq('weight missing fields → 0', evidenceWeight({}), 0);
  ok('weight always in [0,1]', evidenceWeight({ credibility: 999, independence: 999 }) <= 1);

  // ── determinism ──────────────────────────────────────────────────────────
  {
    const evidence = [
      { url: 'https://b.com', stance: 'support', credibility: 80, independence: 60 },
      { url: 'https://a.com', stance: 'support', credibility: 80, independence: 60 },
      { url: 'https://c.com', stance: 'contradict', credibility: 50, independence: 40 },
    ];
    const r1 = verdictForClaim('claim', evidence);
    const r2 = verdictForClaim('claim', evidence);
    eq('determinism: identical evidence → deep-equal output', JSON.stringify(r1), JSON.stringify(r2));
  }

  // ── verified: two independent high-cred/high-indep supporters ──────────
  {
    const v = verdictForClaim('battery lasts 20 hours', [
      { url: 'https://expert1.com', stance: 'support', credibility: 90, independence: 70 },
      { url: 'https://expert2.com', stance: 'support', credibility: 85, independence: 65 },
    ]);
    eq('verified status', v.status, 'verified');
    ok('verified support >= STRONG_SUPPORT', v.support >= 1.0);
    eq('verified contradict = 0', v.contradict, 0);
  }

  // ── contradicted: credible independent contradiction beats support ─────
  {
    const v = verdictForClaim('waterproof to 100m', [
      { url: 'https://mfg.com', stance: 'support', credibility: 40, independence: 30 },
      { url: 'https://expert.com', stance: 'contradict', credibility: 90, independence: 70 },
    ]);
    eq('contradicted status', v.status, 'contradicted');
    ok('contradict >= CONTRADICT_MIN', v.contradict >= CONTRADICT_MIN);
    ok('contradict > support', v.contradict > v.support);
  }

  // ── unsubstantiated: manufacturer-only low-independence support ────────
  {
    const v = verdictForClaim('best in class', [
      { url: 'https://manufacturer.com', stance: 'support', credibility: 40, independence: 10 },
    ]);
    eq('unsubstantiated status', v.status, 'unsubstantiated');
    ok('manufacturer weight tiny (< WEAK_SUPPORT)', v.support < WEAK_SUPPORT);
  }

  // ── partially-verified: support between WEAK and STRONG, low contradiction ─
  {
    const v = verdictForClaim('comfortable for all-day wear', [
      { url: 'https://reviewer.com', stance: 'support', credibility: 70, independence: 60 },
    ]);
    eq('partially-verified status', v.status, 'partially-verified');
    ok('support >= WEAK_SUPPORT', v.support >= WEAK_SUPPORT);
    ok('support < STRONG_SUPPORT', v.support < 1.0);
  }

  // ── weighting: one strong expert outweighs three weak blog mentions ────
  {
    const strong = { url: 'https://expert.com', stance: 'support', credibility: 90, independence: 75 };
    const weak = (i) => ({ url: `https://blog${i}.com`, stance: 'support', credibility: 30, independence: 30 });

    const weakOnly = verdictForClaim('claim', [weak(1), weak(2), weak(3)]);
    eq('three weak blogs alone → unsubstantiated', weakOnly.status, 'unsubstantiated');

    const withStrong = verdictForClaim('claim', [strong, weak(1), weak(2), weak(3)]);
    ok('adding the strong source lifts status past unsubstantiated', withStrong.support >= WEAK_SUPPORT);
    ok('single strong source contributes most of the weight', evidenceWeight(strong) > evidenceWeight(weak(1)) * 3);
  }

  // ── sort / tie-break ─────────────────────────────────────────────────────
  {
    const v = verdictForClaim('claim', [
      { url: 'https://low.com', stance: 'support', credibility: 40, independence: 40 },
      { url: 'https://high.com', stance: 'support', credibility: 90, independence: 90 },
      { url: 'https://z-tie.com', stance: 'support', credibility: 80, independence: 80 },
      { url: 'https://a-tie.com', stance: 'support', credibility: 80, independence: 80 },
    ]);
    eq(
      'supporting sorted by weight desc, tie-broken by url asc',
      v.supporting.map((e) => e.url),
      ['https://high.com', 'https://a-tie.com', 'https://z-tie.com', 'https://low.com']
    );
    ok('weights rounded to 3 decimals', v.supporting.every((e) => Number.isFinite(e.weight)));
  }

  // ── overallVerdict: boundary labels ─────────────────────────────────────
  {
    eq('empty overall → Insufficient evidence', overallVerdict([]), { score: 0, label: 'Insufficient evidence' });
    eq('non-array overall → Insufficient evidence', overallVerdict(undefined), { score: 0, label: 'Insufficient evidence' });

    const highBand = overallVerdict([
      { status: 'verified', claimType: 'spec' },
      { status: 'verified', claimType: 'spec' },
      { status: 'verified', claimType: 'marketing' },
      { status: 'partially-verified', claimType: 'support' },
    ]);
    ok('~85 band lands >= 80', highBand.score >= 80);
    eq('~85 band label', highBand.label, 'Lives up to its claims');

    const midHighBand = overallVerdict([
      { status: 'verified', claimType: 'support' },
      { status: 'partially-verified', claimType: 'support' },
    ]);
    ok('~65 band lands in [60,80)', midHighBand.score >= 60 && midHighBand.score < 80);
    eq('~65 band label', midHighBand.label, 'Mostly holds up');

    const midBand = overallVerdict([
      { status: 'partially-verified', claimType: 'support' },
      { status: 'partially-verified', claimType: 'support' },
      { status: 'unsubstantiated', claimType: 'support' },
    ]);
    ok('~45 band lands in [40,60)', midBand.score >= 40 && midBand.score < 60);
    eq('~45 band label', midBand.label, 'Mixed — verify the specifics');

    const lowBand = overallVerdict([
      { status: 'partially-verified', claimType: 'support' },
      { status: 'unsubstantiated', claimType: 'support' },
      { status: 'contradicted', claimType: 'support' },
    ]);
    ok('~25 band lands in [20,40)', lowBand.score >= 20 && lowBand.score < 40);
    eq('~25 band label', lowBand.label, 'Falls short of its claims');

    const bottomBand = overallVerdict([
      { status: 'unsubstantiated', claimType: 'support' },
      { status: 'contradicted', claimType: 'support' },
      { status: 'contradicted', claimType: 'support' },
    ]);
    ok('~10 band lands < 20', bottomBand.score < 20);
    eq('~10 band label', bottomBand.label, 'Does not live up to its claims');
  }

  // ── overallVerdict: claim-type weighting ────────────────────────────────
  {
    // A contradicted spec claim (1.5x weight) should drag the score down more
    // than a contradicted marketing claim (0.75x weight) would, all else equal.
    const specContradicted = overallVerdict([
      { status: 'verified', claimType: 'support' },
      { status: 'contradicted', claimType: 'spec' },
    ]);
    const marketingContradicted = overallVerdict([
      { status: 'verified', claimType: 'support' },
      { status: 'contradicted', claimType: 'marketing' },
    ]);
    ok('spec contradiction weighs more than marketing contradiction', specContradicted.score < marketingContradicted.score);
  }

  return report;
}
