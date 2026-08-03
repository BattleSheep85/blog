#!/usr/bin/env node
// synth-gold-rescore.mjs — deterministic, exact, FREE re-score of every stored
// synthesis-gold report against the FULL corpus.
//
// Why: the stored judged grounding/honesty axes were produced by an LLM that
// saw 0 to 13 percent of the sources per query, and two of eight queries gave
// it zero sources. See docs/benchmark-validity-audit.md. This script answers
// every existence question in code instead.
//
// Costs $0. Makes no network call. Writes ONE new file and edits nothing.
//
// Usage:
//   node benchmarks/synth-gold-rescore.mjs
//
// Reads:
//   benchmarks/ft-data/synth-gold-runs.jsonl
//   benchmarks/results/google-top50-corpus.json   (gitignored, 9.6 MB)
//   benchmarks/ft-data/synth-gold-fable-scores.json + the blinding maps (old
//     judge axes, for the side-by-side print only)
// Writes:
//   benchmarks/ft-data/synth-gold-grounding-v2.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildHaystacks, groundingCheck, isScorableCitation } from './lib/grounding-check.mjs';
import { readJsonl, loadOldJudgeAxes, mean, round2 } from './lib/rescore-io.mjs';

const RUNS_PATH = new URL('./ft-data/synth-gold-runs.jsonl', import.meta.url);
const CORPUS_PATH = new URL('./results/google-top50-corpus.json', import.meta.url);
const OUT_PATH = new URL('./ft-data/synth-gold-grounding-v2.json', import.meta.url);

function loadCorpora() {
  if (!existsSync(CORPUS_PATH)) {
    throw new Error(`corpus not found at ${CORPUS_PATH.pathname}. It is gitignored (9.6 MB); regenerate with benchmarks/harvest-google.mjs before re-scoring.`);
  }
  const corpora = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  return new Map(corpora.map((c) => [c.query, c]));
}

function scoreRow(run, corpus, hay) {
  const g = groundingCheck(run.report, corpus, { hay });
  return {
    query: run.query,
    model: run.model,
    label: run.label,
    ok: true,
    products: (run.report?.products || []).length,
    gDet: g.gDet,
    weights: g.weights,
    citationsScored: g.units.citations.filter(isScorableCitation).length,
    numbersChecked: g.units.numbers.checked,
    fabricatedProducts: g.fabricatedProducts.map((p) => ({ name: p.name, presentRatio: round2(p.presentRatio), tokens: p.tokens })),
    fabricatedCitations: g.fabricatedCitations.map((c) => ({ outlet: c.outlet, alias: c.alias, dateISO: c.dateISO, status: c.status, field: c.field, span: c.span })),
    ungroundedNumbers: g.ungroundedNumbers,
    strictMisses: g.strictMisses,
  };
}

function aggregate(rows, runsByLabel) {
  const byLabel = new Map();
  for (const r of rows) {
    const prev = byLabel.get(r.label) || [];
    byLabel.set(r.label, [...prev, r]);
  }
  return [...byLabel.entries()].map(([label, scored]) => {
    const all = runsByLabel.get(label) || [];
    return {
      label,
      model: scored[0].model,
      completions: `${scored.length}/${all.length}`,
      completionRate: round2(scored.length / all.length),
      gDetMean: round2(mean(scored.map((s) => s.gDet).filter((g) => g !== null))),
      products: scored.reduce((s, r) => s + r.products, 0),
      fabricatedProducts: scored.reduce((s, r) => s + r.fabricatedProducts.length, 0),
      citationsScored: scored.reduce((s, r) => s + r.citationsScored, 0),
      fabricatedCitations: scored.reduce((s, r) => s + r.fabricatedCitations.length, 0),
      ungroundedNumbers: scored.reduce((s, r) => s + r.ungroundedNumbers.length, 0),
      numbersChecked: scored.reduce((s, r) => s + r.numbersChecked, 0),
      genCostUsd: round2(all.reduce((s, r) => s + (r.cost || 0), 0)),
    };
  }).sort((a, b) => b.gDetMean - a.gDetMean);
}

function main() {
  const runs = readJsonl(RUNS_PATH);
  const corpusByQuery = loadCorpora();
  const runsByLabel = new Map();
  for (const r of runs) runsByLabel.set(r.label, [...(runsByLabel.get(r.label) || []), r]);

  const hayByQuery = new Map();
  const rows = [];
  for (const run of runs) {
    if (!run.ok || !run.report) continue;
    const corpus = corpusByQuery.get(run.query);
    if (!corpus) throw new Error(`no cached corpus for query "${run.query}"`);
    if (!hayByQuery.has(run.query)) hayByQuery.set(run.query, buildHaystacks(corpus));
    rows.push(scoreRow(run, corpus, hayByQuery.get(run.query)));
  }

  const perModel = aggregate(rows, runsByLabel);
  const oldAxes = loadOldJudgeAxes(import.meta.url);

  console.log('\n══ DETERMINISTIC RE-SCORE v2 (exact, full corpus, no LLM) ══');
  console.log('gDet is NOT comparable to the stored judge "g" axis: different source, different question.\n');
  console.table(perModel.map((m) => ({
    label: m.label,
    completions: m.completions,
    gDet_v2: m.gDetMean,
    old_judge_g: oldAxes.get(m.label)?.g ?? 'n/a',
    old_judge_h: oldAxes.get(m.label)?.h ?? 'n/a',
    products: m.products,
    fab_products: m.fabricatedProducts,
    citations: m.citationsScored,
    fab_citations: m.fabricatedCitations,
    num_ung: m.ungroundedNumbers,
    nums_checked: m.numbersChecked,
  })));

  writeFileSync(OUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    method: 'docs/benchmark-validity-audit.md section 5. Exact deterministic grounding against the FULL corpus. No LLM.',
    notComparableTo: 'synth-gold-fable-scores.json (judged through a 6000-char digest covering 0-13% of sources)',
    perModel,
    rows,
  }, null, 2));
  console.log(`\nwrote ${OUT_PATH.pathname}`);
  console.log('cost: $0.00 (no network calls)');
}

main();
