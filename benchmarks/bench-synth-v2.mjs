#!/usr/bin/env node
// bench-synth-v2.mjs — synth model shootout: quality + speed + cost
//
// Reuses the cached corpus (benchmarks/results/corpus.json) so gather = $0.
// Edit CANDIDATES, run, get a table. No Serper quota burned.
//
// Usage:
//   node benchmarks/bench-synth-v2.mjs            # use cached corpus
//   FRESH=1 node benchmarks/bench-synth-v2.mjs    # re-gather first

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { callLLMStreaming } from '../worker/engine/llm.js';
import { validateResearchResult } from '../worker/engine/validate.js';
import { getTierConfig, PUBLIC_TIERS } from '../worker/lib/tiers.js';
import { gatherParallel, runParallelEngine } from '../worker/engine/parallel-engine.js';

// ── ENV ──────────────────────────────────────────────────────────────────────
const e = {};
for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim();
}
const KEY = e.OPENROUTER_API_KEY, SERPER = e.SERPER_API_KEY;
if (!KEY) { console.error('need OPENROUTER_API_KEY in .dev.vars'); process.exit(1); }

// ── CANDIDATES ────────────────────────────────────────────────────────────────
// AA leaderboard cross-referenced with OpenRouter availability (2026-06-25).
// Metrics: aa_intel = AA intelligence index | ifb = IFBench (JSON/instr-follow)
//          tok/s = AA output throughput | $/synth ≈ 15k prompt + 8k completion
//
// reasoning: {enabled:false} for models that think by default (kimi, deepseek-r1 variants)
// reasoning: {effort:'none'} for Gemini (disables optional thinking)
// reasoning: undefined      for models that don't support the param (Anthropic, Llama, etc.)

const CANDIDATES = [
  // ── prod baseline ──────────────────────────────────────────────────────────
  // aa_intel=42.8, ifb=0.760, 25tok/s, $0.038/synth | slow, ctx=262k
  { label: 'kimi-k2.6',       model: 'moonshotai/kimi-k2.6',           reasoning: { enabled: false } },

  // ── top by intelligence (AA) ───────────────────────────────────────────────
  // aa_intel=50.2, ifb=0.763, 216tok/s, $0.095/synth | mandatory reasoning — use low effort
  { label: 'gemini-3.5-flash', model: 'google/gemini-3.5-flash',        reasoning: { effort: 'low' } },
  // aa_intel=46.5, ifb=0.771, 140tok/s, $0.126/synth | mandatory reasoning — use low effort
  { label: 'gem-3.1-pro',      model: 'google/gemini-3.1-pro-preview',  reasoning: { effort: 'low' } },
  // aa_intel=46.0, ifb=0.805, 204tok/s, $0.049/synth | high ifb + fast + affordable
  { label: 'qwen3.7-max',      model: 'qwen/qwen3.7-max',               reasoning: { enabled: false } },
  // aa_intel=44.4, ifb=0.829, 76tok/s, $0.014/synth  | BEST ifbench; timed out 120s — SKIP for now
  // { label: 'minimax-m3',    model: 'minimax/minimax-m3',             reasoning: undefined },
  // aa_intel=44.3, ifb=0.765, 63tok/s, $0.014/synth  | near-kimi quality at 2.5x less
  { label: 'dsv4-pro',         model: 'deepseek/deepseek-v4-pro',       reasoning: { enabled: false } },

  // ── top by speed (>=100 tok/s, capable) ───────────────────────────────────
  // aa_intel=37.0, ifb=0.812, 242tok/s, $0.039/synth | fastest OR model; top ifb
  { label: 'grok-4.20',        model: 'x-ai/grok-4.20',                 reasoning: undefined },
  // aa_intel=37.8, ifb=0.780, 226tok/s, $0.032/synth | gemini-3 flash variant
  { label: 'gem-3-flash',      model: 'google/gemini-3-flash-preview',  reasoning: { effort: 'none' } },
  // aa_intel=40.3, ifb=0.792, 115tok/s, $0.003/synth | extreme value; 12x cheaper than kimi
  { label: 'dsv4-flash',       model: 'deepseek/deepseek-v4-flash',     reasoning: { enabled: false } },

  // ── best value (<$0.02/synth, intel>=38) ──────────────────────────────────
  // aa_intel=39.0, ifb=0.780, 50tok/s, $0.015/synth  | solid budget
  { label: 'qwen3.7-plus',     model: 'qwen/qwen3.7-plus',              reasoning: { enabled: false } },
  // aa_intel=38.2, ifb=0.759, 167tok/s, $0.013/synth | fast cheap; tau2 lower
  { label: 'gpt-5.4-nano',     model: 'openai/gpt-5.4-nano',            reasoning: undefined },
  // aa_intel=40.0, ifb=0.733, 178tok/s, $0.047/synth | mid-range openai
  { label: 'gpt-5.4-mini',     model: 'openai/gpt-5.4-mini',            reasoning: undefined },

  // ── OpenAI GPT-5.x full family ────────────────────────────────────────────
  { label: 'gpt-5.5',         model: 'openai/gpt-5.5',                  reasoning: undefined },           // $0.315/synth — top-tier quality check
  { label: 'gpt-5.5-pro',     model: 'openai/gpt-5.5-pro',              reasoning: undefined },           // $1.89/synth — ceiling reference only
  { label: 'gpt-5.4',         model: 'openai/gpt-5.4',                  reasoning: undefined },           // $0.158/synth — missed in first pass
  // ── current planner + classifier (free comparison points) ────────────────
  { label: 'gemini-flash',     model: 'google/gemini-2.5-flash',        reasoning: { effort: 'none' } }, // planner model today
  { label: 'flash-lite',       model: 'google/gemini-2.5-flash-lite',   reasoning: { effort: 'none' } }, // classifier model today
];

