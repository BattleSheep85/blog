// Integration coverage for worker/index.js's scheduled() cron fallback claim
// query — the "off-CF worker is primary but stalled" path that claims the
// oldest stale-pending row and runs it through runResearchPipeline (the
// RANKING pipeline). Verification rows (kind='verification') must NEVER be
// claimed here — they are processed exclusively by the queue consumer's
// processVerificationMessage → runVerificationPipeline path.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import worker from '../../worker/index.js';
import { generateId, insertResearch } from '../../worker/lib/db.js';

beforeAll(async () => {
  await applySchema(env.DB);
});

// Minimal ExecutionContext stub: waitUntil runs the promise inline (awaited by
// the test after calling scheduled()) so we can assert post-conditions.
function makeCtx() {
  const pending = [];
  return {
    waitUntil(p) { pending.push(p); },
    async flush() { await Promise.all(pending); },
  };
}

describe('scheduled() fallback claim excludes verification rows', () => {
  it('leaves a stale-pending verification row untouched (no ranking row present, claim finds nothing)', async () => {
    const id = generateId();
    await insertResearch(env.DB, { id, slug: 's-' + id, query: 'verify this product', canonicalQuery: 'sched-verify-' + id });
    await env.DB.prepare(
      "UPDATE research SET kind = 'verification', created_at = ?1 WHERE id = ?2"
    ).bind(Math.floor(Date.now() / 1000) - 10 * 60, id).run();

    // EXTERNAL_WORKER_ENABLED defaults to "true" in wrangler.toml [vars], so the
    // fallback branch runs; SERPER_API_KEY is unset so the flywheel tick stays
    // dormant (gate 1) and GSC ingest no-ops without GSC_SA_KEY — both fail-soft.
    const ctx = makeCtx();
    await worker.scheduled({ scheduledTime: Date.now() }, env, ctx);
    await ctx.flush();

    // The verification row must still be 'pending' — the fallback claim query
    // excluded it, so runResearchPipeline was never invoked against it.
    const row = await env.DB.prepare('SELECT status FROM research WHERE id = ?').bind(id).first();
    expect(row.status).toBe('pending');
  });

  // NOTE: exercising this branch via the full worker.scheduled() would invoke
  // the real runResearchPipeline (live LLM/search calls, no mocks available at
  // this layer) once a ranking row is claimed. To keep this test fast/hermetic
  // while still proving the SQL claim query's exclusion logic, this reproduces
  // the exact fallback claim query from worker/index.js's scheduled() handler
  // directly against D1 — the same statement, not a reimplementation of intent.
  it('the fallback claim query picks the older RANKING row over a verification row of any age', async () => {
    const verifyId = generateId();
    await insertResearch(env.DB, { id: verifyId, slug: 's-' + verifyId, query: 'verify older', canonicalQuery: 'sched-verify-older-' + verifyId });
    await env.DB.prepare(
      "UPDATE research SET kind = 'verification', created_at = ?1 WHERE id = ?2"
    ).bind(Math.floor(Date.now() / 1000) - 20 * 60, verifyId).run();

    const rankingId = generateId();
    await insertResearch(env.DB, { id: rankingId, slug: 's-' + rankingId, query: 'best budget headphones', canonicalQuery: 'sched-ranking-' + rankingId });
    await env.DB.prepare(
      "UPDATE research SET created_at = ?1 WHERE id = ?2"
    ).bind(Math.floor(Date.now() / 1000) - 15 * 60, rankingId).run();

    const staleCut = Math.floor(Date.now() / 1000) - 5 * 60;
    const claimed = await env.DB.prepare(
      `UPDATE research SET status = 'processing'
       WHERE id = (
           SELECT id FROM research
           WHERE status = 'pending' AND created_at < ?1
             AND (kind IS NULL OR kind != 'verification')
           ORDER BY created_at ASC LIMIT 1
       )
       RETURNING id, query`
    ).bind(staleCut).first();

    expect(claimed.id).toBe(rankingId);
    const rankingRow = await env.DB.prepare('SELECT status FROM research WHERE id = ?').bind(rankingId).first();
    expect(rankingRow.status).toBe('processing');
    const verifyRow = await env.DB.prepare('SELECT status FROM research WHERE id = ?').bind(verifyId).first();
    expect(verifyRow.status).toBe('pending');
  });
});
