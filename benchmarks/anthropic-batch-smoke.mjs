#!/usr/bin/env node
// anthropic-batch-smoke.mjs — smoke test for benchmarks/lib/anthropic-batch.mjs
// against Claude Haiku 4.5 via Anthropic's native Messages Batches API.
//
// Usage:
//   ANTHROPIC_API_KEY="$(bws secret get <id> | jq -r '.value')" \
//     node benchmarks/anthropic-batch-smoke.mjs

import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { submitBatch, pollBatch, getResults, textOf } from './lib/anthropic-batch.mjs';

// ── env ──────────────────────────────────────────────────────────────────────
function readEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* missing */ }
  return out;
}
const KEY = readEnvFile('.dev.vars').ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('need ANTHROPIC_API_KEY (inject from BWS)'); process.exit(1); }

// ── build requests ───────────────────────────────────────────────────────────
const MODEL = 'claude-haiku-4-5';
const requests = [
  { custom_id: 'q1', params: { model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }] } },
  { custom_id: 'q2', params: { model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'What is 17 + 25? Reply with only the number.' }] } },
];

// ── submit + poll + fetch ────────────────────────────────────────────────────
const batch = await submitBatch(KEY, requests);
console.log(`submitted batch ${batch.id} — initial status: ${batch.processing_status}`);

const ended = await pollBatch(KEY, batch.id, {
  intervalMs: 5000,
  timeoutMs: 300000,
  onTick: (b) => console.log(`  poll: status=${b.processing_status} counts=${JSON.stringify(b.request_counts)}`),
});
console.log(`batch ended — final status: ${ended.processing_status}`);

const results = await getResults(KEY, ended);

// ── report per-request results ───────────────────────────────────────────────
for (const customId of ['q1', 'q2']) {
  const result = results.get(customId);
  console.log(`\n[${customId}] type=${result?.type}`);
  if (result?.type === 'succeeded') {
    const { message } = result;
    console.log(`  model: ${message.model}`);
    console.log(`  text: ${textOf(message)}`);
    console.log(`  usage: ${JSON.stringify(message.usage)}`);
  } else {
    console.log(`  error: ${JSON.stringify(result?.error)}`);
  }
}

// ── assert + final line ──────────────────────────────────────────────────────
assert(results.get('q1')?.type === 'succeeded' && results.get('q2')?.type === 'succeeded', 'both requests must succeed');
assert(results.get('q1').message.model.startsWith('claude-haiku-4-5'), 'q1 model must be claude-haiku-4-5');

console.log('\n✅ Anthropic Batch API smoke test passed');
