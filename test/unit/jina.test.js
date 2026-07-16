// Retry-on-429/5xx coverage for worker/lib/jina.js's fetchPageContent. Uses
// the injectable fetchImpl/sleepImpl opts (see jina.js) so this is a pure,
// network-free, wait-free unit test — no real timers, no real requests.
import { fetchPageContent } from '../../worker/lib/jina.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

// A fetchImpl stub that returns a scripted sequence of responses per call,
// keyed by URL host (r.jina.ai vs the direct-fetch fallback URL).
function scriptedFetch(jinaResponses, directResponse) {
  let jinaCall = 0;
  return async (url) => {
    if (url.startsWith('https://r.jina.ai/')) {
      const next = jinaResponses[jinaCall] ?? jinaResponses[jinaResponses.length - 1];
      jinaCall++;
      if (next instanceof Error) throw next;
      return next;
    }
    // Direct fallback request.
    if (directResponse instanceof Error) throw directResponse;
    return directResponse ?? jsonResponse(200, '<html><body>fallback body text here, long enough to pass the 100-char floor for real</body></html>');
  };
}

const noopSleep = async () => {}; // no-op sleep — test never actually waits

export async function runJinaTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  const longBody = 'x'.repeat(200); // > 100 chars so it passes the Jina body-length floor

  // ── first-try 200 → no retry, no fallback ──────────────────────────────
  {
    let calls = 0;
    const fetchImpl = async (url) => {
      calls++;
      ok('first-try 200: hits jina host', url.startsWith('https://r.jina.ai/'));
      return jsonResponse(200, longBody);
    };
    let slept = 0;
    const sleepImpl = async () => { slept++; };
    const result = await fetchPageContent('https://example.com/a', null, { fetchImpl, sleepImpl });
    eq('first-try 200: returns body', result, longBody);
    eq('first-try 200: exactly one fetch call', calls, 1);
    eq('first-try 200: never slept/retried', slept, 0);
  }

  // ── 429, 429, 200 → retries twice then succeeds, no fallback ───────────
  {
    let jinaCalls = 0;
    let directCalls = 0;
    let sleeps = [];
    const fetchImpl = async (url) => {
      if (url.startsWith('https://r.jina.ai/')) {
        jinaCalls++;
        if (jinaCalls <= 2) return jsonResponse(429, '');
        return jsonResponse(200, longBody);
      }
      directCalls++;
      return jsonResponse(200, '<html><body>should not be reached</body></html>');
    };
    const sleepImpl = async (ms) => { sleeps.push(ms); };
    const result = await fetchPageContent('https://example.com/b', 'test-key', { fetchImpl, sleepImpl });
    eq('429,429,200: returns the eventual 200 body', result, longBody);
    eq('429,429,200: three jina attempts', jinaCalls, 3);
    eq('429,429,200: retried exactly twice (slept twice)', sleeps.length, 2);
    ok('429,429,200: never fell through to direct fetch', directCalls === 0);
    ok('429,429,200: backoff increases (first < second)', sleeps[0] < sleeps[1]);
  }

  // ── persistent 429 → exhausts retries, falls back to direct fetch, never hangs ──
  {
    let jinaCalls = 0;
    let sleeps = 0;
    const fetchImpl = scriptedFetch(
      [jsonResponse(429, ''), jsonResponse(429, ''), jsonResponse(429, '')],
      jsonResponse(200, '<html><body>' + 'y'.repeat(150) + '</body></html>'),
    );
    const wrapped = async (url, init) => { if (url.startsWith('https://r.jina.ai/')) jinaCalls++; return fetchImpl(url, init); };
    const sleepImpl = async () => { sleeps++; };
    const result = await fetchPageContent('https://example.com/c', null, { fetchImpl: wrapped, sleepImpl });
    eq('persistent 429: capped at MAX_RETRIES+1 jina attempts', jinaCalls, 3); // 1 initial + 2 retries
    eq('persistent 429: slept for each retry (bounded, not hung)', sleeps, 2);
    ok('persistent 429: falls back to direct-fetch body (non-empty)', result.length > 0);
    ok('persistent 429: fallback content came from direct fetch', result.includes('yyyy'));
  }

  // ── persistent network error → retries, then falls back to empty on double failure ──
  {
    let jinaCalls = 0;
    const fetchImpl = async (url) => {
      if (url.startsWith('https://r.jina.ai/')) { jinaCalls++; throw new Error('network down'); }
      throw new Error('direct also down');
    };
    const sleepImpl = noopSleep;
    const result = await fetchPageContent('https://example.com/d', null, { fetchImpl, sleepImpl });
    eq('persistent network error: retried up to the cap', jinaCalls, 3);
    eq('persistent network error: never throws — resolves to empty string', result, '');
  }

  // ── 500 is retried like 429 ──────────────────────────────────────────────
  {
    let jinaCalls = 0;
    const fetchImpl = async (url) => {
      if (url.startsWith('https://r.jina.ai/')) {
        jinaCalls++;
        if (jinaCalls === 1) return jsonResponse(500, '');
        return jsonResponse(200, longBody);
      }
      return jsonResponse(200, '<html><body>fallback</body></html>');
    };
    const result = await fetchPageContent('https://example.com/e', null, { fetchImpl, sleepImpl: noopSleep });
    eq('5xx retried like 429: recovers on second attempt', result, longBody);
    eq('5xx retried like 429: two attempts', jinaCalls, 2);
  }

  // ── non-retryable 404 → falls through to direct fetch immediately, no retry ──
  {
    let jinaCalls = 0;
    let slept = 0;
    const fetchImpl = async (url) => {
      if (url.startsWith('https://r.jina.ai/')) { jinaCalls++; return jsonResponse(404, ''); }
      return jsonResponse(200, '<html><body>' + 'z'.repeat(150) + '</body></html>');
    };
    const sleepImpl = async () => { slept++; };
    const result = await fetchPageContent('https://example.com/f', null, { fetchImpl, sleepImpl });
    eq('404 is not retried: single jina attempt', jinaCalls, 1);
    eq('404 is not retried: no sleep/backoff', slept, 0);
    ok('404 falls back to direct fetch', result.includes('zzzz'));
  }

  return report;
}
