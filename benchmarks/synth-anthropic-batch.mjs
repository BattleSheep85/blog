#!/usr/bin/env node
// synth-anthropic-batch.mjs — Claude Haiku 4.5 (native Anthropic Messages
// Batches API, 50% cheaper) vs. the incumbent gpt-5.4-mini (OpenRouter),
// scored on the fabrication/honesty gate (ungrounded product names + numbers).
//
// Same cached corpus for both models — apples-to-apples. Gather is NOT run
// here; it reuses benchmarks/results/corpus.json produced by bench-synth-v2.mjs.
//
// Usage:
//   ANTHROPIC_API_KEY=... node benchmarks/synth-anthropic-batch.mjs
//   MAX_Q=4 ANTHROPIC_API_KEY=... node benchmarks/synth-anthropic-batch.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { callLLMStreaming } from '../worker/engine/llm.js';
import { validateResearchResult } from '../worker/engine/validate.js';
import { getTierConfig } from '../worker/lib/tiers.js';
import { score } from './lib/synth-score.mjs';
import { submitBatch, pollBatch, getResults, textOf } from './lib/anthropic-batch.mjs';

// ── ENV ──────────────────────────────────────────────────────────────────────
const e = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim();
}
const OPENROUTER_KEY = e.OPENROUTER_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || e.ANTHROPIC_API_KEY;
if (!OPENROUTER_KEY) { console.error('need OPENROUTER_API_KEY in .dev.vars'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('need ANTHROPIC_API_KEY in the environment (BWS at runtime — not .dev.vars)'); process.exit(1); }

// ── CORPUS (cached — no fresh gather here) ───────────────────────────────────
const CORPUS_PATH = process.env.CORPUS_FILE
  ? new URL(process.env.CORPUS_FILE, import.meta.url)
  : new URL('./results/corpus.json', import.meta.url);
if (!existsSync(CORPUS_PATH)) {
  console.error('no cached corpus — run `FRESH=1 node benchmarks/bench-synth-v2.mjs` first');
  process.exit(1);
}
let corpora = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')).filter((c) => c.sources?.length);
if (!corpora.length) {
  console.error('cached corpus is empty — run `FRESH=1 node benchmarks/bench-synth-v2.mjs` first');
  process.exit(1);
}
const MAX_Q = Number(process.env.MAX_Q) || Math.min(corpora.length, 8);
corpora = corpora.slice(0, MAX_Q);
process.stderr.write(`using cached corpus (${corpora.length} entries)\n`);

const cfg = getTierConfig('full');

// ── PROMPT BUILD (shared shape for both models) ──────────────────────────────
function buildPrompt(corpus) {
  const prompt = buildSynthesisPrompt(corpus.query, corpus.notes, corpus.sources, cfg, corpus.facets, corpus.cat, {});
  const userLine = `Write the research report for: "${corpus.query}". Respond ONLY with valid JSON.`;
  return { prompt, userLine };
}

function parseAndValidate(content) {
  const mm = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let parsed = null;
  try { parsed = JSON.parse((mm ? mm[1] : content).trim()); } catch {}
  if (!parsed) return { ok: false, error: 'json-parse-fail', raw: content.slice(0, 200) };
  try {
    const result = validateResearchResult(parsed);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: `validate: ${err.message}` };
  }
}

// ── HAIKU 4.5 via Anthropic native Messages Batches API ──────────────────────
async function runHaikuBatch() {
  const requests = corpora.map((corpus, i) => {
    const { prompt, userLine } = buildPrompt(corpus);
    return {
      custom_id: `haiku_q${i}`,
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 16000,
        system: prompt,
        messages: [{ role: 'user', content: userLine }],
      },
    };
  });

  process.stderr.write(`\n▸ submitting Anthropic batch (${requests.length} requests)...\n`);
  const batch = await submitBatch(ANTHROPIC_KEY, requests);
  process.stderr.write(`  batch id: ${batch.id}\n`);
  const ended = await pollBatch(ANTHROPIC_KEY, batch.id, {
    intervalMs: 5000,
    timeoutMs: 1_800_000,
    onTick: (b) => process.stderr.write(`  [poll] status=${b.processing_status} counts=${JSON.stringify(b.request_counts)}\n`),
  });
  const results = await getResults(ANTHROPIC_KEY, ended);

  return corpora.map((corpus, i) => {
    const result = results.get(`haiku_q${i}`);
    if (!result) return { corpus, ok: false, error: 'no-result-for-custom-id' };
    if (result.type !== 'succeeded') {
      return { corpus, ok: false, error: `${result.type}: ${JSON.stringify(result.error || {})}` };
    }
    const usage = result.message?.usage || {};
    const cost = (usage.input_tokens || 0) / 1e6 * 0.5 + (usage.output_tokens || 0) / 1e6 * 2.5;
    const text = textOf(result.message);
    const parsed = parseAndValidate(text);
    if (!parsed.ok) return { corpus, ok: false, error: parsed.error, raw: parsed.raw, cost };
    return { corpus, ok: true, result: parsed.result, cost };
  }).reduce((acc, r, i) => { acc[i] = r; return acc; }, []);
}

