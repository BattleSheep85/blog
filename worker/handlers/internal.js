/**
 * Internal API for the off-Cloudflare research worker (blackbox, track 2).
 *
 * The worker runs the heavy, unlimited parallel engine on its own host, then
 * leans on Cloudflare for the parts that need the bindings:
 *   GET/POST /api/internal/next-job  → atomically claim the oldest pending run
 *   POST     /api/internal/complete  → persist a finished engine result
 *
 * Both require the X-Worker-Secret header to equal env.WORKER_SECRET. With no
 * secret set, the endpoints refuse everything (closed by default).
 */

import { claimNextPendingJob, persistEngineResult, incrementMonthlyCost } from '../pipeline/orchestrator.js';
import { validateResearchResult } from '../engine/validate.js';

// Constant-time string comparison. Hash both sides to fixed-length SHA-256
// digests so the byte-compare loop runs the full length regardless of where
// (or whether) the inputs first differ — no early-out timing side-channel.
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function authed(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  if (!env.WORKER_SECRET || !secret) return false;
  return timingSafeEqual(secret, env.WORKER_SECRET);
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// GET/POST /api/internal/next-job → { job: {reportId, query, slug, facets,
// topicalCategory, clarifications, config} | null }
export async function handleNextJob(request, env) {
  if (!(await authed(request, env))) return json({ error: 'unauthorized' }, 401);
  try {
    const job = await claimNextPendingJob(env);
    return json({ job: job || null });
  } catch (err) {
    console.error('[internal] next-job error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'next-job failed' }, 500);
  }
}

// POST /api/internal/complete  body:
//   { reportId, query, slug?, facets?, topicalCategory?, result, sources,
//     totalCostUsd?, synthModel? }   — OR { reportId, query, error } to fail it.
export async function handleComplete(request, env) {
  if (!(await authed(request, env))) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { reportId, query, slug, facets, topicalCategory } = body || {};
  if (!reportId || !query) return json({ error: 'reportId and query required' }, 400);

  try {
    // Worker-side total failure → mark the row failed so it doesn't hang in
    // 'processing' until the cron reaper sweeps it.
    if (body.error) {
      await env.DB.prepare(
        `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2 WHERE id = ?3 AND status = 'processing'`
      ).bind(JSON.stringify({ error: String(body.error).slice(0, 300) }), Math.floor(Date.now() / 1000), reportId).run();
      // Record any spend the failed run accrued before throwing (the worker
      // forwards it as body.totalCostUsd) so the monthly governor stays accurate.
      await incrementMonthlyCost(env, Number(body.totalCostUsd) || 0);
      return json({ status: 'failed' });
    }

    // Re-validate the worker-supplied result on the CF side so the trust boundary
    // (20-product cap, image-URL allowlist, string coercion) is enforced here
    // regardless of what the off-host worker sends.
    let validated;
    try { validated = validateResearchResult(body.result); }
    catch {
      await env.DB.prepare(
        `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2 WHERE id = ?3 AND status = 'processing'`
      ).bind(JSON.stringify({ error: 'Invalid result payload from worker.' }), Math.floor(Date.now() / 1000), reportId).run();
      return json({ status: 'failed' });
    }
    const engine = {
      result: validated,
      sources: Array.isArray(body.sources) ? body.sources : [],
      totalCostUsd: typeof body.totalCostUsd === 'number' ? body.totalCostUsd : 0,
      synthModel: body.synthModel || null,
    };
    const r = await persistEngineResult(env, reportId, query, facets || null, topicalCategory || null, engine, slug || null, null);
    return json(r || { status: 'ok' });
  } catch (err) {
    console.error('[internal] complete error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'complete failed' }, 500);
  }
}
