// Unit coverage for worker/lib/burst-gate.js, the atomic burst gate layered
// in front of the KV hourly window (docs/rate-limit-design.md section 5.1).
// Uses hand-rolled fake limiters rather than Miniflare: the module only ever
// calls limiter.limit({ key }) and reads .success.
import { checkBurstGate, BURST_RESET_MS } from '../../worker/lib/burst-gate.js';

// A limiter that always answers `success`, and records every call it saw.
function fakeLimiter(success) {
  const calls = [];
  return {
    calls,
    async limit(opts) {
      calls.push(opts);
      return { success };
    },
  };
}

// A limiter whose limit() rejects. This is the binding-error path.
function throwingLimiter(message) {
  return { async limit() { throw new Error(message); } };
}

export async function runBurstGateTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, cond) => {
    if (cond) report.passed++; else { report.failed++; report.failures.push(`${name}: expected truthy`); }
  };

  // 1. Missing binding -> fail-open. Covers plain-Node runs and a config-only
  //    rollback that deletes [[ratelimits]] while the code stays deployed.
  {
    const undef = await checkBurstGate(undefined, 'research:1.2.3.4');
    eq('missing binding is allowed', undef.allowed, true);
    eq('missing binding has null remaining', undef.remaining, null);
    eq('missing binding has null resetAt', undef.resetAt, null);
    const nul = await checkBurstGate(null, 'research:1.2.3.4');
    eq('null binding is allowed', nul.allowed, true);
  }

  // 2. Binding-shaped object without .limit -> fail-open, never throws.
  {
    const res = await checkBurstGate({}, 'chat:1.2.3.4');
    eq('binding without limit() is allowed', res.allowed, true);
    const wrongType = await checkBurstGate({ limit: 'not-a-function' }, 'chat:1.2.3.4');
    eq('binding with a non-callable limit is allowed', wrongType.allowed, true);
  }

  // 3. success: true -> allowed with null numeric fields (call sites replace
  //    the whole result with the KV check, so the nulls are never read).
  {
    const res = await checkBurstGate(fakeLimiter(true), 'verify:1.2.3.4');
    eq('success:true allows', res.allowed, true);
    eq('success:true remaining is null', res.remaining, null);
    eq('success:true resetAt is null', res.resetAt, null);
  }

  // 4. success: false -> the BLOCK shape, matching checkRateLimit's contract
  //    with real numbers so the 429 + Retry-After branch works unchanged.
  {
    const before = Date.now();
    const res = await checkBurstGate(fakeLimiter(false), 'auth:1.2.3.4');
    const after = Date.now();
    eq('success:false blocks', res.allowed, false);
    eq('success:false remaining is 0', res.remaining, 0);
    ok('success:false resetAt is a number', typeof res.resetAt === 'number');
    ok('resetAt is at least now + one window', res.resetAt >= before + BURST_RESET_MS);
    ok('resetAt is at most now + one window (+ test drift)', res.resetAt <= after + BURST_RESET_MS);
    const retryAfter = Math.max(1, Math.ceil((res.resetAt - Date.now()) / 1000));
    ok('synthesized Retry-After is about 60s', retryAfter >= 55 && retryAfter <= 61);
  }

  // 5. A throwing binding fails OPEN and does not propagate. The KV layer
  //    behind the gate still enforces the hourly cap.
  {
    const res = await checkBurstGate(throwingLimiter('binding blew up'), 'research:5.6.7.8');
    eq('throwing binding is allowed', res.allowed, true);
    eq('throwing binding has null remaining', res.remaining, null);
  }

  // 6. The key reaches limit() unchanged, as { key }.
  {
    const limiter = fakeLimiter(true);
    await checkBurstGate(limiter, 'research:203.0.113.7');
    eq('limit() called exactly once', limiter.calls.length, 1);
    eq('key passed through unchanged', limiter.calls[0], { key: 'research:203.0.113.7' });
  }

  // 7. The window constant matches the wrangler.toml `period = 60` binding.
  eq('BURST_RESET_MS is one minute', BURST_RESET_MS, 60_000);

  // 8. The returned allow-path object is not shared mutable state: a caller
  //    that tries to mutate it cannot poison the next call.
  {
    const first = await checkBurstGate(undefined, 'chat:9.9.9.9');
    try { first.allowed = false; } catch { /* frozen literal, expected */ }
    const second = await checkBurstGate(undefined, 'chat:9.9.9.9');
    eq('allow result cannot be poisoned by a caller', second.allowed, true);
  }

  return report;
}
