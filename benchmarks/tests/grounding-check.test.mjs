#!/usr/bin/env node
// grounding-check.test.mjs — the deliverable of the 2026-07-28 benchmark
// validity fix. Zero-dep assert style, same as synth-score.test.mjs.
//
//   node benchmarks/tests/grounding-check.test.mjs
//   (also registered in scripts/run-tests.mjs + scripts/coverage.test.mjs)
//
// Every assertion below comes from a REAL audited case. The three named
// "audit regression" blocks reproduce the three false fabrication verdicts that
// fooled every previous checking layer: the Seasonic TX-850, the 12-year
// warranty figure, and the Epson ET-3950. Their fixture holds verbatim source
// records copied out of the real 9.6 MB corpus, so the checker is measured
// against the exact text that produced the errors.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildHaystacks, checkProductName, checkNumbers, extractCitations, checkCitations,
  groundingCheck, buildEvidenceTable, collectProse,
} from '../lib/grounding-check.mjs';
import { score } from '../lib/synth-score.mjs';

const FIXTURE_PATH = new URL('./fixtures/audit-regression-corpus.json', import.meta.url);
const FULL_CORPUS_PATH = new URL('../results/google-top50-corpus.json', import.meta.url);

const src = (title, content, extra = {}) => ({ title, content, url: 'https://example.com/a', ...extra });

export function runGroundingCheckTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, actual, expected) => {
    const A = JSON.stringify(actual); const E = JSON.stringify(expected);
    if (A === E) report.passed++;
    else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, cond) => eq(name, !!cond, true);

  assertion1FabricatedProductIsCaught(ok, eq);
  assertion2OddFormatsAreNotFlagged(ok);
  assertion3ShortSkuIsChecked(ok);
  assertion4And5And6Citations(ok, eq);
  assertion7NumericLeniencyIsPinned(ok, eq);
  assertion8CombinationLimitation(ok);
  assertion9WeightMath(eq);
  assertionCitationFalsePositiveGuards(ok, eq);
  assertionNumbersMatchSynthScore(eq);
  assertionEvidenceTable(ok, eq);
  auditRegressions(ok, eq);
  fullCorpusIntegration(ok);

  return report;
}

// 1. A genuinely fabricated product IS caught. ────────────────────────────────
function assertion1FabricatedProductIsCaught(ok, eq) {
  const hay = buildHaystacks({
    sources: [src('The Best Printers We have Tested for 2026', 'Best All-in-One Printer for Home Offices: Epson EcoTank ET-3950 $399.99 at Amazon.')],
    notes: [],
  });
  const real = checkProductName('Epson EcoTank ET-3950', hay);
  const fake = checkProductName('Epson EcoTank ET-9999', hay);
  ok('1a real ET-3950 is grounded', real.grounded === true);
  ok('1b fabricated ET-9999 is NOT grounded', fake.grounded === false);
  const bad = fake.tokens.find((t) => t.tok === '9999');
  eq('1c the invented model number is digit-bearing and absent', bad && { digitBearing: bad.digitBearing, present: bad.present }, { digitBearing: true, present: false });
  ok('1d the flag carries auditable token detail', fake.tokens.length >= 3 && fake.tokens.some((t) => t.tok === 'epson' && t.present));
  ok('1e brand tokens are annotated for human audit', fake.tokens.some((t) => t.tok === 'epson' && t.isBrand === true));
}

// 2. A real product written in an odd format is NOT falsely flagged. ──────────
function assertion2OddFormatsAreNotFlagged(ok) {
  const dyson = buildHaystacks({
    sources: [src('Best Vacuums For Pet Hair', "The Dyson V15 Detect is the best vacuum cleaner for pet hair we've tested.")],
    notes: [],
  });
  ok('2a "Dyson V15Detect Cordless" is grounded via the no-space haystack',
    checkProductName('Dyson V15Detect Cordless', dyson).grounded === true);
  const lg = buildHaystacks({ sources: [src('Best Over-the-Range Microwaves', 'RTINGS picks the LG MVEM1825F as its top over-the-range model.')], notes: [] });
  ok('2b "LG MVEM-1825-F" is grounded against a joined corpus spelling',
    checkProductName('LG MVEM-1825-F', lg).grounded === true);
  const joined = buildHaystacks({ sources: [src('Soundbar shootout', 'The Samsung HWQ990D leads our 2026 list.')], notes: [] });
  ok('2c "Samsung HW-Q990D" is grounded when the corpus joins the SKU',
    checkProductName('Samsung HW-Q990D', joined).grounded === true);
}

