#!/usr/bin/env node
// PLANNER SHOOTOUT — which model best DRIVES the agent loop (tool routing → sources).
// Runs the full engine (search→read→note→synth) per planner candidate on a few
// queries; synth is held constant (kimi) so only the planner varies. Measures the
// thing AA's tau2 proxies: does it gather good sources efficiently, fast, cheap.
// A tool-calling probe up front skips any model that can't function-call.
//
//   node benchmarks/bench-planner.mjs
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runEngine } from '../worker/engine/engine.js';
import { callLLM } from '../worker/engine/llm.js';
import { ENGINE_CONFIG } from '../worker/lib/engine-config.js';

const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const KEY = e.OPENROUTER_API_KEY, SERPER = e.SERPER_API_KEY;
if (!KEY || !SERPER) { console.error('need keys in .dev.vars'); process.exit(1); }
try { mkdirSync(new URL('./results/', import.meta.url), { recursive: true }); } catch {}

const PLANNERS = [
  { label: 'gemini-2.5-flash (incumbent)', model: 'google/gemini-2.5-flash', reasoning: { effort: 'low' } },
  { label: 'gemini-3.5-flash', model: 'google/gemini-3.5-flash', reasoning: { effort: 'low' } },
  { label: 'glm-5-turbo', model: 'z-ai/glm-5-turbo', reasoning: { effort: 'low' } },
  { label: 'kimi-k2-thinking', model: 'moonshotai/kimi-k2-thinking', reasoning: { effort: 'low' } },
];
const F = { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true };
const QUERIES = [
  { q: 'best wireless earbuds under $100', facets: F, cat: 'wireless earbuds' },
  { q: 'best robot vacuum for pet hair', facets: F, cat: 'robot vacuums' },
  { q: 'best standing desk for a home office', facets: F, cat: 'standing desks' },
];

// ── tool-calling probe ──
const TOOL = [{ type: 'function', function: { name: 'ping', description: 'reply', parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } }];
async function canToolCall(p) {
  try {
    const r = await callLLM(KEY, p.model, [{ role: 'user', content: 'Call the ping tool with ok=true.' }], { tools: TOOL, reasoning: p.reasoning, maxTokens: 80, hardMsOverride: 30000 });
    const tc = r.choices?.[0]?.message?.tool_calls;
    return Array.isArray(tc) && tc.length > 0;
  } catch (err) { process.stderr.write(`  probe ${p.label}: ${err.message}\n`); return false; }
}

const rows = []; const dump = [];
process.stderr.write('=== tool-calling probe ===\n');
const ok = [];
for (const p of PLANNERS) { const c = await canToolCall(p); process.stderr.write(`  ${c ? 'OK  ' : 'SKIP'} ${p.label}\n`); if (c) ok.push(p); else rows.push({ planner: p.label, NOTE: 'no tool-calling — skipped' }); }

for (const p of ok) {
  for (const { q, facets, cat } of QUERIES) {
    process.stderr.write(`\n### ${p.label} :: ${q}\n`);
    const cfg = { ...ENGINE_CONFIG, plannerModel: p.model, plannerReasoning: p.reasoning, plannerProvider: null };
    const t0 = Date.now();
    try {
      const r = await runEngine(q, cfg, KEY, { SERPER_API_KEY: SERPER }, async () => {}, facets, cat, {});
      const ms = Date.now() - t0;
      const credible = (r.sources || []).filter((s) => (s.credibility?.score ?? 0) >= 45).length;
      rows.push({ planner: p.label, query: q.slice(0, 24), wall_s: Math.round(ms / 1000), sources: r.sources?.length || 0, credible_src: credible, notes: r.notes?.length || 0, products: r.result?.products?.length || 0, cost: Math.round((r.totalCostUsd || 0) * 1e4) / 1e4 });
      dump.push({ planner: p.label, query: q, ms, sources: r.sources?.length, products: (r.result?.products || []).map((x) => x.name) });
      process.stderr.write(`   → ${Math.round(ms / 1000)}s, ${r.sources?.length} src, ${r.result?.products?.length} products, $${(r.totalCostUsd || 0).toFixed(3)}\n`);
    } catch (err) { rows.push({ planner: p.label, query: q.slice(0, 24), ERROR: err.message }); process.stderr.write(`   FAILED: ${err.message}\n`); }
  }
}

writeFileSync(new URL('./results/planner-shootout.json', import.meta.url), JSON.stringify(dump, null, 2));
console.log('\n=== PLANNER SHOOTOUT (full agent loop; synth held constant) ===');
console.table(rows);
// aggregate
const by = {};
for (const r of rows) { if (r.ERROR || r.NOTE) continue; (by[r.planner] ??= { n: 0, s: 0, src: 0, cred: 0, prod: 0, cost: 0 }); const b = by[r.planner]; b.n++; b.s += r.wall_s; b.src += r.sources; b.cred += r.credible_src; b.prod += r.products; b.cost += r.cost; }
console.log('\n=== AGGREGATE per planner ===');
console.table(Object.entries(by).map(([planner, b]) => ({ planner, runs: b.n, avg_wall_s: Math.round(b.s / b.n), avg_sources: Math.round(b.src / b.n), avg_credible: Math.round(b.cred / b.n), avg_products: Math.round(10 * b.prod / b.n) / 10, total_cost: Math.round(b.cost * 1e4) / 1e4 })));