// ── BASELINE gpt-5.4-mini via OpenRouter ──────────────────────────────────────
async function runBaselineOne(corpus) {
  const { prompt, userLine } = buildPrompt(corpus);
  const msgs = [
    { role: 'system', content: prompt },
    { role: 'user', content: userLine },
  ];
  let r;
  try {
    r = await callLLMStreaming(OPENROUTER_KEY, 'openai/gpt-5.4-mini', msgs, () => {}, { maxTokens: 16000 });
  } catch (err) {
    return { corpus, ok: false, error: String(err.message || err) };
  }
  const cost = Number.isFinite(r.usage?.cost) ? r.usage.cost : 0;
  const parsed = parseAndValidate(r.content);
  if (!parsed.ok) return { corpus, ok: false, error: parsed.error, raw: parsed.raw, cost };
  return { corpus, ok: true, result: parsed.result, cost };
}

const BASELINE_CONC = Number(process.env.BASELINE_CONC) || 6;

async function runBaselineBatch() {
  process.stderr.write(`\n▸ running gpt-5.4-mini baseline (${corpora.length} requests via OpenRouter, concurrency=${BASELINE_CONC})...\n`);
  const results = new Array(corpora.length);
  let cursor = 0, done = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= corpora.length) return;
      results[i] = await runBaselineOne(corpora[i]);
      process.stderr.write(`  [${++done}/${corpora.length}] ${corpora[i].query.slice(0, 40)} ${results[i].ok ? 'ok' : `FAILED: ${results[i].error}`}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BASELINE_CONC, corpora.length) }, () => worker()));
  return results;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const [haikuResults, baselineResults] = await Promise.all([runHaikuBatch(), runBaselineBatch()]);

const rows = [];
const dump = [];

function addModelResults(label, results) {
  for (const r of results) {
    const base = {
      query: r.corpus.query.slice(0, 24),
      model: label,
      ok:    r.ok ? '✓' : '✗',
      cost:  r.cost ? `$${r.cost.toFixed(4)}` : '$0',
    };
    if (!r.ok) {
      rows.push({ ...base, ERROR: (r.error || '').slice(0, 40) });
      dump.push({ ...base, error: r.error, raw: r.raw });
      continue;
    }
    const s = score(r.result, r.corpus);
    rows.push({ ...base, ...s });
    dump.push({
      ...base, ...s,
      products_full: (r.result?.products || []).map((p) => ({
        name: p.name, brand: p.brand, price: p.price, rating: p.rating,
        pros: p.pros || [], cons: p.cons || [], specs: p.specs || {},
        verdict: p.verdict || '', best_for: p.best_for || '',
      })),
      summary: r.result?.summary || '',
    });
  }
}

addModelResults('claude-haiku-4-5 (batch)', haikuResults);
addModelResults('gpt-5.4-mini', baselineResults);

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const OUT_PATH = process.env.OUT_FILE
  ? new URL(process.env.OUT_FILE, import.meta.url)
  : new URL('./results/synth-anthropic-batch.json', import.meta.url);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(dump, null, 2));

// Per-run table is unwieldy at 50 rows — just list failures + an ok/total count.
const failed = rows.filter((r) => r.ok !== '✓');
console.log(`\n══ FAILED RUNS (${failed.length}/${rows.length}) ══════════════════════════════════════════════════`);
for (const r of failed) {
  console.log(`  ✗ [${r.model}] ${r.query} — ${r.ERROR || 'unknown error'}`);
}
for (const label of [...new Set(rows.map((r) => r.model))]) {
  const modelRows = rows.filter((r) => r.model === label);
  const okCount = modelRows.filter((r) => r.ok === '✓').length;
  console.log(`  ${label}: ${okCount}/${modelRows.length} ok`);
}

// Aggregate per model
const byModel = {};
for (const r of rows) {
  const k = r.model;
  byModel[k] ??= { runs: 0, ok: 0, cost: 0, products: 0, name_ung: 0, num_ung: 0, pros: 0, cons: 0 };
  const b = byModel[k];
  b.runs++;
  if (r.ok === '✓') {
    b.ok++;
    b.cost += parseFloat((r.cost || '$0').replace(/[^0-9.]/g, ''));
    b.products += r.products || 0; b.name_ung += r.name_ung || 0; b.num_ung += r.num_ung || 0;
    b.pros += r.avg_pros || 0; b.cons += r.avg_cons || 0;
  }
}
const agg = Object.entries(byModel).map(([model, b]) => ({
  model,
  ok:           `${b.ok}/${b.runs}`,
  name_ung:     b.name_ung,
  num_ung:      b.num_ung,
  avg_products: b.ok ? Math.round(10 * b.products / b.ok) / 10 : '—',
  avg_pros:     b.ok ? Math.round(10 * b.pros / b.ok) / 10 : '—',
  avg_cons:     b.ok ? Math.round(10 * b.cons / b.ok) / 10 : '—',
  total_cost:   b.ok ? `$${b.cost.toFixed(4)}` : '—',
}));

console.log('\nAGGREGATE — lower name_ung/num_ung = more honest (fabrication gate)');
console.table(agg);
console.log(`\nfull outputs → ${OUT_PATH.pathname}`);
