#!/usr/bin/env node
// determinism-probe.mjs — does temperature:0 (+/- seed) make our paid OpenRouter
// models reproducible on repeat calls with identical input?
//
// worker/engine/llm.js now defaults temperature:0. BaitBench's own notes say
// remote OpenRouter calls are NOT byte-reproducible even at temp:0. This probe
// measures that empirically for OUR two production models:
//   - synth:      openai/gpt-5.4-mini   (via callLLMStreaming, matches bench-synth-v2)
//   - classifier: google/gemini-2.5-flash-lite (via callLLM, matches worker/lib/classifier.js)
//
// For each model, over ONE cached corpus query, runs 3x under two settings:
//   (a) temperature:0
//   (b) temperature:0 + seed:42
// Reports: byte-identical?, token-diff divergence %, and structured-field stability
// (product names/ranking/verdicts for synth; facets/accept for classifier).
//
// HARD SPEND CAP: $2 (script stops issuing new calls once tracked cost crosses it).
//
// Usage: node benchmarks/determinism-probe.mjs

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { callLLMStreaming, callLLM } from '../worker/engine/llm.js';
import { validateResearchResult } from '../worker/engine/validate.js';
import { getTierConfig } from '../worker/lib/tiers.js';
import { CLASSIFIER_SYSTEM_PROMPT } from '../worker/lib/classifier.js';

// ── ENV ──────────────────────────────────────────────────────────────────────
function readEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* file may not exist */ }
  return out;
}
const KEY = readEnv('.dev.vars').OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('need OPENROUTER_API_KEY in .dev.vars or benchmarks/.env'); process.exit(1); }

const SPEND_CAP_USD = Number(process.env.SPEND_CAP || 2);
let spend = 0;

// ── CORPUS (ONE query only — keeps spend tiny) ──────────────────────────────
const corpus = JSON.parse(readFileSync(new URL('./results/corpus.json', import.meta.url), 'utf8'))[0];
process.stderr.write(`probe query: "${corpus.query}" (${corpus.sources.length} sources)\n`);

const SYNTH_MODEL = 'openai/gpt-5.4-mini';
const CLASSIFIER_MODEL = 'google/gemini-2.5-flash-lite';
const RUNS_PER_SETTING = 3;
const SETTINGS = [
  { label: 'temp0-noseed', opts: {} },
  { label: 'temp0-seed42', opts: { seed: 42 } },
];

// ── helpers ───────────────────────────────────────────────────────────────────
function sha256(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

// Simple token-level divergence: 1 - (LCS length / max token count). 0 = identical
// token sequence, 1 = completely disjoint. Cheap O(n*m) LCS is fine at this scale
// (a few KB of JSON/prose per response).
function tokenDivergence(a, b) {
  const ta = a.split(/\s+/).filter(Boolean);
  const tb = b.split(/\s+/).filter(Boolean);
  if (ta.length === 0 && tb.length === 0) return 0;
  const n = ta.length, m = tb.length;
  // Bound cost: if either side is huge, fall back to a coarser word-set Jaccard
  // divergence instead of O(n*m) LCS to avoid pathological runtimes.
  if (n * m > 4_000_000) {
    const sa = new Set(ta), sb = new Set(tb);
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter++;
    const union = sa.size + sb.size - inter;
    return union === 0 ? 0 : 1 - inter / union;
  }
  const dp = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let prevDiag = 0;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = ta[i - 1] === tb[j - 1] ? prevDiag + 1 : Math.max(dp[j], dp[j - 1]);
      prevDiag = tmp;
    }
  }
  const lcs = dp[m];
  return 1 - lcs / Math.max(n, m);
}

function checkSpendCap() {
  if (spend >= SPEND_CAP_USD) {
    console.error(`\n!! spend cap $${SPEND_CAP_USD.toFixed(2)} reached (tracked $${spend.toFixed(4)}) — stopping.`);
    process.exit(1);
  }
}

