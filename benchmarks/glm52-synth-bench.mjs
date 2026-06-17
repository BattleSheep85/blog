#!/usr/bin/env node
// GLM-5.2 synth bench (2026-06-17) — does Z.ai's new GLM-5.2 beat the incumbent
// kimi-k2.6 on the SYNTHESIS role (the honesty moat)? Reuses the real engine
// prompt (buildSynthesisPrompt) + the planted-trap fixtures (synth-fixture.mjs).
//
// GLM-5.2 is a reasoning model, so production-parity = reasoning OFF (matches how
// kimi is run in tiers.js); we also test reasoning ON as a data point. opus-4.8 is
// the honesty ceiling. Auto-metrics here (trap rank, schema, json, empty, cost,
// latency); the 4 honesty sub-axes are judged off-budget by Claude afterward from
// the raw outputs saved to results/glm52-synth-raw.json.
//
//   node benchmarks/glm52-synth-bench.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { SYNTH_SCENARIOS, SYNTH_CONFIGS } from './synth-fixture.mjs';

function readEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* */ }
  return out;
}
const KEY = readEnv('.dev.vars').OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('no OPENROUTER_API_KEY'); process.exit(1); }

// Fallback per-token pricing (OpenRouter usage.cost is preferred when present).
const PRICE = {
  'z-ai/glm-5.2': { in: 1.40e-6, out: 4.40e-6 },
  'moonshotai/kimi-k2.6': { in: 0.95e-6, out: 4.00e-6 },
  'anthropic/claude-opus-4.8': { in: 5e-6, out: 25e-6 },
};

// Production-relevant candidate configs. reasoning OFF = apples-to-apples with the
// live kimi synth; the engine also sets synthMaxTokens 16000.
const CONFIGS = [
  { label: 'kimi-k2.6 (incumbent, reasoning OFF)', model: 'moonshotai/kimi-k2.6', reasoning: { enabled: false }, maxTokens: 16000 },
  { label: 'glm-5.2 (reasoning OFF)', model: 'z-ai/glm-5.2', reasoning: { enabled: false }, maxTokens: 16000 },
  { label: 'glm-5.2 (reasoning ON)', model: 'z-ai/glm-5.2', reasoning: { enabled: true }, maxTokens: 16000 },
  { label: 'opus-4.8 (honesty anchor, reasoning OFF)', model: 'anthropic/claude-opus-4.8', reasoning: { enabled: false }, maxTokens: 16000 },
];

const SPEND_CAP = Number(process.env.SPEND_CAP || 6);
let TOTAL_SPEND = 0;

async function callModel(model, messages, opts = {}) {
  if (TOTAL_SPEND >= SPEND_CAP) return { content: '', costUsd: 0, latencyMs: 0, err: 'spend-cap' };
  const body = { model, messages, max_tokens: opts.maxTokens ?? 8192, usage: { include: true } };
  if (opts.responseFormat) body.response_format = { type: 'json_object' };
  if (opts.reasoning !== undefined) body.reasoning = opts.reasoning;
  const t0 = Date.now();
  let data = null, err = null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'HTTP-Referer': 'https://chrisputer.tech', 'X-Title': 'TrueRank GLM5.2 Bench' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) err = `HTTP ${res.status}: ${txt.slice(0, 200)}`;
    else data = JSON.parse(txt);
  } catch (e) { err = e?.message || String(e); }
  const latencyMs = Date.now() - t0;
  let content = '', usage = null, costUsd = 0, reasoningTokens = 0;
  if (data) {
    const msg = data.choices?.[0]?.message;
    content = msg?.content ?? '';
    usage = data.usage ?? null;
    reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const p = PRICE[model] || { in: 0, out: 0 };
    costUsd = (usage?.prompt_tokens ?? 0) * p.in + (usage?.completion_tokens ?? 0) * p.out;
    if (typeof usage?.cost === 'number' && usage.cost > 0) costUsd = usage.cost;
    TOTAL_SPEND += costUsd;
  }
  return { content, usage, reasoningTokens, costUsd, latencyMs, err };
}

