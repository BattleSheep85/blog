// Unit coverage for worker/lib/quota.js — per-IP lifetime free-tier counters.
// Uses a minimal in-memory KV shim (get/put only, matching the Cloudflare KV
// surface the module actually calls) rather than pulling in Miniflare.
import { getQuota, consumeQuota, FREE_SEARCHES, FREE_VERIFIES } from '../../worker/lib/quota.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    _store: store,
  };
}

export async function runQuotaTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };

  // Constants
  eq('FREE_SEARCHES is 5', FREE_SEARCHES, 5);
  eq('FREE_VERIFIES is 10', FREE_VERIFIES, 10);

  // getQuota: missing key -> used 0, remaining = limit
  {
    const kv = fakeKv();
    const q = await getQuota(kv, 'search', '1.2.3.4');
    eq('getQuota missing key: used', q.used, 0);
    eq('getQuota missing key: limit', q.limit, FREE_SEARCHES);
    eq('getQuota missing key: remaining', q.remaining, FREE_SEARCHES);
  }

  // getQuota: verify kind uses FREE_VERIFIES
  {
    const kv = fakeKv();
    const q = await getQuota(kv, 'verify', '1.2.3.4');
    eq('getQuota verify limit', q.limit, FREE_VERIFIES);
  }

  // consumeQuota increments the counter, isolated per (kind, ip)
  {
    const kv = fakeKv();
    await consumeQuota(kv, 'search', '5.6.7.8');
    await consumeQuota(kv, 'search', '5.6.7.8');
    const q = await getQuota(kv, 'search', '5.6.7.8');
    eq('consumeQuota increments used', q.used, 2);
    eq('consumeQuota reduces remaining', q.remaining, FREE_SEARCHES - 2);

    const other = await getQuota(kv, 'verify', '5.6.7.8');
    eq('consumeQuota does not bleed across kinds for the same IP', other.used, 0);

    const otherIp = await getQuota(kv, 'search', '9.9.9.9');
    eq('consumeQuota does not bleed across IPs', otherIp.used, 0);
  }

  // Exhausting the limit drives remaining to 0, never negative
  {
    const kv = fakeKv();
    for (let i = 0; i < FREE_SEARCHES + 3; i++) await consumeQuota(kv, 'search', '10.0.0.1');
    const q = await getQuota(kv, 'search', '10.0.0.1');
    eq('remaining never goes negative once over the limit', q.remaining, 0);
    eq('used keeps counting past the limit', q.used, FREE_SEARCHES + 3);
  }

  return report;
}