// 3. Short SKU tokens are no longer skipped (issues.md 2026-07-24 gap). ───────
function assertion3ShortSkuIsChecked(ok) {
  const without = buildHaystacks({ sources: [src('Cordless tools', 'The Ryobi One+ HP drill is a solid pick for home use.')], notes: [] });
  const with_ = buildHaystacks({ sources: [src('Cordless tools', 'The Ryobi V3 stick vacuum is a solid pick for home use.')], notes: [] });
  ok('3a "Ryobi V3" IS flagged when v3 is absent (regression: <3-char SKUs used to skip)',
    checkProductName('Ryobi V3', without).grounded === false);
  ok('3b the v3 token is actually being checked',
    checkProductName('Ryobi V3', without).tokens.some((t) => t.tok === 'v3' && t.digitBearing));
  ok('3c "Ryobi V3" is grounded when v3 IS present',
    checkProductName('Ryobi V3', with_).grounded === true);
}

// 4/5/6. Citation verified, fabricated outlet caught, date mismatch is soft. ──
function assertion4And5And6Citations(ok, eq) {
  const corpus = {
    sources: [
      { url: 'https://www.rtings.com/vacuum/reviews/best/pet-hair', title: 'The 5 Best Vacuums For Pet Hair of 2026 - RTINGS.com', content: 'The Dyson V15 Detect is the best vacuum cleaner for pet hair.', publishedAt: Date.parse('2026-05-14T00:00:00Z') / 1000 },
    ],
    notes: [],
  };
  const hay = buildHaystacks(corpus);
  const cite = (text) => checkCitations(extractCitations([{ field: 'verdict', text }], hay), hay);

  const verified = cite('Hands-on testing by RTINGS (May 14 2026) puts it first.');
  eq('4 real outlet + matching date is verified', verified.map((c) => [c.outlet, c.dateISO, c.status]), [['rtings', '2026-05-14', 'verified']]);

  const missing = cite('It wins per SoundLab Weekly (Feb 2 2026), a dedicated audio lab.');
  ok('5a a wholly invented outlet is caught', missing.some((c) => c.outlet === 'soundlabweekly' && c.status === 'outlet-missing'));
  ok('5b the invented citation is recorded in citation position', missing.some((c) => c.outlet === 'soundlabweekly' && c.citationPosition === true));

  const mismatch = cite('Hands-on testing by RTINGS (January 3 2026) puts it first.');
  eq('6a a real outlet with a wrong date is a SOFT date-mismatch, not a fabrication',
    mismatch.map((c) => c.status), ['date-mismatch']);

  const half = groundingCheck({ products: [{ name: 'Dyson V15 Detect', verdict: 'Tested by RTINGS (January 3 2026).' }] }, corpus);
  eq('6b date-mismatch counts at half weight in G_det', half.weights, { grounded: 4, total: 5 });

  const bare = cite('The Dyson has better suction than the RTINGS-favourite alternatives listed here.');
  eq('6c a bare prose mention with no cue and no date is not scored', bare.filter((c) => c.citationPosition || c.dateISO).length, 0);
}

// 7. Known numeric leniency is PINNED, not "fixed". ───────────────────────────
function assertion7NumericLeniencyIsPinned(ok, eq) {
  // A bare "80" exists somewhere in every large corpus, so "80% cheaper ink"
  // passes the existence check. Whether the evidence SUPPORTS the figure is a
  // contextual question and is the LLM judge's job, not this checker's. Do not
  // "fix" this: tightening it turns the checker into a false-positive generator,
  // which is the exact failure this whole module exists to end.
  const hay = buildHaystacks({ sources: [src('Printer buying guide', 'The tank holds 80 ml of ink and prints 7500 pages.')], notes: [] });
  const res = checkNumbers({ name: 'Epson EcoTank ET-3950', specs: { inkSaving: '80% cheaper ink' } }, hay);
  eq('7a the bare-number leniency is pinned (no flag for "80% cheaper ink")', res.ungrounded, []);
  ok('7b the number was genuinely examined, not skipped', res.checked === 1);
}

// 8. Combination false-negative is documented, not silently unknown. ──────────
function assertion8CombinationLimitation(ok) {
  // ACCEPTED LIMITATION: the checker proves each TOKEN exists, never that the
  // COMBINATION exists. An invented name built only from real words with no new
  // digits passes. An invented MODEL NUMBER does not (see assertion 1).
  const hay = buildHaystacks({ sources: [src('Vacuum roundup', 'The Samsung Bespoke Jet and the Bespoke AI Jet Ultra lead our list.')], notes: [] });
  ok('8 invented "Samsung Bespoke UltraJet" passes (documented residual)',
    checkProductName('Samsung Bespoke UltraJet', hay).grounded === true);
}