// ── CORPUS ────────────────────────────────────────────────────────────────────
// Cached gather output. Re-gather with FRESH=1.
const CORPUS_PATH = new URL('./results/corpus.json', import.meta.url);
const QUERIES = [
  { q: 'best wireless earbuds under $100',        facets: { is_buyable: true, sold_on_amazon: true, recency_sensitive: true }, cat: 'wireless earbuds' },
  { q: 'best robot vacuum for pet hair',          facets: { is_buyable: true, sold_on_amazon: true, recency_sensitive: true }, cat: 'robot vacuums' },
  { q: 'best standing desk for home office',      facets: { is_buyable: true, sold_on_amazon: true, recency_sensitive: true }, cat: 'standing desks' },
  { q: 'best self-hosted photo backup software',  facets: { is_buyable: false, sold_on_amazon: false, recency_sensitive: false }, cat: 'photo backup software' },
  { q: 'best budget espresso machine under $500', facets: { is_buyable: true, sold_on_amazon: true, recency_sensitive: true }, cat: 'espresso machines' },
];
// Limit to first N corpora for a quick run (set to Infinity for full run)
const MAX_QUERIES = Number(process.env.MAX_Q) || Infinity;

// ── GATHER (cached) ───────────────────────────────────────────────────────────
let corpora;
if (!process.env.FRESH && existsSync(CORPUS_PATH)) {
  corpora = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  // Use everything in the cache — the corpus covers more queries than our QUERIES list
  process.stderr.write(`using cached corpus (${corpora.length} entries)\n`);
} else {
  if (!SERPER) { console.error('need SERPER_API_KEY in .dev.vars for gather'); process.exit(1); }
  process.stderr.write('gathering fresh corpus (this costs Serper quota)...\n');
  const cfg = { ...getTierConfig('full'), maxConcurrency: 6 };
  corpora = [];
  for (const { q, facets, cat } of QUERIES) {
    process.stderr.write(`  gathering: ${q}\n`);
    try {
      const r = await runParallelEngine(q, cfg, KEY, { SERPER_API_KEY: SERPER }, () => {}, facets, cat, {});
      corpora.push({ query: q, facets, cat, sources: r.sources || [], notes: r.notes || [] });
      process.stderr.write(`    → ${r.sources?.length} sources, ${r.notes?.length} notes\n`);
    } catch (err) { process.stderr.write(`    FAILED: ${err.message}\n`); }
  }
  writeFileSync(CORPUS_PATH, JSON.stringify(corpora, null, 2));
  process.stderr.write(`cached → ${CORPUS_PATH.pathname}\n`);
}
corpora = corpora.slice(0, MAX_QUERIES).filter((c) => c.sources?.length);

