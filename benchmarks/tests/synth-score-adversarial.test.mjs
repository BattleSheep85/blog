#!/usr/bin/env node
// synth-score-adversarial.test.mjs — adversarial edge-case suite for the
// deterministic grounding scorer (benchmarks/lib/synth-score.mjs). Guards
// against the false-positive/false-negative bug classes that already cost a
// no-go cycle (see issues.md / MEMORY). Zero-dep, no paid API. Run directly:
//   node benchmarks/tests/synth-score-adversarial.test.mjs

import { score, nums, close, norm } from '../lib/synth-score.mjs';

const report = { passed: 0, failed: 0, failures: [] };
const eq = (name, actual, expected) => {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) report.passed++;
  else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 1: name_ung_strict over-flags reworded-but-legit names
// (contiguous-substring match). It was replaced by name_ung (token-presence)
// as the actual gate signal. This fixture proves the CURRENT gate signal
// (name_ung) survives rewording that the old strict signal would choke on,
// and documents that name_ung_strict is still computed (diagnostics only).
// ─────────────────────────────────────────────────────────────────────────
const rewordedCorpus = {
  sources: [
    {
      title: 'Flagship ANC Headphones Review',
      content:
        "Sony's WH-1000XM5 headphones remain a top pick this year. Testers often just call it the XM5 for short.",
    },
  ],
  notes: [],
};
const rewordedReport = {
  products: [{ name: 'Sony WH-1000XM5', price: 349, specs: {} }],
};
const sReworded = score(rewordedReport, rewordedCorpus);
ok('reworded name: token-presence gate (name_ung) does NOT flag it', sReworded.name_ung === 0);
eq('reworded name: name_ung_list is empty', sReworded.name_ung_list, []);
// The old strict (contiguous-substring) signal is a DIFFERENT sentence shape
// than the source ("Sony WH-1000XM5" as one run never appears verbatim —
// source says "Sony's WH-1000XM5"), so it still flags this as ungrounded.
// This is exactly the over-flagging behavior that got it demoted from the
// gate; it is asserted here only to pin down that it's still present.
ok('reworded name: dead strict signal (name_ung_strict) still over-flags it',
  sReworded.name_ung_strict === 1);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 1b: genuinely ungrounded name must still be flagged by the
// real gate (name_ung), not just the dead strict signal.
// ─────────────────────────────────────────────────────────────────────────
const ungroundedNameCorpus = {
  sources: [{ title: 'SSD Roundup', content: 'The Samsung 990 Pro leads the pack at 7100 MB/s.' }],
  notes: [],
};
const ungroundedNameReport = {
  products: [{ name: 'Zorblatt Fusion Quantum X9000', price: 199, specs: {} }],
};
const sUngroundedName = score(ungroundedNameReport, ungroundedNameCorpus);
ok('fabricated product name IS flagged by name_ung', sUngroundedName.name_ung === 1);
eq('fabricated product name appears in name_ung_list',
  sUngroundedName.name_ung_list.map((e) => e.product), ['Zorblatt Fusion Quantum X9000']);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 2: short-SKU names ("V3", "X4") — the token-presence check
// filters tokens <3 chars. norm('V3') === 'v3' (length 2), so `toks` ends up
// EMPTY and the `if (toks.length >= 1)` guard means the name-grounding check
// never runs at all for these products — not "passes", but SILENTLY SKIPS.
//
// FOLLOW-UP (not fixed here — separate scoped change): this is a real
// false-negative gap. A fabricated short-SKU name (e.g. a hallucinated
// "V3" variant that never appears in any source) would sail through with
// zero name_ung signal. Confirmed via direct inspection:
//   norm('V3') -> 'v3'; 'v3'.split(' ').filter(w => w.length >= 3) -> []
// ─────────────────────────────────────────────────────────────────────────
eq('DOCUMENTED GAP: norm("V3") token list is empty (length-2 token filtered out)',
  norm('V3').split(' ').filter((w) => w.length >= 3), []);

const shortSkuCorpus = {
  sources: [{ title: 'Widget Line Review', content: 'The V2 model was solid but underpowered.' }],
  notes: [],
};
const shortSkuReport = {
  // "V3" never appears anywhere in the corpus (only "V2" does) — a genuine
  // fabrication. If the check worked, this should be flagged. It is NOT,
  // because toks is empty and the whole name check is skipped.
  products: [{ name: 'V3', price: 99, specs: {} }],
};
const sShortSku = score(shortSkuReport, shortSkuCorpus);
eq('DOCUMENTED GAP: fabricated short-SKU name "V3" is NOT flagged (false-negative, toks empty, check skipped)',
  sShortSku.name_ung, 0);