// 9. G_det weight math matches a hand-computed value. ─────────────────────────
function assertion9WeightMath(eq) {
  const corpus = {
    sources: [
      { url: 'https://www.rtings.com/soundbar/reviews/best', title: 'Best Soundbars - RTINGS.com', content: 'The Samsung HW-Q990D costs 1699 dollars and has 11.1.4 channels.', publishedAt: Date.parse('2026-05-14T00:00:00Z') / 1000 },
    ],
    notes: [],
  };
  const rep = {
    products: [
      { name: 'Samsung HW-Q990D', price: 1699, specs: { channels: '11.1.4' }, verdict: 'Measured by RTINGS (May 14 2026).' },
      { name: 'Samsung HW-Z000X', price: 42424, specs: {}, verdict: 'Rated highest per SoundLab Weekly (Feb 2 2026).' },
    ],
  };
  // Hand computed.
  //   Products: 2 x 3 = 6 total. First grounded (+3). Second has an absent
  //     digit-bearing token "z000x", so it scores 0.
  //   Citations: 2 x 2 = 4 total. RTINGS verified (+2), SoundLab Weekly
  //     outlet-missing (+0).
  //   Numbers: 4 checked at weight 1. nums("11.1.4") yields TWO numbers, 11.1
  //     and 4 (the shared nums() regex takes at most one decimal group), so the
  //     first product contributes price 1699 + 11.1 + 4, all present in the
  //     source. The second contributes price 42424, absent. Grounded +3.
  //   Grounded 3 + 2 + 3 = 8 of total 6 + 4 + 4 = 14 -> gDet = 10 * 8/14 = 5.71.
  const g = groundingCheck(rep, corpus);
  eq('9a weights are 8 grounded of 14 total', g.weights, { grounded: 8, total: 14 });
  eq('9b gDet is 10 * 8/14 = 5.71', g.gDet, 5.71);
  eq('9c exactly one fabricated product is listed', g.fabricatedProducts.map((p) => p.name), ['Samsung HW-Z000X']);
  eq('9d exactly one fabricated citation is listed', g.fabricatedCitations.map((c) => c.outlet), ['soundlabweekly']);
  eq('9e exactly one ungrounded number is listed', g.ungroundedNumbers.map((n) => n.number), [42424]);
  eq('9f gDet is null when a report has nothing checkable', groundingCheck({ products: [] }, corpus).gDet, null);
}

