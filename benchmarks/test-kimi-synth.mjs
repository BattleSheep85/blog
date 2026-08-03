#!/usr/bin/env node
// Isolate the synth failure: call Kimi K2.6 with a real synthesis prompt both
// streaming (what the engine uses) and non-streaming, and inspect raw output.
import { readFileSync } from 'node:fs';
import { callLLM, callLLMStreaming } from '../worker/engine/llm.js';
import { buildSynthesisPrompt } from '../worker/engine/prompts.js';
import { SYNTH_SCENARIOS } from './synth-fixture.mjs';
import { ENGINE_CONFIG } from '../worker/lib/engine-config.js';

const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const KEY = e.OPENROUTER_API_KEY;
const sc = SYNTH_SCENARIOS[0];
const config = ENGINE_CONFIG;
const prompt = buildSynthesisPrompt(sc.query, sc.notes, sc.sources, config, sc.facets, sc.topicalCategory, {});
const msgs = [{ role: 'system', content: prompt }, { role: 'user', content: `Write the research report for: "${sc.query}". Respond ONLY with valid JSON.` }];

console.log(`synth prompt length: ${prompt.length} chars\n`);

console.log('=== STREAMING (callLLMStreaming) ===');
try {
  const t0 = Date.now();
  const r = await callLLMStreaming(KEY, 'moonshotai/kimi-k2.6', msgs, () => {}, undefined);
  console.log(`  ${((Date.now()-t0)/1000).toFixed(1)}s  content=${r.content.length}ch  usage=${JSON.stringify(r.usage)}`);
  console.log(`  head: ${r.content.slice(0,160)}`);
} catch (err) { console.log('  THREW:', err.message); }

console.log('\n=== NON-STREAMING (callLLM) ===');
try {
  const t0 = Date.now();
  const r = await callLLM(KEY, 'moonshotai/kimi-k2.6', msgs, undefined, undefined);
  const c = r.choices?.[0]?.message?.content ?? '';
  console.log(`  ${((Date.now()-t0)/1000).toFixed(1)}s  content=${c.length}ch  finish=${r.choices?.[0]?.finish_reason}  usage=${JSON.stringify(r.usage)}`);
  console.log(`  head: ${c.slice(0,160)}`);
  if (r.choices?.[0]?.message?.reasoning) console.log(`  NOTE: response has a 'reasoning' field (${String(r.choices[0].message.reasoning).length}ch)`);
} catch (err) { console.log('  THREW:', err.message); }