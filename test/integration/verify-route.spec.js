// Integration coverage for worker/handlers/verify.js — POST /api/verify (new
// submission + needs_input resubmit) and GET /api/verify/:id. Mirrors
// test/integration/research.spec.js's D1/KV conventions.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleStartVerify, handleVerifyStatus } from '../../worker/handlers/verify.js';
import { generateId, getResearchById } from '../../worker/lib/db.js';

beforeAll(async () => {
  await applySchema(env.DB);
});

// The real RESEARCH_QUEUE binding auto-delivers to the worker's queue()
// handler in the background during a test run — which races the isolated
// storage stack this spec file gets for its own D1 instance (that consumer
// invocation runs against a *different* Miniflare storage snapshot that
// never had applySchema applied, corrupting the test-runner's storage
// teardown). Stub .send() to a no-op so these intake tests exercise the row
// insert/update + status contract without a real queue delivery firing.
// verify-orchestrator.js's actual persist behavior is covered directly by
// test/integration/verify.spec.js.
const testEnv = { ...env, RESEARCH_QUEUE: { send: async () => {} } };

const post = (body, ip = '203.0.113.50') => new Request('https://chrisputer.tech/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
  body: JSON.stringify(body),
});

describe('handleStartVerify — new submission', () => {
  it('creates a pending verification research row and enqueues', async () => {
    const res = await handleStartVerify(post({ product: 'Anker Soundcore Liberty 4 NC' }), testEnv);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('pending');
    expect(data.id).toBeTruthy();
    expect(data.slug).toBeTruthy();

    const row = await getResearchById(env.DB, data.id);
    expect(row).toBeTruthy();
    expect(row.status).toBe('pending');
    expect(row.kind).toBe('verification');
    expect(row.query).toBe('Anker Soundcore Liberty 4 NC');
    expect(row.subject_url).toBeNull();
  });

  it('stores subject_url when productUrl is supplied on the initial submission', async () => {
    const res = await handleStartVerify(post({
      product: 'Sony WH-1000XM5',
      productUrl: 'https://www.sony.com/wh-1000xm5',
    }, '203.0.113.51'), testEnv);
    expect(res.status).toBe(200);
    const data = await res.json();

    const row = await getResearchById(env.DB, data.id);
    expect(row.subject_url).toBe('https://www.sony.com/wh-1000xm5');
  });

  it('rejects a too-short product', async () => {
    const res = await handleStartVerify(post({ product: 'ab' }, '203.0.113.52'), testEnv);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid productUrl', async () => {
    const res = await handleStartVerify(post({
      product: 'Test Widget Pro',
      productUrl: 'not-a-url',
    }, '203.0.113.53'), testEnv);
    expect(res.status).toBe(400);
  });

  it('blocks a query that fails the content-safety screen', async () => {
    const res = await handleStartVerify(post({ product: 'best pornhub alternative site' }, '203.0.113.54'), testEnv);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.rejected).toBe(true);
  });
});

