#!/usr/bin/env node
// stance-gold-bench.mjs — stance-classification accuracy benchmark scored
// against INDEPENDENT gold labels, not circular agreement with the
// production teacher.
//
// Background: every prior stance eval in this repo (stance-local-bench.mjs,
// the harvest-teacher-labels.mjs pipeline) measures agreement WITH
// gpt-5.4-mini's own labels — i.e. "does the candidate match the teacher?".
// That's circular: it can never catch the teacher being systematically
// wrong. This benchmark instead scores against `stance-gold-fable.jsonl` —
// 112 (claim, source) pairs independently labeled by a frontier judge
// (Fable) working blind from `stance-gold-blind.jsonl` (no teacher label
// visible) against the exact STANCE_SYSTEM echo-rejection rubric. See
// `benchmarks/ft-data/README.md` for the full provenance + the finding.
//
// Usage:
//   node benchmarks/stance-gold-bench.mjs                 # baseline, $0 — scores
//                                                          # the stored gpt-5.4-mini
//                                                          # teacher_stance labels
//   node benchmarks/stance-gold-bench.mjs --model <id>     # LIVE — re-run stance
//                                                          # classification with
//                                                          # OpenRouter model <id>
//                                                          # over the same 112
//                                                          # inputs, temperature 0.
//                                                          # Opt-in, paid, hard-capped
//                                                          # at $1.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { classifyStance } from '../worker/engine/verify.js';
import { callLLM } from '../worker/engine/llm.js';

const GOLD_PATH = new URL('./ft-data/stance-gold-fable.jsonl', import.meta.url);
const TOLABEL_PATH = new URL('./ft-data/stance-gold-tolabel.jsonl', import.meta.url);
const RESULTS_DIR = new URL('./results/', import.meta.url);

const STANCES = Object.freeze(['support', 'contradict', 'neutral']);
const BOOTSTRAP_ITERATIONS = 10_000;
const LIVE_SPEND_HARD_CAP_USD = 1.0;
// Rough per-call estimate for a cheap classifier model (single evidence item,
// short prompt) — used only to print an upfront estimate; the hard cap is
// enforced against ACTUAL accumulated cost as calls complete.
const ESTIMATED_COST_PER_CALL_USD = 0.001;

const BANNED_MODEL_SUBSTRINGS = ['deepseek'];

// ── CLI args ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  let model = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--model') {
      model = argv[i + 1] || null;
      i += 1;
    }
  }
  return { model };
}

// ── Data loading ─────────────────────────────────────────────────────────
function readJsonl(url) {
  const text = readFileSync(url, 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function loadGoldMap() {
  const gold = readJsonl(GOLD_PATH);
  const map = new Map();
  for (const row of gold) {
    if (!row?.id || !STANCES.includes(row.fable_stance)) {
      throw new Error(`invalid gold row: ${JSON.stringify(row)}`);
    }
    map.set(row.id, row.fable_stance);
  }
  return map;
}

function loadInputs() {
  return readJsonl(TOLABEL_PATH);
}

// ── Scoring (pure functions — used by both baseline + live mode) ─────────

// items: [{ id, gold, predicted }]
function accuracy(items) {
  const correct = items.filter((it) => it.gold === it.predicted).length;
  return items.length > 0 ? correct / items.length : 0;
}

function confusionMatrix(items) {
  const matrix = {};
  for (const g of STANCES) {
    matrix[g] = {};
    for (const p of STANCES) matrix[g][p] = 0;
  }
  for (const it of items) matrix[it.gold][it.predicted] += 1;
  return matrix;
}

// Per-class precision/recall/F1 (gold = fable, predicted = model), computed
// one-vs-rest from the confusion matrix.
function perClassPRF1(matrix) {
  const out = {};
  for (const cls of STANCES) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const g of STANCES) {
      for (const p of STANCES) {
        const n = matrix[g][p];
        if (g === cls && p === cls) tp += n;
        else if (g !== cls && p === cls) fp += n;
        else if (g === cls && p !== cls) fn += n;
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;
    const recall = tp + fn > 0 ? tp / (tp + fn) : null;
    const f1 =
      precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;
    out[cls] = { precision, recall, f1, support: tp + fn };
  }
  return out;
}

function macroF1(prf1) {
  const f1s = STANCES.map((c) => prf1[c].f1).filter((v) => v !== null);
  return f1s.length > 0 ? f1s.reduce((a, b) => a + b, 0) / f1s.length : 0;
}

// "Action" precision: of the times the model commits to support OR
// contradict (as opposed to the safe default of neutral), how often does
// an independent judge agree with the committed label?
function actionPrecision(items) {
  const acted = items.filter((it) => it.predicted === 'support' || it.predicted === 'contradict');
  if (acted.length === 0) return null;
  const correct = acted.filter((it) => it.gold === it.predicted).length;
  return { precision: correct / acted.length, n: acted.length };
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.round(p * (sortedArr.length - 1))));
  return sortedArr[idx];
}

