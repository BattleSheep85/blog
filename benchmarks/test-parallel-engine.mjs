#!/usr/bin/env node
// Local smoke test for the parallel engine. Runs the real decompose → fan-out →
// synthesize flow against live OpenRouter + Serper (keys from .dev.vars) and
// reports wall-clock, sources, notes, cost, and the ranked product names.
//   node benchmarks/test-parallel-engine.mjs "best ergonomic office chair under 400"

import { readFileSync } from 'node:fs';
import { runParallelEngine } from '../worker/engine/parallel-engine.js';
import { getTierConfig } from '../worker/lib/tiers.js';

function env(path) {
  const out = {};
  for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const e = env('.dev.vars');
const OPENROUTER_API_KEY = e.OPENROUTER_API_KEY;
const SERPER_API_KEY = e.SERPER_API_KEY;

const query = process.argv[2] || 'best ergonomic office chair under 400';
const config = { ...getTierConfig('full'), maxConcurrency: 6 };
const facets = { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true };

let events = 0;
const onEvent = async (type, msg) => { events++; process.stderr.write(`  [${type}] ${msg}\n`); };

console.log(`\n=== parallel engine: "${query}" (synth=${config.synthModel}) ===\n`);
const t0 = Date.now();
try {
  const r = await runParallelEngine(query, config, OPENROUTER_API_KEY, { SERPER_API_KEY }, onEvent, facets, query.replace(/^best /, ''), {});
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== RESULT (${secs}s wall-clock, $${r.totalCostUsd.toFixed(4)}, ${events} events) ===`);
  console.log(`sources: ${r.sources.length}  notes: ${r.notes.length}  synthModel: ${r.synthModel}`);
  console.log(`products (${r.result.products.length}):`);
  for (const [i, p] of r.result.products.entries()) {
    console.log(`  ${i + 1}. ${p.name}  [$${p.price ?? '?'}, ${p.pros?.length ?? 0} pros / ${p.cons?.length ?? 0} cons]`);
  }
  const bg = r.result.buyersGuide || {};
  console.log(`buyersGuide: howToChoose=${(bg.howToChoose || '').length}ch, pitfalls=${bg.pitfalls?.length ?? 0}, marketingToIgnore=${bg.marketingToIgnore?.length ?? 0}`);
} catch (err) {
  console.error(`\nFAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, err);
  process.exit(1);
}