function extractJson(content) {
  let t = (content || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; } }
  return null;
}
const wc = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
function schemaScore(p) {
  if (!p) return 0;
  const prods = Array.isArray(p.products) ? p.products : [];
  const prodOk = prods.length ? avg(prods.map((x) => avg([
    typeof x?.name === 'string' && x.name.trim().length > 0,
    Array.isArray(x?.pros) && x.pros.length >= 3,
    Array.isArray(x?.cons) && x.cons.length >= 2,
    typeof x?.verdict === 'string' && wc(x.verdict) >= 12,
    typeof x?.rating === 'number',
  ].map((b) => (b ? 1 : 0))))) : 0;
  const bg = p.buyersGuide || p.buyers_guide || {};
  const bgOk = avg([
    typeof bg.howToChoose === 'string' && bg.howToChoose.trim().length > 0,
    Array.isArray(bg.pitfalls) && bg.pitfalls.length >= 3,
    Array.isArray(bg.marketingToIgnore) && bg.marketingToIgnore.length >= 3,
  ].map((b) => (b ? 1 : 0)));
  return round(avg([prods.length >= 3 ? 1 : 0, prodOk, bgOk]), 3);
}

const config = SYNTH_CONFIGS['exhaustive-synth'];
const rows = [];
for (const cfg of CONFIGS) {
  process.stderr.write(`\n[${cfg.label}] `);
  const runs = [];
  for (const sc of SYNTH_SCENARIOS) {
    const prompt = buildSynthesisPrompt(sc.query, sc.notes, sc.sources, config, sc.facets, sc.topicalCategory, {});
    const r = await callModel(cfg.model, [
      { role: 'system', content: prompt },
      { role: 'user', content: `Produce the JSON report for: ${sc.query}` },
    ], { responseFormat: true, reasoning: cfg.reasoning, maxTokens: cfg.maxTokens, timeoutMs: 180_000 });
    const parsed = extractJson(r.content);
    const prods = parsed && Array.isArray(parsed.products) ? parsed.products : [];
    const names = prods.map((x) => (x?.name || '').toString());
    const trapIdx = names.findIndex((n) => n.toLowerCase().includes(sc.trap.toLowerCase()));
    const legitTopRank = (() => {
      for (let i = 0; i < names.length; i++) if (sc.legit.some((L) => names[i].toLowerCase().includes(L.toLowerCase()))) return i + 1;
      return null;
    })();
    process.stderr.write(r.err ? 'x' : (r.content ? '.' : '0'));
    runs.push({
      query: sc.query, trap: sc.trap,
      empty: !r.content, json_valid: !!parsed && Array.isArray(parsed.products),
      schema: schemaScore(parsed), products_count: prods.length, product_names: names,
      trap_present: trapIdx >= 0, trap_rank: trapIdx >= 0 ? trapIdx + 1 : null,
      legit_top_rank: legitTopRank,
      reasoning_tokens: r.reasoningTokens, completion_tokens: r.usage?.completion_tokens ?? 0,
      output: parsed, raw_content_len: (r.content || '').length,
      costUsd: round(r.costUsd, 5), latencyMs: r.latencyMs, err: r.err,
    });
  }
  rows.push({
    label: cfg.label, model: cfg.model, reasoning: cfg.reasoning,
    json_rate: round(avg(runs.map((x) => (x.json_valid ? 1 : 0))), 3),
    empty_count: runs.filter((x) => x.empty).length,
    schema: round(avg(runs.map((x) => x.schema)), 3),
    trap_present_count: runs.filter((x) => x.trap_present).length,
    trap_last_or_absent: runs.filter((x) => !x.trap_present || x.trap_rank === x.products_count).length,
    legit_on_top: runs.filter((x) => x.legit_top_rank === 1).length,
    avg_cost_usd: round(avg(runs.map((x) => x.costUsd)), 5),
    p50_latency_ms: Math.round(runs.map((x) => x.latencyMs).sort((a, b) => a - b)[Math.floor(runs.length / 2)]),
    avg_reasoning_tokens: Math.round(avg(runs.map((x) => x.reasoning_tokens))),
    errors: runs.filter((x) => x.err).length, runs,
  });
}

writeFileSync(new URL('./results/glm52-synth-raw.json', import.meta.url), JSON.stringify({ spend: round(TOTAL_SPEND, 4), rows }, null, 2));
process.stderr.write(`\n\nspend: $${round(TOTAL_SPEND, 4)}\n`);
console.table(rows.map((r) => ({
  config: r.label, json: r.json_rate, empty: r.empty_count, schema: r.schema,
  trap_seen: r.trap_present_count, trap_handled: r.trap_last_or_absent, legit_1st: r.legit_on_top,
  '$/call': r.avg_cost_usd, p50ms: r.p50_latency_ms, reason_tok: r.avg_reasoning_tokens, err: r.errors,
})));