describe('handleStartVerify — needs_input resubmit', () => {
  async function seedNeedsInputRow() {
    const submitRes = await handleStartVerify(post({ product: 'Mystery Gadget X1' }, '203.0.113.55'), testEnv);
    const { id, slug } = await submitRes.json();
    await env.DB.prepare("UPDATE research SET status = 'needs_input', preview = ? WHERE id = ?")
      .bind('Could not find the product page — please paste its URL.', id).run();
    return { id, slug };
  }

  it('transitions needs_input -> pending and re-enqueues with the supplied URL', async () => {
    const { id } = await seedNeedsInputRow();

    const res = await handleStartVerify(post({
      reportId: id,
      product: 'Mystery Gadget X1',
      productUrl: 'https://maker.example/gadget-x1',
    }, '203.0.113.56'), testEnv);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('pending');
    expect(data.id).toBe(id);

    const row = await getResearchById(env.DB, id);
    expect(row.status).toBe('pending');
    expect(row.subject_url).toBe('https://maker.example/gadget-x1');
  });

  it('rejects a resubmit for a row that is not needs_input/failed', async () => {
    const submitRes = await handleStartVerify(post({ product: 'Regular Pending Item' }, '203.0.113.57'), testEnv);
    const { id } = await submitRes.json(); // still 'pending', not needs_input

    const res = await handleStartVerify(post({
      reportId: id,
      product: 'Regular Pending Item',
      productUrl: 'https://maker.example/regular',
    }, '203.0.113.58'), testEnv);

    expect(res.status).toBe(409);
  });

  it('rejects a resubmit for a failed ranking row (kind is null)', async () => {
    const id = generateId();
    await env.DB.prepare(
      "INSERT INTO research (id, slug, query, status, kind, created_at) VALUES (?, ?, ?, 'failed', NULL, ?)"
    ).bind(id, 'ranking-' + id, 'best headphones', Math.floor(Date.now() / 1000)).run();

    const res = await handleStartVerify(post({
      reportId: id,
      product: 'best headphones',
      productUrl: 'https://maker.example/headphones',
    }, '203.0.113.65'), testEnv);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Report is not awaiting a product URL');

    const row = await getResearchById(env.DB, id);
    expect(row.status).toBe('failed');
  });

  it('requires a productUrl when resubmitting with a reportId', async () => {
    const { id } = await seedNeedsInputRow();
    const res = await handleStartVerify(post({ reportId: id, product: 'Mystery Gadget X1' }, '203.0.113.59'), testEnv);
    expect(res.status).toBe(400);
  });
});

// Same layered guard as /api/research: the atomic RL_BURST binding caps
// concurrency in front of the non-atomic KV hourly window, so a parallel flood
// of paid verification runs cannot all read the same pre-write state and land.
describe('handleStartVerify: concurrent burst gate', () => {
  const BURST_CEILING = 15; // binding limit 10, plus slack for its permissive counting

  it('admits far fewer than 30 parallel submissions from one IP', async () => {
    const ip = '203.0.113.70';
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => handleStartVerify(
        post({ product: `Junk Verify Widget ${i}` }, ip),
        testEnv,
      )),
    );

    const statuses = results.map((r) => r.status);
    const throttled = statuses.filter((s) => s === 429).length;
    const admitted = statuses.length - throttled;

    expect(admitted).toBeLessThanOrEqual(BURST_CEILING);
    expect(throttled).toBeGreaterThanOrEqual(30 - BURST_CEILING);
  });

  it('answers a burst-blocked request with 429 + a ~60s Retry-After', async () => {
    const ip = '203.0.113.71';
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => handleStartVerify(
        post({ product: `Other Junk Verify Widget ${i}` }, ip),
        testEnv,
      )),
    );

    const blocked = results.find((r) => r.status === 429);
    expect(blocked).toBeTruthy();
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(55);
    expect(retryAfter).toBeLessThanOrEqual(61);
  });
});

describe('handleVerifyStatus', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await handleVerifyStatus('does-not-exist', env);
    expect(res.status).toBe(404);
  });

  it('returns needsUrl + message for a needs_input row', async () => {
    const submitRes = await handleStartVerify(post({ product: 'Another Mystery Item' }, '203.0.113.60'), testEnv);
    const { id } = await submitRes.json();
    await env.DB.prepare("UPDATE research SET status = 'needs_input', preview = ? WHERE id = ?")
      .bind('Paste the product URL.', id).run();

    const res = await handleVerifyStatus(id, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('needs_input');
    expect(data.needsUrl).toBe(true);
    expect(data.message).toBe('Paste the product URL.');
  });

  it('reports pending for a freshly submitted row', async () => {
    const submitRes = await handleStartVerify(post({ product: 'Fresh Item For Poll' }, '203.0.113.61'), testEnv);
    const { id } = await submitRes.json();

    const res = await handleVerifyStatus(id, env);
    const data = await res.json();
    expect(data.status).toBe('pending');
  });
});
