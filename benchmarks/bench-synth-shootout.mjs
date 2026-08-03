#!/usr/bin/env node
// SYNTH SHOOTOUT — the "use ML where we can" benchmark.
// Phase 1: live-gather real {sources,notes} for N diverse queries (cached to disk so
//          synth candidates run on the SAME corpus without re-paying for the gather).
// Phase 2: run synthesis on each corpus with the pure-ML extraction engine (free,
//          instant) AND every fitting LLM candidate; collect auto-metrics + dump the
//          full outputs for adversarial honesty/quality judging.
//
//   node benchmarks/bench-synth-shootout.mjs          # gather (if no cache) + shootout
//   FRESH=1 node benchmarks/bench-synth-shootout.mjs  # force re-gather
//
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { runParallelEngine } from '../worker/engine/parallel-engine.js';
import { synthesizeExtractive } from '../worker/engine/extract/index.js';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { callLLMStreaming } from '../worker/engine/llm.js';
import { validateResearchResult } from '../worker/engine/validate.js';
import { ENGINE_CONFIG } from '../worker/lib/engine-config.js';

const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const KEY = e.OPENROUTER_API_KEY, SERPER = e.SERPER_API_KEY;
if (!KEY || !SERPER) { console.error('need OPENROUTER_API_KEY + SERPER_API_KEY in .dev.vars'); process.exit(1); }
const dir = new URL('./results/', import.meta.url);
try { mkdirSync(dir, { recursive: true }); } catch {}
const CORPUS = new URL('./results/corpus.json', import.meta.url);

const F = { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true };
const QUERIES = [
  { q: 'best wireless earbuds under $100', facets: F, cat: 'wireless earbuds' },
  { q: 'best linen shirts for men', facets: { ...F, recency_sensitive: false }, cat: "men's linen shirts" },
  { q: 'best self-hosted photo backup software', facets: { ...F, sold_on_amazon: false }, cat: 'photo backup software' },
  { q: 'best robot vacuum for pet hair', facets: F, cat: 'robot vacuums' },
  { q: 'best mechanical keyboard for programming', facets: F, cat: 'mechanical keyboards' },
  { q: 'best standing desk for a home office', facets: F, cat: 'standing desks' },
  { q: 'best budget espresso machine under $500', facets: F, cat: 'espresso machines' },
  { q: 'best running shoes for flat feet', facets: { ...F, recency_sensitive: false }, cat: 'running shoes' },
];

// Synth candidates. reasoning OFF = apples-to-apples with the live kimi synth.
const CANDS = [
  { label: 'ML-extraction', ml: true },
  { label: 'kimi-k2.6', model: 'moonshotai/kimi-k2.6', reasoning: { enabled: false } },
  { label: 'kimi-k2-thinking', model: 'moonshotai/kimi-k2-thinking', reasoning: { enabled: false } },
  { label: 'glm-5', model: 'z-ai/glm-5', reasoning: { enabled: false } },
  { label: 'glm-5.2', model: 'z-ai/glm-5.2', reasoning: { enabled: false } },
  { label: 'deepseek-v3.2', model: 'deepseek/deepseek-v3.2', reasoning: { enabled: false } },
  { label: 'qwen3-max', model: 'qwen/qwen3-max', reasoning: { enabled: false } },
];

