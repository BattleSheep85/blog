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
// Outputs:
//   benchmarks/ft-data/extract-gold-runs.jsonl        — one line per (product, model)
//   benchmarks/ft-data/extract-gold-deterministic.json — deterministic checks per candidate

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extractClaims } from '../worker/engine/verify.js';
import { callLLM } from '../worker/engine/llm.js';
import { norm } from './lib/synth-score.mjs';

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

// ── CANDIDATES (5) ────────────────────────────────────────────────────────────
const BANNED_MODEL_SUBSTRINGS = ['deepseek-r1'];
const CANDIDATES = [
  { label: 'gpt-5.4-mini',     model: 'openai/gpt-5.4-mini' },              // incumbent
  { label: 'minimax-m3',       model: 'minimax/minimax-m3' },
  { label: 'deepseek-v4-flash', model: 'deepseek/deepseek-v4-flash' },
  { label: 'claude-haiku-4.5', model: 'anthropic/claude-haiku-4.5' },
  { label: 'granite-4.1-8b',   model: 'ibm-granite/granite-4.1-8b' },       // cheap wildcard
];
for (const c of CANDIDATES) {
  if (BANNED_MODEL_SUBSTRINGS.some((b) => c.model.toLowerCase().includes(b))) {
    throw new Error(`refusing to benchmark vetoed model: ${c.model}`);
  }
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
// mulberry32 — small, fast, seedable PRNG (public-domain algorithm), same as
// synth-gold-gen.mjs so selection conventions match across gold benchmarks.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Category buckets, one per product-family, chosen for topical diversity
// across the 265 harvested products. Each bucket lists case-insensitive
// substrings matched against the record's product name.
const CATEGORY_BUCKETS = {
  audio:            ['Sony WH-1000XM6', 'Bose QuietComfort Ultra', 'Sony WF-1000XM5', 'Galaxy Buds3 Pro', 'Ultimate Ears Boom', 'HW-Q990D'],
  tv_display:       ['Samsung QN90D', 'LG C4 OLED', 'Odyssey G7'],
  computing:        ['Surface Laptop', 'ThinkPad X1 Carbon', 'ROG Zephyrus', 'ROG Ally', 'iPad Air', 'T7 Shield', 'ZenWiFi', 'Keychron'],
  wearable_health:  ['Fitbit Charge', 'Garmin Forerunner', 'Renpho Smart Scale', 'Waterpik Aquarius'],
  kitchen:          ['Presto Pressure Cooker', 'Presto Salad Shooter'],
  cleaning:         ['Bespoke Jet Vacuum', 'Shark Navigator'],
  power_charging:   ['Anker 737', 'Belkin BoostCharge'],
  baby:             ["Dr. Brown's", 'Graco Pack N Play'],
  smart_home:       ['Roku Ultra', 'Google Nest Hub Max'],
  outdoor:          ['CamelBak Chute Mag'],
};
const SEED = 42;

function selectProducts(records, buckets, seed) {
  const rand = mulberry32(seed);
  const selected = [];
  for (const [bucketName, patterns] of Object.entries(buckets)) {
    const candidates = records.filter((r) =>
      patterns.some((p) => r.meta.product.toLowerCase().includes(p.toLowerCase())),
    );
    if (!candidates.length) throw new Error(`no harvested records for bucket "${bucketName}"`);
    // Bias toward substantial input blocks: sort by content length desc,
    // then draw (deterministically) from the longer half of the bucket so
    // shorter/thinner-content duplicates within a bucket lose out, but the
    // draw itself stays seeded/reproducible rather than always-the-longest.
    const byLenDesc = [...candidates].sort(
      (a, b) => b.messages[1].content.length - a.messages[1].content.length,
    );
    const pool = byLenDesc.slice(0, Math.max(1, Math.ceil(byLenDesc.length / 2)));
    const idx = Math.floor(rand() * pool.length);
    selected.push({ bucket: bucketName, record: pool[idx] });
  }
  return selected;
}

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

writeFileSync(RUNS_OUT, runLines.join('\n') + '\n');
writeFileSync(DETERMINISTIC_OUT, JSON.stringify(deterministic, null, 2));

console.log('\n══ PER-RUN RESULTS ══════════════════════════════════════════════════════════');
console.table(rows);

// Aggregate per model (completion rate + deterministic table)
const byModel = {};
for (const r of deterministic) {
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
