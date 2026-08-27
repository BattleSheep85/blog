// Unit coverage for worker/lib/quota.js — per-IP lifetime free-tier counters.
// Uses a minimal in-memory KV shim (get/put only, matching the Cloudflare KV
// surface the module actually calls) rather than pulling in Miniflare.
import { getQuota, consumeQuota, quotaKey, FREE_SEARCHES, FREE_VERIFIES } from '../../worker/lib/quota.js';

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

  const fakeEnv = { IP_HASH_SALT: 'test-salt-secret-quota' };

  // Constants
  eq('FREE_SEARCHES is 5', FREE_SEARCHES, 5);
  eq('FREE_VERIFIES is 10', FREE_VERIFIES, 10);

  // getQuota: missing key -> used 0, remaining = limit
  {
    const kv = fakeKv();
    const q = await getQuota(kv, 'search', '1.2.3.4', fakeEnv);
    eq('getQuota missing key: used', q.used, 0);
    eq('getQuota missing key: limit', q.limit, FREE_SEARCHES);
    eq('getQuota missing key: remaining', q.remaining, FREE_SEARCHES);
  }

  // getQuota: verify kind uses FREE_VERIFIES
  {
    const kv = fakeKv();
    const q = await getQuota(kv, 'verify', '1.2.3.4', fakeEnv);
    eq('getQuota verify limit', q.limit, FREE_VERIFIES);
  }

  // consumeQuota increments the counter, isolated per (kind, ip)
  {
    const kv = fakeKv();
    await consumeQuota(kv, 'search', '5.6.7.8', fakeEnv);
    await consumeQuota(kv, 'search', '5.6.7.8', fakeEnv);
    const q = await getQuota(kv, 'search', '5.6.7.8', fakeEnv);
    eq('consumeQuota increments used', q.used, 2);
    eq('consumeQuota reduces remaining', q.remaining, FREE_SEARCHES - 2);

    const keys = Array.from(kv._store.keys());
    eq('stored key count', keys.length, 1);
    eq('stored key does not contain raw IP', keys[0].includes('5.6.7.8'), false);
    eq('stored key has no dotted IP address', /\d+\.\d+\.\d+\.\d+/.test(keys[0]), false);
    eq('stored key starts with quota:v2:search:', keys[0].startsWith('quota:v2:search:'), true);

    const other = await getQuota(kv, 'verify', '5.6.7.8', fakeEnv);
    eq('consumeQuota does not bleed across kinds for the same IP', other.used, 0);

    const otherIp = await getQuota(kv, 'search', '9.9.9.9', fakeEnv);
    eq('consumeQuota does not bleed across IPs', otherIp.used, 0);
  }

  // Exhausting the limit drives remaining to 0, never negative
  {
    const kv = fakeKv();
    for (let i = 0; i < FREE_SEARCHES + 3; i++) await consumeQuota(kv, 'search', '10.0.0.1', fakeEnv);
    const q = await getQuota(kv, 'search', '10.0.0.1', fakeEnv);
    eq('remaining never goes negative once over the limit', q.remaining, 0);
    eq('used keeps counting past the limit', q.used, FREE_SEARCHES + 3);
  }

  // Key hashing assertions: no dotted IP and different salts produce different keys
  {
    const key1 = await quotaKey('search', '1.2.3.4', { IP_HASH_SALT: 'salt-a' });
    const key2 = await quotaKey('search', '1.2.3.4', { IP_HASH_SALT: 'salt-b' });
    eq('two different salts produce different keys for the same IP', key1 !== key2, true);
    eq('key1 contains no dotted IP address', key1.includes('1.2.3.4'), false);
    eq('key2 contains no dotted IP address', key2.includes('1.2.3.4'), false);
    eq('key1 has no dotted IPv4 pattern', /\d+\.\d+\.\d+\.\d+/.test(key1), false);
    eq('key2 has no dotted IPv4 pattern', /\d+\.\d+\.\d+\.\d+/.test(key2), false);

    // Fallback on missing salt
    const keyFallback = await quotaKey('search', '1.2.3.4', {});
    eq('quotaKey falls back to raw IP when no salt', keyFallback, 'quota:v2:search:1.2.3.4');
  }

  return report;
}
