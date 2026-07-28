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

// Stub the queue for every case in this file. A real send auto-delivers to the
// worker's queue() handler, which claims the row and runs the FULL research
// pipeline against the live keys vitest loads from .dev.vars (real spend), and
// it races the isolated per-file storage stack (the "Failed to pop isolated
// storage stack frame" teardown error). Same stub as verify-route.spec.js.
const testEnv = { ...env, RESEARCH_QUEUE: { send: async () => {} } };

describe('handleStartResearch — wallet-DoS velocity throttle', () => {
  it('returns 429 + Retry-After once the per-IP hourly new-run cap (20) is hit', async () => {
    const ip = '203.0.113.7';
    // Pre-fill the SAME limiter key the handler uses so the next new run trips it.
    for (let i = 0; i < 20; i++) await checkRateLimit(env.KV, `research:${ip}`, 20, 3600);

    const res = await handleStartResearch(
      post('best over-ear headphones for a quiet office', ip, { fresh: true }),
      testEnv,
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
      testEnv,
    );
    expect(res.status).not.toBe(429);
  });
});

// The KV window above is read-then-write, so N concurrent requests all read the
// same pre-write state and all pass. That is the burst hole in docs/rate-limit-design.md
// section 1.4. The RL_BURST binding in front of it is atomic per colo, which for
// a per-IP key equals atomic per attacking source.
describe('handleStartResearch: concurrent burst gate', () => {
  const BURST_CEILING = 15; // binding limit 10, plus slack for its permissive counting

  it('admits far fewer than 30 parallel new runs from one IP', async () => {
    const ip = '203.0.113.20';
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => handleStartResearch(
        post(`best junk widget number ${i} for testing`, ip, { fresh: true }),
        testEnv,
      )),
    );

    const statuses = results.map((r) => r.status);
    const throttled = statuses.filter((s) => s === 429).length;
    const admitted = statuses.length - throttled;

    // Without the burst gate this admits all 30. That is the regression proof.
    expect(admitted).toBeLessThanOrEqual(BURST_CEILING);
    expect(throttled).toBeGreaterThanOrEqual(30 - BURST_CEILING);
  });

  it('answers a burst-blocked request with 429 + a ~60s Retry-After', async () => {
    const ip = '203.0.113.21';
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => handleStartResearch(
        post(`another junk widget number ${i} for testing`, ip, { fresh: true }),
        testEnv,
      )),
    );

    const blocked = results.find((r) => r.status === 429);
    expect(blocked).toBeTruthy();
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(55);
    expect(retryAfter).toBeLessThanOrEqual(61);
    const body = await blocked.json();
    expect(body.error).toMatch(/too many/i);
  });
});