// ── SCORING ───────────────────────────────────────────────────────────────────
// What we care about for a product-research synth:
//   grounding  — prices + specs + product names trace to source text (honesty gate)
//   recall     — how many distinct products were surfaced
//   richness   — avg pros+cons depth (signal quality for the reader)
//   json_ok    — did it parse and validate on first try?

const nums = (t) => {
  const out = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m;
  while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) out.push(n); }
  return out;
};
const close = (n, s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

function score(report, corpus) {
  const prods = report?.products || [];
  const srcText = [
    ...(corpus.sources || []).map((s) => `${s.title} ${s.content || ''}`),
    ...(corpus.notes || []).map((n) => n.content || ''),
  ].map(norm).join(' ');
  const srcNums = nums(srcText);

  let nameUngrounded = 0, numUngrounded = 0;
  for (const p of prods) {
    const n = norm(p.name || '');
    if (n.length >= 4 && !srcText.includes(n)) nameUngrounded++;
    if (typeof p.price === 'number' && !srcNums.some((s) => close(p.price, s))) numUngrounded++;
    for (const v of Object.values(p.specs || {})) {
      for (const x of nums(String(v))) { if (!srcNums.some((s) => close(x, s))) numUngrounded++; }
    }
  }
  const avg = (f) => prods.length ? Math.round(10 * prods.reduce((s, p) => s + f(p), 0) / prods.length) / 10 : 0;
  return {
    products:        prods.length,
    name_ung:        nameUngrounded,
    num_ung:         numUngrounded,
    avg_pros:        avg((p) => (p.pros || []).length),
    avg_cons:        avg((p) => (p.cons || []).length),
    has_verdict:     prods.filter((p) => (p.verdict || '').length > 20).length,
    has_rating:      prods.filter((p) => typeof p.rating === 'number').length,
  };
}

// ── SYNTH ─────────────────────────────────────────────────────────────────────
const cfg = getTierConfig('full');

async function runSynth(corpus, cand) {
  const prompt = buildSynthesisPrompt(corpus.query, corpus.notes, corpus.sources, cfg, corpus.facets, corpus.cat, {});
  const msgs = [
    { role: 'system', content: prompt },
    { role: 'user', content: `Write the research report for: "${corpus.query}". Respond ONLY with valid JSON.` },
  ];
  const t0 = Date.now();
  let content = '', cost = 0, firstTokenMs = null;
  try {
    const r = await callLLMStreaming(KEY, cand.model, msgs,
      (chunk, acc) => { if (firstTokenMs === null && acc.length > 0) firstTokenMs = Date.now() - t0; },
      { reasoning: cand.reasoning, maxTokens: 16000 },
    );
    content = r.content;
    if (Number.isFinite(r.usage?.cost)) cost = r.usage.cost;
  } catch (err) {
    return { ok: false, error: String(err.message || err), ms: Date.now() - t0, cost, ttft: firstTokenMs };
  }
  const ms = Date.now() - t0;
  const mm = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let parsed = null;
  try { parsed = JSON.parse((mm ? mm[1] : content).trim()); } catch {}
  if (!parsed) return { ok: false, error: 'json-parse-fail', ms, cost, ttft: firstTokenMs, raw: content.slice(0, 200) };
  try {
    const result = validateResearchResult(parsed);
    return { ok: true, result, ms, cost, ttft: firstTokenMs };
  } catch (err) {
    return { ok: false, error: `validate: ${err.message}`, ms, cost, ttft: firstTokenMs };
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const rows = [];
const dump = [];

for (const corpus of corpora) {
  process.stderr.write(`\n▸ ${corpus.query} (${corpus.sources.length} sources, ${corpus.notes.length} notes)\n`);
  // Run all candidates in parallel for this corpus (saves wall-clock per query)
  const results = await Promise.all(CANDIDATES.map(async (cand) => {
    process.stderr.write(`  → ${cand.label}...\n`);
    const r = await runSynth(corpus, cand);
    process.stderr.write(`    ${cand.label}: ${r.ok ? `ok, ${r.result?.products?.length}p` : r.error} (${r.ms}ms, $${(r.cost||0).toFixed(4)})\n`);
    return { cand, ...r };
  }));

  for (const r of results) {
    const base = {
      query:  corpus.query.slice(0, 24),
      model:  r.cand.label,
      ok:     r.ok ? '✓' : '✗',
      ms:     r.ms,
      ttft:   r.ttft ?? '—',
      cost_c: r.cost ? `$${(r.cost * 100).toFixed(3)}¢` : '$0',
    };
    if (!r.ok) {
      rows.push({ ...base, ERROR: r.error?.slice(0, 40) });
      dump.push({ ...base, error: r.error, raw: r.raw });
      continue;
    }
    const s = score(r.result, corpus);
    rows.push({ ...base, ...s });
    dump.push({
      ...base, ...s,
      products_list: (r.result?.products || []).map((p) => ({
        name: p.name, rating: p.rating,
        pros: p.pros?.length, cons: p.cons?.length,
        verdict: (p.verdict || '').slice(0, 120),
      })),
      summary: (r.result?.summary || '').slice(0, 200),
    });
  }
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const outPath = new URL('./results/synth-v2.json', import.meta.url);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(outPath, JSON.stringify(dump, null, 2));

console.log('\n══ PER-RUN RESULTS ══════════════════════════════════════════════════════════');
console.table(rows);

// Aggregate per model
const byModel = {};
for (const r of rows) {
  const k = r.model;
  byModel[k] ??= { runs: 0, ok: 0, ms: 0, cost: 0, products: 0, name_ung: 0, num_ung: 0, pros: 0, cons: 0, verdicts: 0 };
  const b = byModel[k];
  b.runs++;
  if (r.ok === '✓') {
    b.ok++; b.ms += r.ms; b.cost += parseFloat((r.cost_c||'$0').replace(/[^0-9.]/g,'')) / 100;
    b.products += r.products || 0; b.name_ung += r.name_ung || 0; b.num_ung += r.num_ung || 0;
    b.pros += r.avg_pros || 0; b.cons += r.avg_cons || 0; b.verdicts += r.has_verdict || 0;
  }
}
const agg = Object.entries(byModel).map(([model, b]) => ({
  model,
  ok:           `${b.ok}/${b.runs}`,
  avg_ms:       b.ok ? Math.round(b.ms / b.ok) : '—',
  total_cost:   b.ok ? `$${(b.cost).toFixed(4)}` : '—',
  avg_products: b.ok ? Math.round(10 * b.products / b.ok) / 10 : '—',
  name_ung:     b.name_ung,
  num_ung:      b.num_ung,
  avg_pros:     b.ok ? Math.round(10 * b.pros / b.ok) / 10 : '—',
  avg_cons:     b.ok ? Math.round(10 * b.cons / b.ok) / 10 : '—',
  verdicts:     b.verdicts,
}));

console.log('\n══ AGGREGATE PER MODEL (lower name_ung/num_ung = more honest) ═══════════════');
console.table(agg);
console.log(`\nfull outputs → ${outPath.pathname}`);
console.log('tip: jq \'.[] | select(.model=="kimi-k2.6") | .products_list\' benchmarks/results/synth-v2.json');