// 95% bootstrap CI on accuracy + macro-F1 (BaitBench methodology): resample
// `items` with replacement `iterations` times, recompute both metrics each
// time, report the [2.5th, 97.5th] percentile band.
function bootstrapCI(items, iterations = BOOTSTRAP_ITERATIONS) {
  const n = items.length;
  const accSamples = new Array(iterations);
  const f1Samples = new Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    const resample = new Array(n);
    for (let j = 0; j < n; j += 1) {
      resample[j] = items[Math.floor(Math.random() * n)];
    }
    accSamples[i] = accuracy(resample);
    f1Samples[i] = macroF1(perClassPRF1(confusionMatrix(resample)));
  }
  accSamples.sort((a, b) => a - b);
  f1Samples.sort((a, b) => a - b);
  return {
    accuracy: { lo: percentile(accSamples, 0.025), hi: percentile(accSamples, 0.975) },
    macroF1: { lo: percentile(f1Samples, 0.025), hi: percentile(f1Samples, 0.975) },
  };
}

function scoreItems(items) {
  const matrix = confusionMatrix(items);
  const prf1 = perClassPRF1(matrix);
  return {
    n: items.length,
    accuracy: accuracy(items),
    confusionMatrix: matrix,
    perClass: prf1,
    macroF1: macroF1(prf1),
    actionPrecision: actionPrecision(items),
    ci: bootstrapCI(items),
  };
}

// ── Baseline mode ($0) ──────────────────────────────────────────────────
function runBaseline(goldMap, inputs) {
  const items = inputs.map((row) => {
    const gold = goldMap.get(row.id);
    if (!gold) throw new Error(`no gold label for id=${row.id}`);
    if (!STANCES.includes(row.teacher_stance)) {
      throw new Error(`invalid teacher_stance for id=${row.id}: ${row.teacher_stance}`);
    }
    return { id: row.id, gold, predicted: row.teacher_stance };
  });
  return { modelLabel: 'gpt-5.4-mini (stored teacher_stance)', items, costUsd: 0 };
}

// ── Live mode (opt-in, paid) ──────────────────────────────────────────────
function loadOpenRouterKey() {
  const devVarsPath = new URL('../.dev.vars', import.meta.url);
  if (!existsSync(devVarsPath)) {
    throw new Error('.dev.vars not found — need OPENROUTER_API_KEY to run live mode');
  }
  const env = {};
  for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY missing from .dev.vars — required for live mode');
  }
  return env.OPENROUTER_API_KEY;
}

function assertModelAllowed(model) {
  const lower = model.toLowerCase();
  if (BANNED_MODEL_SUBSTRINGS.some((b) => lower.includes(b))) {
    throw new Error(`refusing to benchmark vetoed model: ${model}`);
  }
}

// Single-evidence-item stance call, matching production's per-source input
// construction (classifyStance builds one numbered block per evidence item;
// each gold row is exactly one (claim, source) pair, so evidence=[item]).
async function classifyOneLive({ apiKey, model, row }) {
  const claim = { id: 'c1', text: row.claim };
  const evidence = [
    {
      url: row.source_url,
      content: row.source_snippet || '',
      tags: [],
    },
  ];
  const { rows, costUsd } = await classifyStance({ claim, evidence, apiKey, model, callLLM });
  const predicted = rows.find((r) => r.url === row.source_url)?.stance ?? 'neutral';
  return { predicted, costUsd };
}

