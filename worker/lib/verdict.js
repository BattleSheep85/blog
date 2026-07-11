// Deterministic verdict core for product-claims verification. Given a claim
// and a list of evidence (each carrying a `credibility`/`independence` from
// `worker/lib/credibility.js`'s scoreSource()), produces a stable, repeatable
// verdict — same evidence in, identical verdict out. No Date.now(), no
// randomness, no reliance on input array order (every sort is stable and
// tie-broken).
//
// Pure functions, no network, no mutation of inputs.

// A single piece of evidence's stance toward a claim.
export const STANCE = Object.freeze({
  SUPPORT: 'support',
  CONTRADICT: 'contradict',
  NEUTRAL: 'neutral',
});

// Weight thresholds for verdictForClaim's status decision (see below). Tuned
// so a single independent expert hands-on source (cred ~90, indep ~70 →
// weight ~0.63) alone reaches 'verified' territory, while a lone
// manufacturer self-claim (indep ~10) can never clear WEAK_SUPPORT on its own.
export const STRONG_SUPPORT = 1.0;
export const WEAK_SUPPORT = 0.3;
export const CONTRADICT_MIN = 0.5;
export const LOW_CONTRADICT = 0.25;

// overallVerdict() score bands + labels, evaluated highest-first.
const SCORE_BANDS = [
  { min: 80, label: 'Lives up to its claims' },
  { min: 60, label: 'Mostly holds up' },
  { min: 40, label: 'Mixed — verify the specifics' },
  { min: 20, label: 'Falls short of its claims' },
  { min: 0, label: 'Does not live up to its claims' },
];

// Per-status contribution to the overall score (see overallVerdict).
const STATUS_VALUE = Object.freeze({
  verified: 1.0,
  'partially-verified': 0.5,
  unsubstantiated: 0.2,
  contradicted: 0.0,
});

// Per-claim-type weight multiplier for overallVerdict's weighted mean. Spec
// and warranty claims are the most consequential to get wrong (a false spec
// or warranty claim is a hard factual failure); marketing claims are largely
// subjective puffery and count for less; support claims (policies, response
// times, etc.) count at the baseline.
const CLAIM_TYPE_WEIGHT = Object.freeze({
  spec: 1.5,
  warranty: 1.5,
  marketing: 0.75,
  support: 1.0,
});
const DEFAULT_CLAIM_TYPE_WEIGHT = 1.0;

function round2(x) {
  return Math.round(x * 100) / 100;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/** Clamps a number to [0, 1]; NaN/undefined/non-finite → 0. */
export function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Combined weight in [0,1] of a single piece of evidence: how much it should
 * count as corroboration (or contradiction). Missing/NaN credibility or
 * independence is treated as 0. This is why manufacturer/marketing
 * self-claims (independence ~10) barely count, while an independent expert
 * hands-on source (credibility ~90, independence ~70) counts strongly.
 */
export function evidenceWeight(ev) {
  const cred = clamp01((ev && ev.credibility) / 100);
  const indep = clamp01((ev && ev.independence) / 100);
  return cred * indep;
}

function byWeightDescUrlAsc(a, b) {
  if (b._weight !== a._weight) return b._weight - a._weight;
  const ua = a.url || '';
  const ub = b.url || '';
  if (ua < ub) return -1;
  if (ua > ub) return 1;
  return 0;
}

function sortedSide(items) {
  return items
    .map((ev) => ({ ...ev, _weight: evidenceWeight(ev) }))
    .sort(byWeightDescUrlAsc)
    .map(({ _weight, ...rest }) => ({ ...rest, weight: round3(_weight) }));
}

/**
 * Deterministic verdict for a single claim given its evidence list. Same
 * input always produces an identical (deep-equal) output, including array
 * order — no Date.now(), no randomness.
 *
 * Returns { status, confidence, support, contradict, supporting, contradicting }.
 */
export function verdictForClaim(claim, evidence) {
  const list = Array.isArray(evidence) ? evidence : [];

  const supportItems = list.filter((ev) => ev && ev.stance === STANCE.SUPPORT);
  const contradictItems = list.filter((ev) => ev && ev.stance === STANCE.CONTRADICT);

  const support = supportItems.reduce((sum, ev) => sum + evidenceWeight(ev), 0);
  const contradict = contradictItems.reduce((sum, ev) => sum + evidenceWeight(ev), 0);

  let status;
  if (contradict >= CONTRADICT_MIN && contradict > support) {
    status = 'contradicted';
  } else if (support >= STRONG_SUPPORT && contradict < LOW_CONTRADICT) {
    status = 'verified';
  } else if (support >= WEAK_SUPPORT) {
    status = 'partially-verified';
  } else {
    status = 'unsubstantiated';
  }

  // Confidence = winning-side strength × separation between the two sides.
  // Both factors are pure functions of support/contradict, so this is
  // deterministic and monotonic in the winning margin.
  const winner = Math.max(support, contradict);
  const total = support + contradict;
  const separation = total > 0 ? Math.abs(support - contradict) / Math.max(0.001, total) : 0;
  const confidence = round2(Math.min(1, winner) * separation);

  return {
    status,
    confidence,
    support: round3(support),
    contradict: round3(contradict),
    supporting: sortedSide(supportItems),
    contradicting: sortedSide(contradictItems),
  };
}

function scoreBandLabel(score) {
  for (const band of SCORE_BANDS) {
    if (score >= band.min) return band.label;
  }
  return SCORE_BANDS[SCORE_BANDS.length - 1].label;
}

/**
 * Aggregates a set of per-claim verdicts (as produced by verdictForClaim,
 * each additionally carrying a `claimType`) into an overall score/label.
 *
 * Each verdict status maps to a value (verified=1.0, partially-verified=0.5,
 * unsubstantiated=0.2, contradicted=0.0), weighted by claim type (spec and
 * warranty claims count 1.5x — factual failures there are the most
 * consequential; marketing counts 0.75x — largely subjective puffery;
 * support counts 1.0x baseline; unknown types default to 1.0x). score is
 * round(100 * weightedMean). Empty input → { score: 0, label: 'Insufficient
 * evidence' }.
 */
export function overallVerdict(claimVerdicts) {
  const list = Array.isArray(claimVerdicts) ? claimVerdicts : [];
  if (list.length === 0) {
    return { score: 0, label: 'Insufficient evidence' };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  for (const cv of list) {
    const value = STATUS_VALUE[cv && cv.status] ?? 0;
    const weight = CLAIM_TYPE_WEIGHT[cv && cv.claimType] ?? DEFAULT_CLAIM_TYPE_WEIGHT;
    weightedSum += value * weight;
    weightTotal += weight;
  }

  const mean = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const score = Math.round(100 * mean);
  return { score, label: scoreBandLabel(score) };
}
