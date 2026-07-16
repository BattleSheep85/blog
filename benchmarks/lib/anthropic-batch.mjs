// anthropic-batch.mjs — zero-dep raw-fetch client for Anthropic's native
// Messages Batches API (https://api.anthropic.com/v1/messages/batches).
// 50% cheaper than the synchronous Messages endpoint; used by benchmark
// harnesses that need to score candidate models in bulk.
//
// Every request sends `x-api-key` + `anthropic-version: 2023-06-01`; POST
// requests also send `content-type: application/json`. The API key is
// passed as a function arg — this module never reads env itself.

const BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

function authHeaders(key) {
  return { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION };
}

async function throwOnError(res, context) {
  if (res.ok) return;
  const text = await res.text();
  throw new Error(`${context} failed: HTTP ${res.status} ${res.statusText} — ${text}`);
}

// Submit a batch of Messages requests. Each element of `requests` is
// { custom_id, params: { model, max_tokens, messages, ... } } — the caller
// shapes `params`, this function does not build it.
export async function submitBatch(key, requests) {
  const res = await fetch(`${BASE_URL}/v1/messages/batches`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  await throwOnError(res, 'submitBatch');
  return res.json();
}

// Fetch the current state of a batch by id.
export async function getBatch(key, id) {
  const res = await fetch(`${BASE_URL}/v1/messages/batches/${id}`, {
    headers: authHeaders(key),
  });
  await throwOnError(res, 'getBatch');
  return res.json();
}

// Poll getBatch until processing_status === 'ended', or throw on timeout.
// onTick(batch) is called after every poll (e.g. to log request_counts).
export async function pollBatch(key, id, { intervalMs = 5000, timeoutMs = 300000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const batch = await getBatch(key, id);
    if (onTick) onTick(batch);
    if (batch.processing_status === 'ended') return batch;
    if (Date.now() >= deadline) {
      throw new Error(`pollBatch timed out after ${timeoutMs}ms (batch ${id}, status=${batch.processing_status})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Fetch and parse the JSONL results for an ended batch. Returns a Map keyed
// by custom_id -> result object ({ type: 'succeeded'|'errored'|'canceled'|
// 'expired', message?, error? }). Results arrive unordered.
export async function getResults(key, batch) {
  const res = await fetch(batch.results_url, { headers: authHeaders(key) });
  await throwOnError(res, 'getResults');
  const body = await res.text();
  const results = new Map();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    results.set(row.custom_id, row.result);
  }
  return results;
}

// Concatenate the text of all text-type content blocks in a Messages response.
export function textOf(message) {
  const blocks = message?.content ?? [];
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