async function runLive(model, goldMap, inputs) {
  assertModelAllowed(model);
  const apiKey = loadOpenRouterKey();

  const estimatedTotal = inputs.length * ESTIMATED_COST_PER_CALL_USD;
  process.stderr.write(
    `[live] model=${model} — ${inputs.length} calls, estimated ~$${estimatedTotal.toFixed(4)} ` +
      `(hard cap $${LIVE_SPEND_HARD_CAP_USD.toFixed(2)})\n`,
  );

  const items = [];
  let costUsd = 0;
  for (const row of inputs) {
    if (costUsd >= LIVE_SPEND_HARD_CAP_USD) {
      throw new Error(
        `hard spend cap $${LIVE_SPEND_HARD_CAP_USD.toFixed(2)} reached after ${items.length}/${inputs.length} calls — aborting`,
      );
    }
    const gold = goldMap.get(row.id);
    if (!gold) throw new Error(`no gold label for id=${row.id}`);
    const { predicted, costUsd: callCost } = await classifyOneLive({ apiKey, model, row });
    costUsd += callCost;
    items.push({ id: row.id, gold, predicted });
    process.stderr.write(`[live] ${row.id} -> ${predicted} (gold=${gold})\n`);
  }

  process.stderr.write(`[live] done — actual spend $${costUsd.toFixed(4)}\n`);
  return { modelLabel: model, items, costUsd };
}

// ── Printing ────────────────────────────────────────────────────────────
function pct(x) {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

function printReport(modelLabel, scored) {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`STANCE GOLD BENCH — ${modelLabel}`);
  console.log(`Scored against ${scored.n} independently Fable-labeled (claim, source) pairs`);
  console.log('══════════════════════════════════════════════════════════════════');

  console.log(`\nOverall accuracy: ${pct(scored.accuracy)}  (95% CI [${pct(scored.ci.accuracy.lo)}, ${pct(scored.ci.accuracy.hi)}])`);
  console.log(`Macro-F1:         ${scored.macroF1.toFixed(3)}  (95% CI [${scored.ci.macroF1.lo.toFixed(3)}, ${scored.ci.macroF1.hi.toFixed(3)}])`);
  if (scored.actionPrecision) {
    console.log(
      `Action precision (support|contradict calls agreed with by gold): ${pct(scored.actionPrecision.precision)} (n=${scored.actionPrecision.n})`,
    );
  } else {
    console.log('Action precision: n/a (model never committed to support/contradict)');
  }

  console.log('\nPer-class precision / recall / F1 (gold = fable):');
  console.table(
    STANCES.map((cls) => ({
      class: cls,
      support: scored.perClass[cls].support,
      precision: pct(scored.perClass[cls].precision),
      recall: pct(scored.perClass[cls].recall),
      f1: scored.perClass[cls].f1 === null ? 'n/a' : scored.perClass[cls].f1.toFixed(3),
    })),
  );

  console.log('\nConfusion matrix (rows = gold, cols = predicted):');
  console.table(
    STANCES.map((g) => ({
      'gold \\ pred': g,
      support: scored.confusionMatrix[g].support,
      contradict: scored.confusionMatrix[g].contradict,
      neutral: scored.confusionMatrix[g].neutral,
    })),
  );
}

// ── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  const { model } = parseArgs(process.argv.slice(2));
  const goldMap = loadGoldMap();
  const inputs = loadInputs();

  const run = model ? await runLive(model, goldMap, inputs) : runBaseline(goldMap, inputs);
  const scored = scoreItems(run.items);

  printReport(run.modelLabel, scored);

  mkdirSync(RESULTS_DIR, { recursive: true });
  const outFileName = `stance-gold-bench-${model ? model.replace(/[/:]/g, '_') : 'gpt-5.4-mini'}.json`;
  const outPath = new URL(outFileName, RESULTS_DIR);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        modelLabel: run.modelLabel,
        goldSource: 'benchmarks/ft-data/stance-gold-fable.jsonl',
        n: scored.n,
        accuracy: scored.accuracy,
        macroF1: scored.macroF1,
        actionPrecision: scored.actionPrecision,
        perClass: scored.perClass,
        confusionMatrix: scored.confusionMatrix,
        ci: scored.ci,
        costUsd: run.costUsd,
        items: run.items,
      },
      null,
      2,
    ),
  );
  process.stderr.write(`\n[output] wrote ${outPath.pathname}\n`);
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
