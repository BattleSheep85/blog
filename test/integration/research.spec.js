// Integration coverage for worker/handlers/research.js — the wallet-DoS
// velocity throttle on POST /api/research (2026-07-08). The shared
// MONTHLY_BUDGET_USD cap was the only backstop after the per-IP throttle was
// removed 2026-06-24, so one actor could drain the month and 503 everyone.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleStartResearch } from '../../worker/handlers/research.js';
import { checkRateLimit } from '../../worker/lib/rate-limit.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';
import { canonicalizeQuery } from '../../worker/lib/utils.js';
import { completeResearch, insertProductV2 } from './_helpers.js';

const SECRET = 'test-worker-secret-123';

beforeAll(async () => {
  await applySchema(env.DB);
  env.WORKER_SECRET = SECRET; // per-test isolated env; safe to set
  testEnv.WORKER_SECRET = SECRET;
});

const post = (query, ip, extra = {}, headers = {}) => new Request('https://chrisputer.tech/api/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...headers },
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

describe('handleStartResearch: forceFresh (internal benchmark bypass)', () => {
  it('bypasses canonical-query clustering only when X-Worker-Secret is valid', async () => {
    const seedId = generateId();
    const query = 'best wireless earbuds for running';
    const canonical = canonicalizeQuery(query);
    await insertResearch(env.DB, {
      id: seedId,
      slug: 's-' + seedId,
      query,
      canonicalQuery: canonical,
    });
    await completeResearch(env.DB, {
      id: seedId,
      status: 'complete',
      summary: 'Earbuds compared.',
      category: 'Audio',
      result: '{}',
      sources: '[]',
    });
    await insertProductV2(env.DB, { researchId: seedId, name: 'Runner Buds Pro', rank: 1 });

    // 1. Normal public POST returns cached/clustered result
    const resPublic = await handleStartResearch(
      post(query, '203.0.113.101'),
      testEnv,
    );
    expect(resPublic.status).toBe(200);
    const bodyPublic = await resPublic.json();
    expect(bodyPublic.cached).toBe(true);
    expect(bodyPublic.clustered).toBe(true);
    expect(bodyPublic.id).toBe(seedId);

    // 2. forceFresh: true with NO X-Worker-Secret header still returns clustered (flag ignored)
    const resNoAuth = await handleStartResearch(
      post(query, '203.0.113.102', { forceFresh: true }),
      testEnv,
    );
    expect(resNoAuth.status).toBe(200);
    const bodyNoAuth = await resNoAuth.json();
    expect(bodyNoAuth.cached).toBe(true);
    expect(bodyNoAuth.clustered).toBe(true);
    expect(bodyNoAuth.id).toBe(seedId);

    // 3. forceFresh: true with valid X-Worker-Secret starts a new run (not clustered)
    const resAuthed = await handleStartResearch(
      post(query, '203.0.113.103', { forceFresh: true }, { 'X-Worker-Secret': SECRET }),
      testEnv,
    );
    expect(resAuthed.status).toBe(200);
    const bodyAuthed = await resAuthed.json();
    expect(bodyAuthed.clustered).toBeFalsy();
    expect(bodyAuthed.status).toBe('pending');
    expect(bodyAuthed.id).not.toBe(seedId);

    // Assert a new research row exists in the database
    const newRow = await env.DB.prepare('SELECT * FROM research WHERE id = ?').bind(bodyAuthed.id).first();
    expect(newRow).toBeTruthy();
    expect(newRow.id).toBe(bodyAuthed.id);
    expect(newRow.status).toBe('pending');
  });
});