// ── SYNTH probe (openai/gpt-5.4-mini via callLLMStreaming) ─────────────────────
const cfg = getTierConfig('full');
async function runSynthOnce(extraOpts) {
  checkSpendCap();
  const prompt = buildSynthesisPrompt(corpus.query, corpus.notes, corpus.sources, cfg, corpus.facets, corpus.cat, {});
  const msgs = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Write the research report for: "${corpus.query}". Respond ONLY with valid JSON.` },
  ];
  const r = await callLLMStreaming(KEY, SYNTH_MODEL, msgs, () => {}, { maxTokens: 16000, temperature: 0, ...extraOpts });
  if (Number.isFinite(r.usage?.cost)) spend += r.usage.cost;
  const content = r.content;
  const mm = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let parsed = null;
  try { parsed = JSON.parse((mm ? mm[1] : content).trim()); } catch { /* leave null */ }
  let structured = null;
  if (parsed) {
    try {
      const result = validateResearchResult(parsed);
      // Split into two comparability tiers: identity (which products, what
      // order — what a user actually sees change) vs verdict prose (freeform
      // text, expected to vary even at temp:0 on remote APIs).
      structured = {
        identity: { productNames: result.products.map((p) => p.name), rankOrder: result.products.map((p) => p.rank) },
        verdicts: result.products.map((p) => p.verdict),
      };
    } catch { /* validation failure — structured stays null */ }
  }
  return { raw: content, structured };
}

// ── CLASSIFIER probe (google/gemini-2.5-flash-lite via callLLM) ────────────────
// Mirrors worker/lib/classifier.js's schema (duplicated here — that file doesn't
// export CLASSIFIER_SCHEMA, and this probe intentionally avoids widening its
// production export surface for a one-off measurement script).
const CLASSIFIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['accept', 'reject_reason', 'topical_category', 'facets', 'suggested_refinement', 'clarifying_questions'],
  properties: {
    accept: { type: 'boolean' },
    reject_reason: { type: ['string', 'null'] },
    topical_category: { type: ['string', 'null'] },
    facets: {
      type: 'object',
      additionalProperties: false,
      required: ['needs_location', 'is_buyable', 'is_experience', 'is_content', 'is_service', 'is_comparative', 'sold_on_amazon', 'recency_sensitive'],
      properties: {
        needs_location: { type: 'boolean' }, is_buyable: { type: 'boolean' }, is_experience: { type: 'boolean' },
        is_content: { type: 'boolean' }, is_service: { type: 'boolean' }, is_comparative: { type: 'boolean' },
        sold_on_amazon: { type: 'boolean' }, recency_sensitive: { type: 'boolean' },
      },
    },
    suggested_refinement: { type: ['string', 'null'] },
    clarifying_questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'question', 'suggested_answers'],
        properties: {
          key: { type: 'string' },
          question: { type: 'string' },
          suggested_answers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

async function runClassifierOnce(extraOpts) {
  checkSpendCap();
  const msgs = [
    { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
    { role: 'user', content: corpus.query },
  ];
  const data = await callLLM(KEY, CLASSIFIER_MODEL, msgs, {
    maxTokens: 500,
    temperature: 0,
    responseFormat: { type: 'json_schema', json_schema: { name: 'classification', strict: true, schema: CLASSIFIER_SCHEMA } },
    ...extraOpts,
  });
  if (Number.isFinite(data.usage?.cost)) spend += data.usage.cost;
  const content = data.choices?.[0]?.message?.content ?? '';
  let parsed = null;
  try { parsed = JSON.parse(content); } catch { /* leave null */ }
  const structured = parsed ? {
    accept: parsed.accept,
    topical_category: parsed.topical_category,
    facets: parsed.facets,
  } : null;
  return { raw: content, structured };
}

// ── run a model×setting cell ────────────────────────────────────────────────
async function probeCell(label, runOnce, opts) {
  const outputs = [];
  for (let i = 0; i < RUNS_PER_SETTING; i++) {
    process.stderr.write(`  ${label}: run ${i + 1}/${RUNS_PER_SETTING}...\n`);
    outputs.push(await runOnce(opts));
  }
  const hashes = outputs.map((o) => sha256(o.raw));
  const identical = new Set(hashes).size === 1;

  // Pairwise mean token divergence across the 3 raw outputs.
  let divSum = 0, divN = 0;
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      divSum += tokenDivergence(outputs[i].raw, outputs[j].raw);
      divN++;
    }
  }
  const divergencePct = divN ? (100 * divSum / divN) : 0;

  // "Identity" = the user-visible decision surface: which products, in what
  // order (synth), or accept/category/facets (classifier). Falls back to the
  // whole structured object when a probe has no separate identity/verdict split.
  const identityJson = outputs.map((o) => JSON.stringify(o.structured?.identity ?? o.structured));
  const identityStable = identityJson.every((s) => s !== undefined) && new Set(identityJson).size === 1;

  // "Full structured" also includes freeform prose fields (verdicts) — expected
  // to drift even when identity is stable.
  const structuredJson = outputs.map((o) => JSON.stringify(o.structured));
  const structuredStable = structuredJson.every((s) => s !== undefined) && new Set(structuredJson).size === 1;

  return { identical, divergencePct, identityStable, structuredStable, hashes };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const rows = [];
for (const { label, opts } of SETTINGS) {
  process.stderr.write(`\n▸ synth (${SYNTH_MODEL}) — ${label}\n`);
  rows.push({ model: 'gpt-5.4-mini (synth)', setting: label, ...(await probeCell(label, runSynthOnce, opts)) });
}
for (const { label, opts } of SETTINGS) {
  process.stderr.write(`\n▸ classifier (${CLASSIFIER_MODEL}) — ${label}\n`);
  rows.push({ model: 'gemini-2.5-flash-lite (classifier)', setting: label, ...(await probeCell(label, runClassifierOnce, opts)) });
}

// ── REPORT ────────────────────────────────────────────────────────────────────
console.log('\n=== Determinism probe results ===');
console.log(`query: "${corpus.query}"  |  ${RUNS_PER_SETTING} runs per cell  |  tracked spend: $${spend.toFixed(4)}\n`);
console.table(rows.map((r) => ({
  model: r.model,
  setting: r.setting,
  'byte-identical': r.identical ? 'YES' : 'no',
  'avg token divergence': `${r.divergencePct.toFixed(2)}%`,
  'identity stable (products/rank/accept)': r.identityStable ? 'YES' : 'no',
  'full structured stable (incl. verdict prose)': r.structuredStable ? 'YES' : 'no',
  hashes: r.hashes.join(' / '),
})));

const synthNoSeed = rows.find((r) => r.model.includes('synth') && r.setting === 'temp0-noseed');
const synthSeed = rows.find((r) => r.model.includes('synth') && r.setting === 'temp0-seed42');
const clsNoSeed = rows.find((r) => r.model.includes('classifier') && r.setting === 'temp0-noseed');
const clsSeed = rows.find((r) => r.model.includes('classifier') && r.setting === 'temp0-seed42');

console.log('\n=== Verdict ===');
console.log(`Synth (gpt-5.4-mini)      temp0 byte-identical: ${synthNoSeed.identical}, identity-stable: ${synthNoSeed.identityStable}, full-structured-stable: ${synthNoSeed.structuredStable}`);
console.log(`Synth (gpt-5.4-mini)  +seed byte-identical: ${synthSeed.identical}, identity-stable: ${synthSeed.identityStable}, full-structured-stable: ${synthSeed.structuredStable}`);
console.log(`Classifier (flash-lite)   temp0 byte-identical: ${clsNoSeed.identical}, identity-stable: ${clsNoSeed.identityStable}, full-structured-stable: ${clsNoSeed.structuredStable}`);
console.log(`Classifier (flash-lite) +seed byte-identical: ${clsSeed.identical}, identity-stable: ${clsSeed.identityStable}, full-structured-stable: ${clsSeed.structuredStable}`);
console.log(`\nTotal tracked OpenRouter spend this run: $${spend.toFixed(4)} (cap $${SPEND_CAP_USD.toFixed(2)})`);
