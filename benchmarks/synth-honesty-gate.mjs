#!/usr/bin/env node
// synth-honesty-gate.mjs — deterministic, zero-LLM honesty gate for synth reports.
//
// Replaces the (non-committed, non-reproducible) LLM juror panel for the
// fabrication/honesty signal. Reads a bench-synth-v2.mjs-style results dump,
// scores every successful record against its source corpus using the pure
// grounding logic in lib/synth-score.mjs, prints a per-model summary table,
// then lists EVERY flagged item (product/field/value/number) so a human can
// audit each one directly. Exits nonzero if any model has num_ung > 0 or
// name_ung > 0 — same inputs always produce the same output and exit code.
//
// Usage:
//   node benchmarks/synth-honesty-gate.mjs <results.json> [corpus.json]
//
// Defaults corpus.json to benchmarks/results/google-top50-corpus.json (the
// panel corpus used by bench-synth-v2.mjs).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { score } from './lib/synth-score.mjs';

const DEFAULT_CORPUS = new URL('./results/google-top50-corpus.json', import.meta.url).pathname;

const RESULTS_ARG = process.argv[2];
const CORPUS_ARG = process.argv[3] || DEFAULT_CORPUS;

if (!RESULTS_ARG) {
  process.stderr.write('usage: node benchmarks/synth-honesty-gate.mjs <results.json> [corpus.json]\n');
  process.exit(1);
}

// Paths are resolved relative to the current working directory (matching the
// brief's invocation style: `node benchmarks/synth-honesty-gate.mjs
// benchmarks/results/foo.json`), not relative to this script's own location.
const readJson = (pathArg) => JSON.parse(readFileSync(resolve(process.cwd(), pathArg), 'utf8'));

const results = readJson(RESULTS_ARG);
const corpus = readJson(CORPUS_ARG);

// Dump entries carry `query` truncated to 24 chars (bench-synth-v2.mjs /
// synth-anthropic-batch.mjs convention); match back to the full corpus entry
// the same way rescore-synth.mjs does.
const findCorpusEntry = (query) => corpus.find((c) => c.query.slice(0, 24) === query);

// Each record either already carries the audit lists (post step-2 dumps) or
// needs to be re-scored from its stored products_full against the corpus
// (older dumps, e.g. synth-v2-grok45-full.json predates this gate).
function auditRecord(record) {
  if (record.ok !== '✓') return null;
  if (Array.isArray(record.num_ung_list) && Array.isArray(record.name_ung_list)) {
    return {
      name_ung: record.name_ung ?? record.name_ung_list.length,
      num_ung: record.num_ung ?? record.num_ung_list.length,
      name_ung_list: record.name_ung_list,
      num_ung_list: record.num_ung_list,
    };
  }
  const corpusEntry = findCorpusEntry(record.query);
  if (!corpusEntry) {
    process.stderr.write(`WARN: no corpus match for query "${record.query}" (model ${record.model}) — skipped\n`);
    return null;
  }
  const rescored = score({ products: record.products_full || [] }, corpusEntry);
  return {
    name_ung: rescored.name_ung,
    num_ung: rescored.num_ung,
    name_ung_list: rescored.name_ung_list,
    num_ung_list: rescored.num_ung_list,
  };
}

// ── AGGREGATE PER MODEL ──────────────────────────────────────────────────────
const byModel = new Map();

for (const record of results) {
  const audit = auditRecord(record);
  if (!audit) continue;

  const key = record.model;
  const entry = byModel.get(key) ?? { reports: 0, nameUng: 0, numUng: 0, flags: [] };
  const nextEntry = {
    reports: entry.reports + 1,
    nameUng: entry.nameUng + audit.name_ung,
    numUng: entry.numUng + audit.num_ung,
    flags: [
      ...entry.flags,
      ...(audit.name_ung_list.length || audit.num_ung_list.length
        ? [{ query: record.query, name_ung_list: audit.name_ung_list, num_ung_list: audit.num_ung_list }]
        : []),
    ],
  };
  byModel.set(key, nextEntry);
}

// ── SUMMARY TABLE ─────────────────────────────────────────────────────────────
const summaryRows = [...byModel.entries()].map(([model, e]) => ({
  model,
  reports: e.reports,
  name_ung_total: e.nameUng,
  num_ung_total: e.numUng,
  'fabs/report': e.reports ? Math.round(100 * (e.nameUng + e.numUng) / e.reports) / 100 : 0,
}));

console.log('══ SYNTH HONESTY GATE — deterministic grounding audit ══════════════════════');
console.table(summaryRows);

// ── FLAGGED ITEM DETAIL ────────────────────────────────────────────────────────
console.log('\n══ FLAGGED ITEMS (by model → query) ══════════════════════════════════════');
let totalFlags = 0;
for (const [model, e] of byModel.entries()) {
  if (!e.flags.length) continue;
  console.log(`\n▸ ${model}`);
  for (const q of e.flags) {
    console.log(`  ${q.query}`);
    for (const item of q.name_ung_list) {
      totalFlags++;
      console.log(`    NAME_UNG  product="${item.product}"  presentRatio=${item.presentRatio.toFixed(2)}`);
    }
    for (const item of q.num_ung_list) {
      totalFlags++;
      console.log(`    NUM_UNG   product="${item.product}"  field=${item.field}  value=${JSON.stringify(item.value)}  number=${item.number}`);
    }
  }
}
if (totalFlags === 0) console.log('  (none)');

// ── GATE VERDICT ────────────────────────────────────────────────────────────────
const failingModels = summaryRows.filter((r) => r.name_ung_total > 0 || r.num_ung_total > 0);
const passed = failingModels.length === 0;

console.log('\n══════════════════════════════════════════════════════════════════════════');
if (passed) {
  console.log('PASS — zero ungrounded names/numbers across all models.');
} else {
  console.log(`FAIL — ${failingModels.length} model(s) with ungrounded names/numbers: ${failingModels.map((r) => r.model).join(', ')}`);
}
console.log('══════════════════════════════════════════════════════════════════════════');

process.exit(passed ? 0 : 1);
