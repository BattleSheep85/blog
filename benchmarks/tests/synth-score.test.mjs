#!/usr/bin/env node
// synth-score.test.mjs — zero-dep assert-based unit test for the deterministic
// grounding scorer (benchmarks/lib/synth-score.mjs). Run directly:
//   node benchmarks/tests/synth-score.test.mjs
//
// Verifies the audit-list fields (num_ung_list / name_ung_list /
// name_ung_strict_list) added for the honesty gate correctly identify WHICH
// numbers/names were flagged, not just how many.

import { score } from '../lib/synth-score.mjs';

const report = { passed: 0, failed: 0, failures: [] };
const eq = (name, actual, expected) => {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) report.passed++;
  else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ── FIXTURE ────────────────────────────────────────────────────────────────
// Corpus with known source numbers: 7100, 990, 2280 (present verbatim,
// no comma grouping, so the plain nums() path applies cleanly).
const corpus = {
  sources: [
    { title: 'Best NVMe SSDs 2026', content: 'The Samsung 990 Pro hits 7100 MB/s sequential read in an M.2 2280 form factor.' },
  ],
  notes: [],
};

// One product: name grounded, one spec value grounded (7100), one spec value
// ungrounded (9999), and a price not present anywhere in sources.
const groundedReportWithFabrication = {
  products: [
    {
      name: 'Samsung 990 Pro',
      price: 249,
      specs: {
        sequentialRead: '7100 MB/s',
        randomWrite: '9999 IOPS',
      },
    },
  ],
};

const fullyGroundedReport = {
  products: [
    {
      name: 'Samsung 990 Pro',
      price: 990,
      specs: {
        sequentialRead: '7100 MB/s',
        formFactor: '2280',
      },
    },
  ],
};

// ── ASSERTIONS: fabricated numbers are counted AND individually listed ─────
const s1 = score(groundedReportWithFabrication, corpus);

eq('num_ung counts exactly 2 (price + bad spec)', s1.num_ung, 2);
ok('num_ung_list has exactly 2 entries', s1.num_ung_list.length === 2);
ok('num_ung_list flags the 9999 spec value',
  s1.num_ung_list.some((e) => e.product === 'Samsung 990 Pro' && e.field === 'randomWrite' && e.number === 9999));
ok('num_ung_list flags the ungrounded price',
  s1.num_ung_list.some((e) => e.product === 'Samsung 990 Pro' && e.field === 'price' && e.number === 249));
ok('num_ung_list does NOT flag the grounded 7100 spec',
  !s1.num_ung_list.some((e) => e.number === 7100));

// ── ASSERTIONS: fully-grounded report yields empty audit lists ─────────────
const s2 = score(fullyGroundedReport, corpus);

eq('fully grounded num_ung === 0', s2.num_ung, 0);
eq('fully grounded num_ung_list === []', s2.num_ung_list, []);
eq('fully grounded name_ung === 0', s2.name_ung, 0);
eq('fully grounded name_ung_list === []', s2.name_ung_list, []);

// ── ASSERTIONS: name_ung_strict_list backward-compat exposure ──────────────
const unrelatedNameReport = {
  products: [{ name: 'Totally Unrelated Widget XJ9', price: 990, specs: {} }],
};
const s3 = score(unrelatedNameReport, corpus);
ok('name_ung_strict flags an unrelated product name', s3.name_ung_strict === 1);
eq('name_ung_strict_list contains the flagged name', s3.name_ung_strict_list, ['Totally Unrelated Widget XJ9']);

// ── ASSERTIONS: comma-grouped source numbers must not false-positive ───────
// Regression for the norm()-strips-commas bug: "6,650" in raw source content
// used to get mangled to "6 650" before nums() ran, so a spec value of
// "6650 MB/s" (which parses correctly) never matched and was falsely flagged.
const commaCorpus = {
  sources: [
    { title: 'SSD Bench', content: 'Sequential read 6,650 MB/s on the Crucial T700.' },
  ],
  notes: [],
};
const commaReport = {
  products: [
    {
      name: 'Crucial T700',
      specs: {
        sequentialRead: '6650 MB/s',   // grounded via comma-grouped source number
        randomWrite: '123456 IOPS',    // genuinely ungrounded — must still be flagged
      },
    },
  ],
};
const s4 = score(commaReport, commaCorpus);
eq('comma-grouped 6650 is NOT flagged (false positive fixed)',
  s4.num_ung_list.filter((e) => e.number === 6650).length, 0);
ok('genuinely ungrounded 123456 IS still flagged',
  s4.num_ung_list.some((e) => e.number === 123456));
eq('comma fixture num_ung === 1 (only the genuine fabrication)', s4.num_ung, 1);

// ── REPORT ───────────────────────────────────────────────────────────────
console.log(`synth-score: ${report.passed}/${report.passed + report.failed} passed`);
if (report.failed > 0) {
  for (const f of report.failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log('All assertions green');
