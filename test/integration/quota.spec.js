// Integration coverage for the per-IP free-tier quota gate (5 lifetime mass
// searches / 10 lifetime product verifies before a free account is
// required) — worker/lib/quota.js wired into handleStartResearch and
// handleStartVerify. Mirrors research.spec.js / verify-route.spec.js's
// D1/KV conventions.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { handleStartResearch } from '../../worker/handlers/research.js';
import { handleStartVerify } from '../../worker/handlers/verify.js';
import { createUser, createSession } from '../../worker/lib/auth.js';
import { FREE_SEARCHES, FREE_VERIFIES } from '../../worker/lib/quota.js';

beforeAll(async () => {
  await applySchema(env.DB);
});

// Same RESEARCH_QUEUE stub pattern as verify-route.spec.js — a real queue
// send races the isolated per-file D1/KV storage this spec gets.
//
// RL_BURST is omitted on purpose. Proving a LIFETIME quota of 10 verifies
// needs 11+ requests from one IP, and this spec fires them in milliseconds,
// which the 10-per-60s burst gate would answer with 429 before the quota gate
// ever ran. Dropping the binding is the supported fail-open configuration
// (worker/lib/burst-gate.js), so these cases measure the quota gate alone.
// The burst gate has its own coverage in burst-gate.spec.js, research.spec.js
// and verify-route.spec.js.
const { RL_BURST: _unusedBurstGate, ...envWithoutBurstGate } = env;
const testEnv = { ...envWithoutBurstGate, RESEARCH_QUEUE: { send: async () => {} } };

const researchPost = (query, ip, extra = {}, cookie) => new Request('https://chrisputer.tech/api/research', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': ip,
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: JSON.stringify({ query, fresh: true, ...extra }),
});

const verifyPost = (body, ip, cookie) => new Request('https://chrisputer.tech/api/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': ip,
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: JSON.stringify(body),
});

describe('quota — verify (10 lifetime, anonymous)', () => {
  it('the 10th verify from a fresh IP succeeds, the 11th is 403 signup_required', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < FREE_VERIFIES; i++) {
      const res = await handleStartVerify(verifyPost({ product: `Test Product ${i}` }, ip), testEnv);
      expect(res.status).toBe(200);
    }
    const res = await handleStartVerify(verifyPost({ product: 'One Too Many' }, ip), testEnv);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('signup_required');
    expect(body.kind).toBe('verify');
    expect(body.limit).toBe(FREE_VERIFIES);
  });

  it('a needs_input resubmit does not consume quota', async () => {
    const ip = '198.51.100.11';
    // Exhaust the quota with brand-new submissions first.
    let lastId;
    for (let i = 0; i < FREE_VERIFIES; i++) {
      const res = await handleStartVerify(verifyPost({ product: `Resub Seed ${i}` }, ip), testEnv);
      const data = await res.json();
      lastId = data.id;
    }
    // Force the last row into needs_input so it's eligible for resubmit.
    await env.DB.prepare("UPDATE research SET status = 'needs_input' WHERE id = ?").bind(lastId).run();

    // Resubmitting (continuation of an already-paid run) must succeed even
    // though the quota is fully exhausted.
    const resubmit = await handleStartVerify(verifyPost({
      reportId: lastId,
      product: 'Resub Seed',
      productUrl: 'https://maker.example/resub',
    }, ip), testEnv);
    expect(resubmit.status).toBe(200);

    // A genuinely new submission from the same exhausted IP is still blocked.
    const blocked = await handleStartVerify(verifyPost({ product: 'Brand New After Exhaustion' }, ip), testEnv);
    expect(blocked.status).toBe(403);
  });

  it('a signed-in user bypasses the verify quota entirely', async () => {
    const ip = '198.51.100.12';
    const userId = await createUser(env.DB, 'verifyquota@truerank.test', 'hunter2pass');
    const session = await createSession(env.DB, userId);
    const cookie = `tr_sess=${session.token}`;

    for (let i = 0; i < FREE_VERIFIES + 2; i++) {
      const res = await handleStartVerify(verifyPost({ product: `Signed In Verify ${i}` }, ip, cookie), testEnv);
      expect(res.status).toBe(200);
    }
  });
});

describe('quota — search (5 lifetime, anonymous)', () => {
  it('the 5th new search from a fresh IP succeeds, the 6th is 403 signup_required', async () => {
    const ip = '198.51.100.20';
    for (let i = 0; i < FREE_SEARCHES; i++) {
      // Distinct queries so the canonical-query cluster cache never short-circuits.
      const res = await handleStartResearch(researchPost(`best distinct gadget number ${i} for testing`, ip), testEnv);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('pending');
    }
    const res = await handleStartResearch(researchPost('best distinct gadget number six for testing', ip), testEnv);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('signup_required');
    expect(body.kind).toBe('search');
    expect(body.limit).toBe(FREE_SEARCHES);
  });

  it('a cluster/cache hit on an existing canonical query does not consume quota', async () => {
    const ip = '198.51.100.21';
    const query = 'best repeated cluster gadget for testing';
    // First run is a genuine new paid run (not `fresh`, but nothing exists yet).
    const first = await handleStartResearch(
      new Request('https://chrisputer.tech/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ query }),
      }),
      testEnv,
    );
    expect(first.status).toBe(200);
    const firstData = await first.json();
    await env.DB.prepare("UPDATE research SET status = 'complete', result = '{}' WHERE id = ?").bind(firstData.id).run();
    // findResearchByCanonicalQuery requires at least one product row for a
    // 'complete' row to count as a real cluster (worker/lib/db.js).
    await env.DB.prepare(
      'INSERT INTO products (id, research_id, name, rank) VALUES (?1, ?2, ?3, ?4)'
    ).bind('quota-cluster-product', firstData.id, 'Test Gadget', 1).run();

    // Re-submitting the same query (no `fresh` flag) clusters onto the
    // existing completed row and must return before the quota gate.
    for (let i = 0; i < FREE_SEARCHES + 2; i++) {
      const res = await handleStartResearch(
        new Request('https://chrisputer.tech/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ query }),
        }),
        testEnv,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.cached).toBe(true);
      expect(data.clustered).toBe(true);
    }
  });

  it('a signed-in user bypasses the search quota entirely', async () => {
    const ip = '198.51.100.22';
    const userId = await createUser(env.DB, 'searchquota@truerank.test', 'hunter2pass');
    const session = await createSession(env.DB, userId);
    const cookie = `tr_sess=${session.token}`;

    for (let i = 0; i < FREE_SEARCHES + 2; i++) {
      const res = await handleStartResearch(
        researchPost(`signed in distinct search query ${i} for testing`, ip, {}, cookie),
        testEnv,
      );
      expect(res.status).toBe(200);
    }
  });
});
