// Unit coverage for worker/lib/ip-hash.js and ipRateKey in worker/lib/rate-limit.js
import { hashIp } from '../../worker/lib/ip-hash.js';
import { ipRateKey } from '../../worker/lib/rate-limit.js';

export async function runIpHashTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // ── hashIp: deterministic ──────────────────────────────────────────────────
  {
    const env = { IP_HASH_SALT: 'secret-salt-1' };
    const h1 = await hashIp('192.168.1.1', env);
    const h2 = await hashIp('192.168.1.1', env);
    eq('hashIp is deterministic for the same IP and salt', h1, h2);
    ok('hashIp returns a 64-char hex string', /^[0-9a-f]{64}$/.test(h1));
  }

  // ── hashIp: differs per salt ───────────────────────────────────────────────
  {
    const h1 = await hashIp('10.0.0.1', { IP_HASH_SALT: 'salt-a' });
    const h2 = await hashIp('10.0.0.1', { IP_HASH_SALT: 'salt-b' });
    ok('hashIp differs per salt', h1 !== h2);
  }

  // ── hashIp: differs per IP ─────────────────────────────────────────────────
  {
    const env = { IP_HASH_SALT: 'common-salt' };
    const h1 = await hashIp('1.1.1.1', env);
    const h2 = await hashIp('1.1.1.2', env);
    ok('hashIp differs per IP', h1 !== h2);
  }

  // ── hashIp: prefers IP_HASH_SALT over WORKER_SECRET ────────────────────────
  {
    const saltEnv = { IP_HASH_SALT: 'primary-salt' };
    const secretEnv = { WORKER_SECRET: 'backup-secret' };
    const bothEnv = { IP_HASH_SALT: 'primary-salt', WORKER_SECRET: 'backup-secret' };

    const hSalt = await hashIp('172.16.0.1', saltEnv);
    const hSecret = await hashIp('172.16.0.1', secretEnv);
    const hBoth = await hashIp('172.16.0.1', bothEnv);

    ok('primary salt differs from worker secret hash', hSalt !== hSecret);
    eq('hashIp prefers IP_HASH_SALT over WORKER_SECRET', hBoth, hSalt);

    // Also works with only WORKER_SECRET
    eq('hashIp accepts WORKER_SECRET when IP_HASH_SALT is missing', hSecret.length, 64);
  }

  // ── hashIp: throws with no salt ────────────────────────────────────────────
  {
    let threwEmpty = false;
    try {
      await hashIp('1.2.3.4', {});
    } catch (err) {
      threwEmpty = true;
      ok('error message mentions IP_HASH_SALT or WORKER_SECRET', /IP_HASH_SALT or WORKER_SECRET must be set/i.test(err.message));
    }
    ok('hashIp throws on empty env object', threwEmpty);

    let threwNull = false;
    try {
      await hashIp('1.2.3.4', null);
    } catch {
      threwNull = true;
    }
    ok('hashIp throws on null env', threwNull);

    let threwUndefined = false;
    try {
      await hashIp('1.2.3.4', undefined);
    } catch {
      threwUndefined = true;
    }
    ok('hashIp throws on undefined env', threwUndefined);
  }

  // ── ipRateKey: shape with valid salt ───────────────────────────────────────
  {
    const env = { IP_HASH_SALT: 'rate-limit-salt' };
    const key = await ipRateKey('research', '203.0.113.195', env);
    ok('ipRateKey starts with prefix:', key.startsWith('research:'));
    ok('ipRateKey does not contain raw IP', !key.includes('203.0.113.195'));
    ok('ipRateKey has no dotted IPv4 pattern', !/\d+\.\d+\.\d+\.\d+/.test(key));
    const parts = key.split(':');
    eq('ipRateKey format is prefix:hex', parts.length, 2);
    ok('ipRateKey hex is 64 characters', /^[0-9a-f]{64}$/.test(parts[1]));
  }

  // ── ipRateKey: degraded fallback when no salt is set ───────────────────────
  {
    const keyEmpty = await ipRateKey('verify', '198.51.100.42', {});
    eq('ipRateKey fallback on empty env returns raw IP key', keyEmpty, 'verify:198.51.100.42');

    const keyNull = await ipRateKey('auth', '198.51.100.43', null);
    eq('ipRateKey fallback on null env returns raw IP key', keyNull, 'auth:198.51.100.43');

    const keyUndefined = await ipRateKey('chat', '198.51.100.44', undefined);
    eq('ipRateKey fallback on undefined env returns raw IP key', keyUndefined, 'chat:198.51.100.44');
  }

  return report;
}
