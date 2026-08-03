#!/usr/bin/env node
// extract-gold-gen.mjs — GENERATION step of the blinded claim-extraction gold
// benchmark (mirrors synth-gold-gen.mjs / stance-gold-bench conventions:
// generate candidates → a frontier judge labels blind later → score).
//
// This script is generation + deterministic scoring ONLY. It does NOT judge
// quality — that happens against the blinded bundles produced by
// extract-gold-blind.mjs.
//
// Reuses the harvested corpus (benchmarks/ft-data/extract-harvested.jsonl,
// 265 records — product + REAL production claim-source page-text block,
// already assembled exactly as `runVerification`'s buildClaimTextBlock
// would produce it). NO fresh gather/harvest, $0 Serper/Jina spend. Picks 10
// diverse products (deterministic seed 42, spread across category buckets,
// preferring records whose input block is substantial — > 5k chars where
// available) and runs 5 candidate models against the REAL production
// `extractClaims` (worker/engine/verify.js) — same system prompt, same
// input assembly, temperature 0, maxTokens 2000.
//
// 10 products x 5 models = 50 extraction calls. Hard-capped at $1.50 — the
// run aborts (writing whatever completed so far) if the accumulated cost
// would exceed the cap before the next call.
//
// Usage:
//   node benchmarks/extract-gold-gen.mjs
//
//   node benchmarks/extract-gold-gen.mjs --model <id> --label <label> \
//        [--reasoning-effort <value>]
//        # single-candidate mode: runs ONLY <id> over the same 10 products
//        # (10 calls, not 50) and MERGES the result into the existing output
//        # files: rows for this label are replaced, every other label's
//        # stored rows are preserved untouched (never overwrites the
//        # incumbents). Same $1.50 hard cap applies.
//
// Outputs:
//   benchmarks/ft-data/extract-gold-runs.jsonl        — one line per (product, model)
//   benchmarks/ft-data/extract-gold-deterministic.json — deterministic checks per candidate

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extractClaims } from '../worker/engine/verify.js';
import { callLLM } from '../worker/engine/llm.js';
import { norm } from './lib/synth-score.mjs';
import { CATEGORY_BUCKETS, SEED, selectProducts } from './lib/extract-gold-selection.mjs';

// ── ENV ──────────────────────────────────────────────────────────────────────
function loadOpenRouterKey() {
  const devVarsPath = new URL('../.dev.vars', import.meta.url);
  if (!existsSync(devVarsPath)) {
    throw new Error('.dev.vars not found — need OPENROUTER_API_KEY');
  }
  const env = {};
  for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing from .dev.vars');
  return env.OPENROUTER_API_KEY;
}
const KEY = loadOpenRouterKey();

// ── SPEND GOVERNOR ────────────────────────────────────────────────────────────
const HARD_SPEND_CAP_USD = 1.5;
let spentUsd = 0;

// ── CLI args (single-candidate mode) ─────────────────────────────────────────
function parseArgs(argv) {
  let model = null;
  let label = null;
  let reasoningEffort = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--model') { model = argv[i + 1] || null; i += 1; }
    else if (argv[i] === '--label') { label = argv[i + 1] || null; i += 1; }
    else if (argv[i] === '--reasoning-effort') { reasoningEffort = argv[i + 1] || null; i += 1; }
  }
  return { model, label, reasoningEffort };
}
const cliArgs = parseArgs(process.argv.slice(2));

// ── CANDIDATES (5, or 1 in single-candidate mode) ────────────────────────────
const BANNED_MODEL_SUBSTRINGS = ['deepseek-r1'];
const DEFAULT_CANDIDATES = [
  { label: 'gpt-5.4-mini',     model: 'openai/gpt-5.4-mini' },              // incumbent
  { label: 'minimax-m3',       model: 'minimax/minimax-m3' },
  { label: 'deepseek-v4-flash', model: 'deepseek/deepseek-v4-flash' },
  { label: 'claude-haiku-4.5', model: 'anthropic/claude-haiku-4.5' },
  { label: 'granite-4.1-8b',   model: 'ibm-granite/granite-4.1-8b' },       // cheap wildcard
];
const CANDIDATES = cliArgs.model
  ? [{
      label: cliArgs.label || cliArgs.model.replace(/[/:]/g, '_'),
      model: cliArgs.model,
      reasoning: cliArgs.reasoningEffort || undefined,
    }]
  : DEFAULT_CANDIDATES;
for (const c of CANDIDATES) {
  if (BANNED_MODEL_SUBSTRINGS.some((b) => c.model.toLowerCase().includes(b))) {
    throw new Error(`refusing to benchmark vetoed model: ${c.model}`);
  }
}
if (cliArgs.model) {
  process.stderr.write(
    `[single-candidate mode] model=${cliArgs.model} label=${CANDIDATES[0].label} reasoning=${cliArgs.reasoningEffort || 'none'}\n`,
  );
}