// ── metrics helpers ──────────────────────────────────────────────────────────
const numbersIn = (t) => { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; };
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
const gNorm = (s) => String(s || '').toLowerCase().replace(/&#?[a-z0-9]+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
function metrics(report, corpus) {
  const prods = report.products || [];
  const srcNums = numbersIn((corpus.sources || []).map((s) => s.content || '').join(' '));
  let ungroundedNum = 0;
  for (const p of prods) {
    if (typeof p.price === 'number' && !grounded(p.price, srcNums)) ungroundedNum++;
    for (const v of Object.values(p.specs || {})) for (const n of numbersIn(String(v))) if (!grounded(n, srcNums)) ungroundedNum++;
  }
  // text groundedness: each product NAME must trace to source text (catches fabricated picks)
  const corpusText = ' ' + [...(corpus.sources || []).map((s) => `${s.title} ${s.content}`), ...(corpus.notes || []).map((n) => n.content)].map(gNorm).join(' ') + ' ';
  let nameUngrounded = 0;
  for (const p of prods) { const g = gNorm(p.name); if (g.length >= 4 && !corpusText.includes(g)) nameUngrounded++; }
  const avg = (f) => prods.length ? Math.round(10 * prods.reduce((s, p) => s + f(p), 0) / prods.length) / 10 : 0;
  return {
    products: prods.length,
    name_ungrounded: nameUngrounded,
    num_ungrounded: ungroundedNum,
    avg_pros: avg((p) => (p.pros || []).length),
    avg_cons: avg((p) => (p.cons || []).length),
    has_ratings: prods.filter((p) => typeof p.rating === 'number').length,
  };
}

async function llmSynth(corpus, cand, config) {
  const synthPrompt = buildSynthesisPrompt(corpus.query, corpus.notes, corpus.sources, config, corpus.facets, corpus.cat, {});
  const messages = [
    { role: 'system', content: synthPrompt },
    { role: 'user', content: `Write the research report for: "${corpus.query}". Respond ONLY with valid JSON.` },
  ];
  const t0 = Date.now();
  let content = '', cost = 0;
  try {
    const r = await callLLMStreaming(KEY, cand.model, messages, () => {}, { reasoning: cand.reasoning, maxTokens: 16000 });
    content = r.content; if (Number.isFinite(r.usage?.cost)) cost = r.usage.cost;
  } catch (err) { return { error: String(err.message || err), ms: Date.now() - t0 }; }
  const ms = Date.now() - t0;
  const mm = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let parsed = null; try { parsed = JSON.parse((mm ? mm[1] : content).trim()); } catch {}
  if (!parsed) return { error: 'unparseable-json', ms, cost, raw: content.slice(0, 160) };
  return { result: validateResearchResult(parsed), ms, cost };
}

// ── Phase 1: gather (cached) ─────────────────────────────────────────────────
let corpora;
if (!process.env.FRESH && existsSync(CORPUS)) {
  corpora = JSON.parse(readFileSync(CORPUS, 'utf8'));
  process.stderr.write(`loaded cached corpus (${corpora.length} queries)\n`);
} else {
  const cfg = { ...ENGINE_CONFIG, maxConcurrency: 6 };
  const gathered = [];
  for (const { q, facets, cat } of QUERIES) {
    process.stderr.write(`### gathering: ${q}\n`);
    try {
      const r = await runParallelEngine(q, cfg, KEY, { SERPER_API_KEY: SERPER }, async () => {}, facets, cat, {});
      gathered.push({ query: q, facets, cat, sources: r.sources || [], notes: r.notes || [], kimiBaseline: { products: (r.result?.products || []).map((p) => p.name), summary: r.result?.summary } });
      process.stderr.write(`   → ${r.sources?.length || 0} sources, ${r.notes?.length || 0} notes\n`);
    } catch (err) { process.stderr.write(`   gather FAILED: ${err.message}\n`); }
  }
  writeFileSync(CORPUS, JSON.stringify(gathered, null, 2));
  corpora = gathered;
  process.stderr.write(`cached corpus → results/corpus.json\n`);
}

// ── Phase 2: synth shootout ──────────────────────────────────────────────────
const cfg = ENGINE_CONFIG;
const rows = []; const dump = [];
for (const corpus of corpora) {
  if (!corpus.sources?.length) { process.stderr.write(`skip (no sources): ${corpus.query}\n`); continue; }
  process.stderr.write(`\n### synth: ${corpus.query} (${corpus.sources.length} sources)\n`);
  const outs = await Promise.all(CANDS.map(async (cand) => {
    if (cand.ml) { const t0 = Date.now(); const rep = synthesizeExtractive(corpus.query, corpus.notes, corpus.sources, corpus.facets, corpus.cat); return { cand, rep, ms: Date.now() - t0, cost: 0 }; }
    const r = await llmSynth(corpus, cand, cfg);
    return { cand, rep: r.result, ms: r.ms, cost: r.cost, error: r.error, raw: r.raw };
  }));
  for (const o of outs) {
    const base = { query: corpus.query.slice(0, 26), model: o.cand.label, ms: o.ms, cost: o.cost ? Math.round(o.cost * 1e4) / 1e4 : 0 };
    if (o.error || !o.rep) { rows.push({ ...base, ERROR: o.error || 'no-output' }); dump.push({ ...base, error: o.error, raw: o.raw }); continue; }
    const m = metrics(o.rep, corpus);
    rows.push({ ...base, ...m });
    dump.push({ query: corpus.query, model: o.cand.label, ms: o.ms, cost: base.cost, ...m, products: (o.rep.products || []).map((p) => ({ name: p.name, rating: p.rating, pros: p.pros, cons: p.cons, verdict: (p.verdict || '').slice(0, 200) })), summary: (o.rep.summary || '').slice(0, 300) });
  }
}

writeFileSync(new URL('./results/synth-shootout.json', import.meta.url), JSON.stringify(dump, null, 2));
console.log('\n=== SYNTH SHOOTOUT (ML extraction vs LLM candidates on identical real sources) ===');
console.table(rows);
// aggregate per model
const byModel = {};
for (const r of rows) { if (r.ERROR) continue; const k = r.model; (byModel[k] ??= { n: 0, ms: 0, cost: 0, prod: 0, nameUng: 0, numUng: 0, pros: 0, cons: 0 }); const b = byModel[k]; b.n++; b.ms += r.ms; b.cost += r.cost; b.prod += r.products; b.nameUng += r.name_ungrounded; b.numUng += r.num_ungrounded; b.pros += r.avg_pros; b.cons += r.avg_cons; }
const agg = Object.entries(byModel).map(([model, b]) => ({ model, runs: b.n, avg_ms: Math.round(b.ms / b.n), total_cost: Math.round(b.cost * 1e4) / 1e4, avg_products: Math.round(10 * b.prod / b.n) / 10, name_ungrounded: b.nameUng, num_ungrounded: b.numUng, avg_pros: Math.round(10 * b.pros / b.n) / 10, avg_cons: Math.round(10 * b.cons / b.n) / 10 }));
console.log('\n=== AGGREGATE per model ===');
console.table(agg);
console.log('\nfull outputs → results/synth-shootout.json (for honesty/quality judging)');
