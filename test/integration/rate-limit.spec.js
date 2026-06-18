// Integration coverage for worker/lib/rate-limit.js — the KV-backed sliding
// window, exercised against a real (in-memory Miniflare) KV namespace.
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../../worker/lib/rate-limit.js';

describe('checkRateLimit', () => {
  it('allows up to max, then blocks; reports remaining + resetAt', async () => {
    const ip = 'ip-' + Math.floor(Date.now()).toString(36);
    const r1 = await checkRateLimit(env.KV, ip, 2, 3600);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await checkRateLimit(env.KV, ip, 2, 3600);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = await checkRateLimit(env.KV, ip, 2, 3600);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.resetAt).toBeGreaterThan(Date.now());
  });

  it('separate IPs have independent windows', async () => {
    const a = await checkRateLimit(env.KV, 'ip-A', 1, 3600);
    const b = await checkRateLimit(env.KV, 'ip-B', 1, 3600);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
