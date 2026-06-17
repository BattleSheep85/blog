#!/usr/bin/env node
// GLM-5.2 planner skepticism probe (2026-06-17). The planner's key axis is
// BS-detection: does it correctly flag marketing/affiliate/hype as untrustworthy
// while NOT nuking genuine hands-on/community evidence? gemini-2.5-flash is the
// incumbent. GLM-5.2 is a reasoning model, so tested reasoning-OFF (fair for a
// fast structured task) + reasoning-ON (to surface the starve-the-budget gotcha).
// Prompt + tasks copied verbatim from harness.mjs.
//
//   node benchmarks/glm52-planner-skep.mjs

import { readFileSync } from 'node:fs';
function readEnv(p) { const o = {}; try { for (const l of readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } } catch {} return o; }
const KEY = readEnv('.dev.vars').OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('no key'); process.exit(1); }

const SKEP_PROMPT = `You are the research planner for an HONEST product-research tool. You judge whether a source or claim is TRUSTWORTHY independent evidence. Do NOT be fooled by marketing language, hype, affiliate-conflicted reviews, sponsored content, manufacturer self-promotion, astroturfing, or impossible/too-good-to-be-true claims.
For the single item below, output ONLY JSON: {"credible": true|false, "reason": "<short>"}.
credible=true ONLY if a careful researcher would treat it as genuine independent evidence (real hands-on testing; independent expert review with balanced pros AND cons; or genuine, specific, balanced user reports).
credible=false if it is marketing/hype, affiliate-conflicted, sponsored, manufacturer self-promotion, astroturf/shill, fabricated, or makes impossible / zero-downside / too-good-to-be-true claims.`;

const TASKS = [
  { credible: false, text: 'Top 10 Best Blenders of 2026 (As an Amazon Associate we earn from qualifying purchases.) Our #1 pick: the BlendMax Pro — simply the best blender money can buy. Buy it with our link today!' },
  { credible: true, text: 'RTINGS lab review: we tested 47 monitors in a controlled setup, measuring response time, color accuracy (Delta-E), and peak brightness over 80 hours each. The Dell S2725QC scored best for color accuracy (Delta-E 1.2) but has mediocre HDR (only 350 nits).' },
  { credible: false, text: "From Acme Inc.'s official product page: 'The Acme X1 is the world's most advanced vacuum, rated #1 by customers everywhere. Revolutionary, game-changing suction.'" },
  { credible: false, text: 'The HyperSonic Quantum Earbuds Pro Max 9000 use patented neutrino-cancellation to deliver lossless telepathic audio with a 30-day battery and zero latency across any distance.' },
  { credible: false, text: 'OMG this air fryer literally CHANGED MY LIFE!!! 10/10 ABSOLUTELY PERFECT, you NEED this, best purchase I have ever made, flawless, revolutionary, no downsides whatsoever!!!' },
  { credible: true, text: "Reddit r/BuyItForLife thread, 1,800 upvotes: a dozen long-time owners report their Lodge cast-iron skillet lasted 15+ years; several note the factory surface is rough and needs seasoning, and that it's heavy for some users." },
  { credible: false, text: '[Sponsored content, paid for by SodaStream] In our opinion SodaStream makes the best sparkling water machine — here is why you should buy one today.' },
  { credible: true, text: "Tom's Hardware review: the RTX 6070 is fast in raster but thermals are poor — it thermally throttles after ~20 minutes under load and the blower fan is audibly loud. Recommended only for well-ventilated cases." },
  { credible: false, text: 'Every single review site agrees the XYZ Smartwatch is literally perfect, with zero downsides and no flaws of any kind. There is universal consensus it is flawless.' },
  { credible: false, text: "Brand-new account, first-ever post: 'Just got the NovaPhone and it is AMAZING, way better than iPhone in every way, trust me — buy it now using my referral link for a discount!'" },
];

const CONFIGS = [
  { label: 'gemini-2.5-flash (incumbent)', model: 'google/gemini-2.5-flash', reasoning: undefined },
  { label: 'glm-5.2 (reasoning OFF)', model: 'z-ai/glm-5.2', reasoning: { enabled: false } },
  { label: 'glm-5.2 (reasoning ON)', model: 'z-ai/glm-5.2', reasoning: { enabled: true } },
];
const PRICE = { 'z-ai/glm-5.2': { in: 1.40e-6, out: 4.40e-6 }, 'google/gemini-2.5-flash': { in: 0.30e-6, out: 2.50e-6 } };

async function call(model, sys, user, reasoning) {
  const body = { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 400, usage: { include: true }, response_format: { type: 'json_object' } };
  if (reasoning !== undefined) body.reasoning = reasoning;
  const t0 = Date.now();
  let data = null, err = null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) });
    const t = await res.text(); if (!res.ok) err = `HTTP ${res.status}`; else data = JSON.parse(t);
  } catch (e) { err = e?.message || String(e); }
  const latencyMs = Date.now() - t0;
  let content = '', cost = 0;
  if (data) { const u = data.usage; content = data.choices?.[0]?.message?.content ?? ''; const p = PRICE[model] || { in: 0, out: 0 }; cost = (u?.prompt_tokens ?? 0) * p.in + (u?.completion_tokens ?? 0) * p.out; if (typeof u?.cost === 'number' && u.cost > 0) cost = u.cost; }
  return { content, cost, latencyMs, err };
}
function parse(c) { let t = (c || '').trim(); const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) t = f[1]; try { return JSON.parse(t); } catch {} const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} } return null; }
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const rows = [];
for (const cfg of CONFIGS) {
  process.stderr.write(`\n[${cfg.label}] `);
  const calls = await Promise.all(TASKS.map(async (t) => {
    const r = await call(cfg.model, SKEP_PROMPT, t.text, cfg.reasoning);
    const p = parse(r.content);
    const got = p && typeof p.credible === 'boolean' ? p.credible : null;
    process.stderr.write(r.err ? 'x' : (got === null ? '?' : '.'));
    return { correct: got === t.credible, got, isBS: t.credible === false, jsonValid: got !== null, cost: r.cost, latencyMs: r.latencyMs, err: r.err };
  }));
  const bs = calls.filter((c) => c.isBS), ctrl = calls.filter((c) => !c.isBS);
  rows.push({
    config: cfg.label,
    skep_acc: round(avg(calls.map((c) => (c.correct ? 1 : 0))), 3),
    BS_detect: round(avg(bs.map((c) => (c.correct ? 1 : 0))), 3),
    ctrl_acc: round(avg(ctrl.map((c) => (c.correct ? 1 : 0))), 3),
    json_rate: round(avg(calls.map((c) => (c.jsonValid ? 1 : 0))), 3),
    total_cost: round(calls.reduce((s, c) => s + c.cost, 0), 5),
    p50ms: Math.round(calls.map((c) => c.latencyMs).sort((a, b) => a - b)[Math.floor(calls.length / 2)]),
    err: calls.filter((c) => c.err).length,
  });
}
process.stderr.write('\n\n');
console.table(rows);
