#!/usr/bin/env node
// rescore-synth.mjs — re-score an existing synth dump against its cached corpus
// with the CURRENT scoring logic in ./lib/synth-score.mjs, with zero API calls.
//
// Use case: synth-score.mjs's grounding rules changed (e.g. the name_ung fix),
// and we want to see the effect on an already-paid-for dump without re-running
// any model. Pulls the stored `products_full` per run and re-scores them.
//
// Usage:
//   DUMP_FILE=./results/synth-batch-50q.json CORPUS_FILE=./results/google-top50-corpus.json \
//     node benchmarks/rescore-synth.mjs

import { readFileSync } from 'node:fs';
import { score } from './lib/synth-score.mjs';

// ── ENV ──────────────────────────────────────────────────────────────────────
const DUMP_FILE = process.env.DUMP_FILE;
const CORPUS_FILE = process.env.CORPUS_FILE;
if (!DUMP_FILE) { console.error('need DUMP_FILE=<path to synth dump JSON>'); process.exit(1); }
if (!CORPUS_FILE) { console.error('need CORPUS_FILE=<path to corpus JSON>'); process.exit(1); }

const dumpPath = new URL(DUMP_FILE, import.meta.url);
const corpusPath = new URL(CORPUS_FILE, import.meta.url);

const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

// ── MATCH + RE-SCORE ─────────────────────────────────────────────────────────
// Dump entries carry `query` truncated to 24 chars (see bench-synth-v2.mjs /
// synth-anthropic-batch.mjs `query: corpus.query.slice(0, 24)`); match back to
// the full-length corpus entry the same way.
const byModel = {};

for (const entry of dump) {
  if (entry.ok !== '✓') continue; // skip failed runs — nothing to re-score
  const corpusEntry = corpus.find((c) => c.query.slice(0, 24) === entry.query);
  if (!corpusEntry) {
    process.stderr.write(`WARN: no corpus match for query "${entry.query}" (model ${entry.model})\n`);
    continue;
  }
  const rescored = score({ products: entry.products_full }, corpusEntry);

  const key = entry.model;
  byModel[key] ??= { runs: 0, nameUngStrict: 0, nameUng: 0, numUng: 0, products: 0 };
  const b = byModel[key];
  b.runs++;
  b.nameUngStrict += rescored.name_ung_strict;
  b.nameUng += rescored.name_ung;
  b.numUng += rescored.num_ung;
  b.products += rescored.products;
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const rows = Object.entries(byModel).map(([model, b]) => ({
  model,
  runs: b.runs,
  'name_ung_strict (OLD)': b.nameUngStrict,
  'name_ung (NEW)': b.nameUng,
  num_ung: b.numUng,
  total_products: b.products,
  name_fp_removed: b.nameUngStrict - b.nameUng,
}));

console.log('RE-SCORE — name_ung_strict (old substring) vs name_ung (new token-presence)');
console.table(rows);