// Citation false-positive guards. Every case below was a REAL false positive on
// the first deterministic re-score of the 64 stored reports, 2026-07-28. Each is
// pinned here so the checker can never regress into flagging real things again.
function assertionCitationFalsePositiveGuards(ok, eq) {
  const corpus = {
    sources: [
      { url: 'https://www.rtings.com/soundbar/best', title: 'The Best Soundbars - 2026', content: 'Dolby Atmos systems with MagSafe and USB-C PD accessories. Tested Jun 1 2026.', publishedAt: Date.parse('2026-06-01T00:00:00Z') / 1000 },
      { url: 'https://www.blackboxmycar.com/blogs/dash-cam-heat', title: 'Dash cam heat guide', content: 'Summer heat is the ultimate stress test for any dash cam.' },
      { url: 'https://www.reddit.com/r/soundbars/comments/x', title: 'What soundbar do you use', content: 'Community favourites thread.' },
    ],
    notes: [],
  };
  const hay = buildHaystacks(corpus);
  const cite = (text) => checkCitations(extractCitations([{ field: 'verdict', text }], hay), hay);

  eq('G1 a technology name after a weak cue is not an outlet ("via MagSafe wireless, USB-C PD")',
    cite('Combined 18W output via MagSafe wireless, USB-C PD, and USB-A.').filter((c) => c.status === 'outlet-missing').length, 0);
  eq('G2 a technology name in the summary is not an outlet ("dominated by Dolby Atmos systems")',
    cite('The 2026 market is dominated by Dolby Atmos systems with wireless subwoofers.').filter((c) => c.status === 'outlet-missing').length, 0);
  eq('G3 a bare year is never an outlet token (33 bogus date-mismatch flags on the first run)',
    [...hay.outlets.keys()].includes('2026'), false);
  eq('G4 a generic page word is never an outlet token', [...hay.outlets.keys()].includes('home'), false);
  eq('G5 an outlet the corpus mentions but the host tokenizer missed is not flagged',
    cite('Summer is the ultimate stress test per BlackboxMyCar hands-on Jun 2 2026.').filter((c) => c.status === 'outlet-missing').length, 0);
  eq('G6 an outlet with only undated sources cannot fail a date check',
    cite('A mid-range favourite per Reddit favorites guide Jun 14 2026.').map((c) => [c.outlet, c.status]), [['reddit', 'verified']]);
  ok('G7 the invented outlet is STILL caught after all of the above',
    cite('It wins per SoundLab Weekly (Feb 2 2026).').some((c) => c.status === 'outlet-missing'));

  // One date belongs to ONE outlet. Reading the first date in a shared window
  // gave all three outlets below the same date and invented two mismatches.
  const shared = checkCitations(extractCitations([{ field: 'summary', text: 'Picked by both RTINGS [Jun 1, 2026] and Reddit [Jun 12, 2026], plus BlackboxMyCar coverage.' }], hay), hay);
  eq('G8 each date goes to its nearest outlet, not to every outlet in the window',
    shared.map((c) => [c.outlet, c.dateISO]),
    [['rtings', '2026-06-01'], ['reddit', '2026-06-12'], ['blackboxmycar', null]]);
  const brandSite = { sources: [{ url: 'https://www.viofo.com/blogs/best-dash-cams-2026', title: 'The best dash cams of 2026', content: 'Parking mode and 360-degree recording explained.', publishedAt: Date.parse('2026-06-11T00:00:00Z') / 1000 }], notes: [] };
  eq('G10 a manufacturer word that names a product in THIS report is not a citation',
    groundingCheck({ products: [{ name: 'Viofo A329', verdict: 'Good for 360-degree recording and parking mode with Viofo A329, updated Jun 11 2026.' }] }, brandSite).fabricatedCitations.length, 0);

  eq('G9 a date written before the outlet still binds to it',
    checkCitations(extractCitations([{ field: 'products[0].metadata.sourceDate', text: '2026-06-01 RTINGS' }], hay), hay).map((c) => [c.outlet, c.dateISO, c.status]),
    [['rtings', '2026-06-01', 'verified']]);
}

// Semantics pin: the number check must never fork from synth-score.mjs. ───────
function assertionNumbersMatchSynthScore(eq) {
  const corpus = { sources: [src('SSD Bench', 'Sequential read 6,650 MB/s on the Crucial T700, 990 Pro hits 7100 MB/s.')], notes: [] };
  const rep = { products: [{ name: 'Crucial T700', price: 249, specs: { read: '6650 MB/s', write: '123456 IOPS' } }, { name: 'Samsung 990 Pro', specs: { read: '7100 MB/s' } }] };
  const hay = buildHaystacks(corpus);
  const mine = rep.products.reduce((sum, p) => sum + checkNumbers(p, hay).ungrounded.length, 0);
  eq('N1 checkNumbers total equals synth-score score().num_ung', mine, score(rep, corpus).num_ung);
}

// Evidence table: relevance-selected, deterministic, capped. ──────────────────
function assertionEvidenceTable(ok, eq) {
  const corpus = {
    sources: [
      src('Unrelated laptop roundup', 'The best laptops of 2026 are here.'),
      { url: 'https://www.rtings.com/vacuum/reviews/best/pet-hair', title: 'Best Vacuums For Pet Hair - RTINGS.com', content: 'The Dyson V15 Detect is the best vacuum cleaner for pet hair we have tested.', publishedAt: Date.parse('2026-05-14T00:00:00Z') / 1000, credibility: { tags: ['expert-domain'] } },
    ],
    notes: [],
  };
  const table = buildEvidenceTable({ products: [{ name: 'Dyson V15 Detect' }] }, corpus);
  const rows = table.perProduct['Dyson V15 Detect'];
  eq('E1 only relevant sources are selected', rows.map((r) => r.sourceIdx), [1]);
  ok('E2 the snippet carries the real matched span', rows[0].snippet.includes('V15 Detect'));
  eq('E3 the source date and credibility tag travel with the evidence', [rows[0].date, rows[0].tag], ['2026-05-14', 'expert-domain']);
  eq('E4 a tiny cap reports truncation instead of silently dropping', buildEvidenceTable({ products: [{ name: 'Dyson V15 Detect' }] }, corpus, { capChars: 10 }).truncated, true);
  eq('E5 prose collection keeps field provenance', collectProse({ summary: 's', products: [{ verdict: 'v', pros: ['p'] }] }).map((x) => x.field), ['summary', 'products[0].verdict', 'products[0].pros[0]']);
}