// ── HARVESTED CORPUS ──────────────────────────────────────────────────────────
const HARVESTED_PATH = new URL('./ft-data/extract-harvested.jsonl', import.meta.url);
if (!existsSync(HARVESTED_PATH)) {
  throw new Error(`harvested corpus not found: ${HARVESTED_PATH.pathname}`);
}
function readJsonl(url) {
  return readFileSync(url, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const harvested = readJsonl(HARVESTED_PATH);

// ── DETERMINISTIC PRODUCT SELECTION (seed 42, spread categories) ─────────────
// Selection logic lives in ./lib/extract-gold-selection.mjs so
// extract-gold-candidate-judge.mjs can rebuild the identical 10-product
// input text without duplicating this code.
const selection = selectProducts(harvested, CATEGORY_BUCKETS, SEED);
process.stderr.write(
  `selected ${selection.length} products (seed=${SEED}):\n` +
    selection
      .map((s) => `  [${s.bucket}] ${s.record.meta.product} (input ${s.record.messages[1].content.length} chars)`)
      .join('\n') +
    '\n',
);

// ── DETERMINISTIC GROUNDEDNESS PROXY ──────────────────────────────────────────
// Reuses norm() from lib/synth-score.mjs (lowercase, strip non-alnum,
// collapse whitespace) so tokenization conventions match the synth gold
// benchmark. A claim is "grounded" when >=50% of its significant tokens
// (len>=3, not a stopword) appear in the source block — mirrors the
// name-grounding heuristic in synth-score.mjs's score().
const CLAIM_STOP = new Set(['with', 'the', 'and', 'for', 'has', 'this', 'that', 'from', 'its', 'are', 'was']);

function claimGroundedness(claimText, sourceNorm) {
  const toks = norm(claimText)
    .split(' ')
    .filter((w) => w.length >= 3 && !CLAIM_STOP.has(w));
  if (!toks.length) return 0;
  const present = toks.filter((w) => sourceNorm.includes(w)).length;
  return present / toks.length;
}

function scoreCandidateClaims(claims, sourceBlock) {
  const sourceNorm = norm(sourceBlock);
  const n = claims.length;
  const seen = new Map(); // normalized text -> count
  let dupCount = 0;
  let lenSum = 0;
  let groundedSum = 0;
  const groundednessList = [];
  for (const c of claims) {
    const key = norm(c.text);
    const prev = seen.get(key) || 0;
    if (prev > 0) dupCount++;
    seen.set(key, prev + 1);
    lenSum += c.text.length;
    const g = claimGroundedness(c.text, sourceNorm);
    groundedSum += g;
    groundednessList.push({ text: c.text, groundedness: Math.round(g * 100) / 100 });
  }
  return {
    claim_count: n,
    dup_count: dupCount,
    dup_rate: n ? Math.round((dupCount / n) * 100) / 100 : 0,
    avg_claim_len: n ? Math.round(lenSum / n) : 0,
    avg_groundedness: n ? Math.round((groundedSum / n) * 100) / 100 : 0,
    grounded_ge_half_rate: n ? Math.round((groundednessList.filter((g) => g.groundedness >= 0.5).length / n) * 100) / 100 : 0,
    groundedness_list: groundednessList,
  };
}

// ── EXTRACT ────────────────────────────────────────────────────────────────────
async function runExtract(record, cand) {
  const product = record.meta.product;
  // Same input assembly the production pipeline hands extractClaims:
  // "Product: "<name>"\n\n<claim source block>" is built inside extractClaims
  // itself — we pass the already-assembled claimText the harvested record
  // captured from the real `buildClaimTextBlock` output (the user message
  // minus the "Product: ..." prefix extractClaims re-adds).
  const userContent = record.messages[1].content;
  const prefixMatch = userContent.match(/^Product: "(.*?)"\n\n([\s\S]*)$/);
  const claimText = prefixMatch ? prefixMatch[2] : userContent;

  const t0 = Date.now();
  try {
    const { claims, costUsd } = await extractClaims({
      product,
      claimText,
      apiKey: KEY,
      model: cand.model,
      callLLM,
      reasoning: cand.reasoning,
    });
    return { ok: true, claims, cost: costUsd, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: String(err.message || err), cost: 0, ms: Date.now() - t0 };
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const RUNS_OUT = new URL('./ft-data/extract-gold-runs.jsonl', import.meta.url);
const DETERMINISTIC_OUT = new URL('./ft-data/extract-gold-deterministic.json', import.meta.url);
mkdirSync(new URL('./ft-data/', import.meta.url), { recursive: true });

// Labels this invocation is about to (re)generate. Used at write time to
// merge with, rather than clobber, whatever is already on disk. This way
// single-candidate mode sits its new rows alongside the stored incumbent
// rows instead of overwriting them (and reruns of the SAME label replace
// only that label's rows, never anyone else's).
const labelsThisRun = new Set(CANDIDATES.map((c) => c.label));

function loadExistingRunLines() {
  if (!existsSync(RUNS_OUT)) return [];
  return readFileSync(RUNS_OUT, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !labelsThisRun.has(JSON.parse(l).label));
}
function loadExistingDeterministic() {
  if (!existsSync(DETERMINISTIC_OUT)) return [];
  return JSON.parse(readFileSync(DETERMINISTIC_OUT, 'utf8')).filter((r) => !labelsThisRun.has(r.model));
}

const runLines = [];
const deterministic = [];
const rows = [];
let aborted = false;

outer:
for (const { bucket, record } of selection) {
  const product = record.meta.product;
  const sourceBlock = record.messages[1].content;
  process.stderr.write(`\n▸ [${bucket}] ${product} (${sourceBlock.length} chars)\n`);
  for (const cand of CANDIDATES) {
    if (spentUsd >= HARD_SPEND_CAP_USD) {
      process.stderr.write(`\n[SPEND CAP] $${spentUsd.toFixed(4)} >= $${HARD_SPEND_CAP_USD.toFixed(2)} — stopping gracefully, writing partial results\n`);
      aborted = true;
      break outer;
    }
    process.stderr.write(`  → ${cand.label}...\n`);
    const r = await runExtract(record, cand);
    spentUsd += r.cost || 0;
    process.stderr.write(
      `    ${cand.label}: ${r.ok ? `ok, ${r.claims.length} claims` : r.error} (${r.ms}ms, $${(r.cost || 0).toFixed(4)}, cum=$${spentUsd.toFixed(4)})\n`,
    );

    runLines.push(JSON.stringify({
      product,
      bucket,
      model: cand.model,
      label: cand.label,
      ok: r.ok,
      claims: r.ok ? r.claims : undefined,
      error: r.ok ? undefined : r.error,
      cost: r.cost || 0,
      ms: r.ms,
    }));

    const base = { product, bucket, model: cand.label, ok: r.ok, ms: r.ms, cost: r.cost || 0, error: r.ok ? null : r.error };
    if (r.ok) {
      const s = scoreCandidateClaims(r.claims, sourceBlock);
      const { groundedness_list, ...summary } = s;
      deterministic.push({ ...base, ...summary });
      rows.push({
        product: product.slice(0, 22),
        model: cand.label,
        ok: '✓',
        claims: s.claim_count,
        dup_rate: s.dup_rate,
        avg_len: s.avg_claim_len,
        grounded: s.avg_groundedness,
        cost_c: `$${((r.cost || 0) * 100).toFixed(3)}¢`,
      });
    } else {
      deterministic.push({ ...base, claim_count: 0, dup_count: 0, dup_rate: 0, avg_claim_len: 0, avg_groundedness: 0, grounded_ge_half_rate: 0 });
      rows.push({ product: product.slice(0, 22), model: cand.label, ok: '✗', ERROR: r.error?.slice(0, 40) });
    }
  }
}

// Merge: existing rows for OTHER labels (untouched) + this run's rows.
const mergedRunLines = [...loadExistingRunLines(), ...runLines];
const mergedDeterministic = [...loadExistingDeterministic(), ...deterministic];

writeFileSync(RUNS_OUT, mergedRunLines.join('\n') + '\n');
writeFileSync(DETERMINISTIC_OUT, JSON.stringify(mergedDeterministic, null, 2));

console.log('\n══ PER-RUN RESULTS (this invocation only) ══════════════════════════════════════');
console.table(rows);

// Aggregate per model (completion rate + deterministic table). Computed
// over the MERGED set so it reflects everyone on disk, not just this run.
const byModel = {};
for (const r of mergedDeterministic) {
  const k = r.model;
  byModel[k] ??= { runs: 0, ok: 0, cost: 0, claims: 0, dup: 0, len: 0, grounded: 0 };
  const b = byModel[k];
  b.runs++;
  b.cost += r.cost || 0;
  if (r.ok) {
    b.ok++;
    b.claims += r.claim_count || 0;
    b.dup += r.dup_count || 0;
    b.len += r.avg_claim_len || 0;
    b.grounded += r.avg_groundedness || 0;
  }
}
const agg = Object.entries(byModel).map(([model, b]) => ({
  model,
  completion: `${b.ok}/${b.runs}`,
  total_cost: `$${b.cost.toFixed(4)}`,
  avg_claims: b.ok ? Math.round(10 * b.claims / b.ok) / 10 : '—',
  dup_claims_total: b.dup,
  avg_claim_len: b.ok ? Math.round(b.len / b.ok) : '—',
  avg_groundedness: b.ok ? Math.round(100 * b.grounded / b.ok) / 100 : '—',
}));

console.log('\n══ AGGREGATE PER MODEL ══════════════════════════════════════════════════════');
console.table(agg);
console.log(`\ntotal spend: $${spentUsd.toFixed(4)} (cap $${HARD_SPEND_CAP_USD.toFixed(2)})${aborted ? ' — ABORTED early on spend cap' : ''}`);
console.log(`runs → ${RUNS_OUT.pathname}`);
console.log(`deterministic → ${DETERMINISTIC_OUT.pathname}`);
