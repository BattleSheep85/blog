// Integration coverage for worker/handlers/research.js — the wallet-DoS
// velocity throttle on POST /api/research (2026-07-08). The shared
// MONTHLY_BUDGET_USD cap was the only backstop after the per-IP throttle was
// removed 2026-06-24, so one actor could drain the month and 503 everyone.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleStartResearch } from '../../worker/handlers/research.js';
import { checkRateLimit } from '../../worker/lib/rate-limit.js';

beforeAll(async () => {
  await applySchema(env.DB);
});

const post = (query, ip, extra = {}) => new Request('https://chrisputer.tech/api/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
  body: JSON.stringify({ query, ...extra }),
});

describe('handleStartResearch — wallet-DoS velocity throttle', () => {
  it('returns 429 + Retry-After once the per-IP hourly new-run cap (20) is hit', async () => {
    const ip = '203.0.113.7';
    // Pre-fill the SAME limiter key the handler uses so the next new run trips it.
    for (let i = 0; i < 20; i++) await checkRateLimit(env.KV, `research:${ip}`, 20, 3600);

    const res = await handleStartResearch(
      post('best over-ear headphones for a quiet office', ip, { fresh: true }),
      env,
    );

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
  });

  it('lets a fresh IP through the throttle (not 429)', async () => {
    // A never-seen IP is under the cap, so the throttle must NOT block it. It may
    // proceed to budget/enqueue and return any non-429 status.
    const res = await handleStartResearch(
      post('best mechanical keyboard for programmers', '203.0.113.9', { fresh: true }),
      env,
    );
    expect(res.status).not.toBe(429);
  });
});