// ── AUDIT REGRESSIONS: the three real false positives ────────────────────────
// Each of these was called a fabrication by a previous checking layer. Each is
// really in the corpus. If any of these ever fails, the checker has regressed to
// the behaviour this whole module was built to end.
function auditRegressions(ok, eq) {
  if (!existsSync(FIXTURE_PATH)) {
    ok('R0 audit regression fixture is present', false);
    return;
  }
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const byQuery = new Map(fixture.corpora.map((c) => [c.query, c]));

  // R1 "Seasonic PRIME TX-850" — the June juror panel called this invented.
  const psu = byQuery.get('best power supply for pc');
  const psuHay = buildHaystacks(psu);
  const tx = checkProductName('Seasonic PRIME TX-850', psuHay);
  ok('R1a REGRESSION: "Seasonic PRIME TX-850" is GROUNDED (June panel called it invented)', tx.grounded === true);
  ok('R1b the TX-850 model number really matched', tx.tokens.filter((t) => t.digitBearing).every((t) => t.present));

  // R2 the "12-year warranty" figure — the same juror record called it invented.
  const warranty = checkNumbers({ name: 'Seasonic PRIME TX-850', specs: { warranty: '12-year' } }, psuHay);
  eq('R2a REGRESSION: the 12-year warranty figure is GROUNDED (June panel called it invented)', warranty.ungrounded, []);
  ok('R2b the corpus really carries the literal phrase, so the panel verdict was false',
    psuHay.rawText.includes('12-year warranty for Seasonic PRIME'));

  // R3 "Epson ET-3950" — the muse-spark rerun's own manual audit called this a
  // "confirmed genuine fabrication, zero mentions anywhere in the corpus".
  const printer = byQuery.get('best printer for home');
  const printerHay = buildHaystacks(printer);
  ok('R3a REGRESSION: "Epson EcoTank ET-3950" is GROUNDED (rerun audit called it fabricated)',
    checkProductName('Epson EcoTank ET-3950', printerHay).grounded === true);
  ok('R3b the shorter written form "Epson ET-3950" is also GROUNDED',
    checkProductName('Epson ET-3950', printerHay).grounded === true);

  // R4 the Dyson V15 Detect + its RTINGS citation, from the real vacuum corpus.
  const vac = byQuery.get('best vacuum for pet hair');
  const vacHay = buildHaystacks(vac);
  ok('R4a "Dyson V15 Detect" is grounded in the real vacuum corpus',
    checkProductName('Dyson V15 Detect', vacHay).grounded === true);
  const cited = checkCitations(extractCitations([{ field: 'verdict', text: 'RTINGS (May 14 2026, expert-domain) calls it the best for pet hair.' }], vacHay), vacHay);
  eq('R4b the real RTINGS May 14 2026 citation verifies against the real corpus',
    cited.map((c) => [c.outlet, c.status]), [['rtings', 'verified']]);
}

// Optional: same three checks against the real 9.6 MB corpus when it is on disk
// (it is gitignored, so this skips cleanly in a fresh clone and in CI).
function fullCorpusIntegration(ok) {
  if (!existsSync(FULL_CORPUS_PATH)) return;
  const corpora = JSON.parse(readFileSync(fileURLToPath(FULL_CORPUS_PATH), 'utf8'));
  const byQuery = new Map(corpora.map((c) => [c.query, c]));
  const check = (query, name) => checkProductName(name, buildHaystacks(byQuery.get(query))).grounded === true;
  ok('F1 full corpus: Epson EcoTank ET-3950 is grounded', check('best printer for home', 'Epson EcoTank ET-3950'));
  ok('F2 full corpus: Seasonic PRIME TX-850 is grounded', check('best power supply for pc', 'Seasonic PRIME TX-850'));
  ok('F3 full corpus: Dyson V15 Detect is grounded', check('best vacuum for pet hair', 'Dyson V15 Detect'));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = runGroundingCheckTests();
  console.log(`grounding-check: ${r.passed}/${r.passed + r.failed} passed`);
  if (r.failed > 0) {
    for (const f of r.failures) console.log(`  FAIL ${f}`);
    process.exit(1);
  }
  console.log('All assertions green');
}
