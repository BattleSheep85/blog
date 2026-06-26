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

// ── A/B finalists ─────────────────────────────────────────────────────────────
// The 4 models now rotating live in research-worker.mjs. This run scores them
// head-to-head on the SAME corpus per query (the live A/B only assigns one model
// per job, so this controlled bench is the apples-to-apples comparison).
const CANDIDATES = [
  // aa_intel=40.0, ifb=0.733, 178tok/s, $0.047/synth | bench winner: most products, zero fab
  { label: 'gpt-5.4-mini',     model: 'openai/gpt-5.4-mini',            reasoning: undefined },
  // current planner — deepest pros/cons, zero fab, 8/8 reliable, $0.025/synth
  { label: 'gemini-flash',     model: 'google/gemini-2.5-flash',        reasoning: { effort: 'none' } },
  // aa_intel=37.0, ifb=0.812, 242tok/s, $0.039/synth | fastest, clean grounding
  { label: 'grok-4.20',        model: 'x-ai/grok-4.20',                 reasoning: undefined },
  // cheapest clean option, $0.008/synth, 7/8 reliable
  { label: 'flash-lite',       model: 'google/gemini-2.5-flash-lite',   reasoning: { effort: 'none' } },
];

// ── CORPUS ────────────────────────────────────────────────────────────────────
// Cached gather output. Re-gather with FRESH=1.
const CORPUS_PATH = process.env.CORPUS_FILE
  ? new URL(process.env.CORPUS_FILE, import.meta.url)
  : new URL('./results/corpus.json', import.meta.url);
// Default seed set. Override with QUERIES_FILE=<path> pointing at a JSON array of
// { q, facets, cat } — e.g. the top-50 real Google product searches harvested via
// the autocomplete suggest API (scripts/harvest-google.mjs).
const QUERIES = process.env.QUERIES_FILE
  ? JSON.parse(readFileSync(process.env.QUERIES_FILE, 'utf8'))
  : [
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
  // IMPORTANT: use gatherParallel (search + read + note), NOT runParallelEngine.
  // The full engine runs a synth pass (kimi-k2.6, the slowest model) we'd only
  // discard — corpus only needs sources+notes, which are synth-model-independent.
  // We also gather GATHER_CONC queries concurrently to cut wall-clock ~Nx.
  const cfg = { ...getTierConfig('full'), maxConcurrency: 6 };
  const GATHER_CONC = Number(process.env.GATHER_CONC) || 4;
  const todo = QUERIES.slice(0, MAX_QUERIES);
  corpora = [];
  let gIdx = 0, gDone = 0;
  async function gatherWorker() {
    for (;;) {
      const i = gIdx++;
      if (i >= todo.length) return;
      const { q, facets, cat } = todo[i];
      const t0 = Date.now();
      try {
        const r = await gatherParallel(q, cfg, KEY, { SERPER_API_KEY: SERPER }, () => {}, facets, cat, {});
        corpora.push({ query: q, facets, cat, sources: r.sources || [], notes: r.notes || [] });
        process.stderr.write(`  [${++gDone}/${todo.length}] ${q} → ${r.sources?.length || 0} sources, ${r.notes?.length || 0} notes (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
      } catch (err) {
        process.stderr.write(`  [${++gDone}/${todo.length}] ${q} FAILED: ${err.message}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: GATHER_CONC }, () => gatherWorker()));
  writeFileSync(CORPUS_PATH, JSON.stringify(corpora, null, 2));
  process.stderr.write(`cached ${corpora.length} corpora → ${CORPUS_PATH.pathname}\n`);
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
      // Full product objects so a downstream judge can verify grounding + quality
      // against the corpus (the regex metrics above are only a coarse proxy).
      products_full: (r.result?.products || []).map((p) => ({
        name: p.name, brand: p.brand, price: p.price, rating: p.rating,
        pros: p.pros || [], cons: p.cons || [], specs: p.specs || {},
        verdict: p.verdict || '', best_for: p.best_for || '',
      })),
      products_list: (r.result?.products || []).map((p) => ({
        name: p.name, rating: p.rating,
        pros: p.pros?.length, cons: p.cons?.length,
        verdict: (p.verdict || '').slice(0, 120),
      })),
      summary: r.result?.summary || '',
    });
  }
}

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const outPath = process.env.OUT_FILE
  ? new URL(process.env.OUT_FILE, import.meta.url)
  : new URL('./results/synth-v2.json', import.meta.url);
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