eq('DOCUMENTED GAP: name_ung_list stays empty for the fabricated short-SKU name',
  sShortSku.name_ung_list, []);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 3: comma-grouped source numbers must not false-positive.
// Regression for the norm()-strips-commas bug: raw source content "6,650"
// must be parsed via srcRaw (nums() on raw text), not the comma-stripped
// norm() text, or "6,650" fractures into "6" and "650" and a grounded
// "6650 MB/s" spec would be wrongly flagged as fabricated.
// ─────────────────────────────────────────────────────────────────────────
const commaCorpus = {
  sources: [{ title: 'Bandwidth Test', content: 'Sustained throughput hit 6,650 MB/s in our lab run.' }],
  notes: [],
};
const commaReport = {
  // price omitted (not a number) so only the spec-number check under test runs
  products: [{ name: 'Gen5 NVMe Drive', specs: { sequentialRead: '6650 MB/s' } }],
};
const sComma = score(commaReport, commaCorpus);
eq('comma-grouped "6,650" source grounds a report value of 6650 (no false positive)',
  sComma.num_ung, 0);
eq('comma-grouped fixture num_ung_list is empty', sComma.num_ung_list, []);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 4: near-miss numbers right at the 3% tolerance boundary.
// close(n, s) = n === s || |n - s| <= 0.5 || (s !== 0 && |n - s| / |s| <= 0.03)
// For source 100: |n-100|/100 <= 0.03  =>  n in [97, 103] is "close" via the
// ratio branch (ignoring the flat 0.5 absolute-diff branch, irrelevant here
// since |n-100| > 0.5 for all these cases).
// ─────────────────────────────────────────────────────────────────────────
ok('close(): exactly at the 3% boundary (103 vs 100) is treated as grounded (<=, inclusive)',
  close(103, 100) === true);
ok('close(): symmetric boundary on the low side (97 vs 100) is treated as grounded',
  close(97, 100) === true);
ok('close(): just past the boundary (104 vs 100, 4%) is flagged as ungrounded',
  close(104, 100) === false);
ok('close(): clearly off (110 vs 100, 10%) is flagged as ungrounded',
  close(110, 100) === false);

const boundaryCorpus = {
  sources: [{ title: 'Throughput Report', content: 'Rated write speed is 100 MB/s under sustained load.' }],
  notes: [],
};
const boundaryReportAtEdge = {
  products: [{ name: 'Edge Drive', specs: { writeSpeed: '103 MB/s' } }],
};
const boundaryReportOver = {
  products: [{ name: 'Over Drive', specs: { writeSpeed: '110 MB/s' } }],
};
eq('end-to-end: spec at the 3% boundary (103 vs source 100) is NOT flagged',
  score(boundaryReportAtEdge, boundaryCorpus).num_ung, 0);
eq('end-to-end: spec 10% off (110 vs source 100) IS flagged',
  score(boundaryReportOver, boundaryCorpus).num_ung, 1);

// ─────────────────────────────────────────────────────────────────────────
// BUG CLASS 5: decimal numbers — grounded vs. clearly-fabricated decimals.
// ─────────────────────────────────────────────────────────────────────────
const decimalCorpus = {
  sources: [{ title: 'Battery Bench', content: 'Rundown testing measured 10.5 h of continuous playback.' }],
  notes: [],
};
const decimalGroundedReport = {
  products: [{ name: 'Longlife Buds', specs: { battery: '10.5 h' } }],
};
const decimalFabricatedReport = {
  products: [{ name: 'Longlife Buds', specs: { battery: '12.5 h' } }],
};
eq('decimal 10.5h matching source 10.5h is grounded (num_ung === 0)',
  score(decimalGroundedReport, decimalCorpus).num_ung, 0);
eq('decimal 12.5h with no matching source value is flagged (num_ung === 1)',
  score(decimalFabricatedReport, decimalCorpus).num_ung, 1);
ok('nums() parses "10.5 h" as a single float, not split on the dot',
  JSON.stringify(nums('10.5 h')) === JSON.stringify([10.5]));

// ── REPORT ───────────────────────────────────────────────────────────────
console.log(`synth-score-adversarial: ${report.passed}/${report.passed + report.failed} passed`);
if (report.failed > 0) {
  for (const f of report.failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log('All assertions green');
