/**
 * Internal API for the off-Cloudflare research worker (blackbox, track 2).
 *
 * The worker runs the heavy, unlimited parallel engine on its own host, then
 * leans on Cloudflare for the parts that need the bindings:
 *   GET/POST /api/internal/next-job  → atomically claim the oldest pending run
 *   POST     /api/internal/progress  → push a live progress line into KV (SSE)
 *   POST     /api/internal/complete  → persist a finished engine result
 *
 * All require the X-Worker-Secret header to equal env.WORKER_SECRET. With no
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
  // When the off-CF worker is DISABLED, refuse to hand out jobs — otherwise the blackbox
  // poller keeps claiming pending rows and processing them with the FABRICATING LLM synth,
  // racing ahead of the CF-side queue consumer that runs the honest extraction engine.
  // With this gate the blackbox polls and gets nothing, so the CF consumer processes all.
  const extEnabled = env.EXTERNAL_WORKER_ENABLED === true || env.EXTERNAL_WORKER_ENABLED === 'true' || env.EXTERNAL_WORKER_ENABLED === '1';
  if (!extEnabled) return json({ job: null });
  try {
    const job = await claimNextPendingJob(env);
    return json({ job: job || null });
  } catch (err) {
    console.error('[internal] next-job error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'next-job failed' }, 500);
  }
}

// POST /api/internal/progress  body: { reportId, step?, message }
// Mirrors the CF createProgressUpdater shape so the same SSE feed
// (progress:{id} latest + progress_log:{id} array of {step,message,timestamp})
// surfaces off-CF worker beats live on the processing page. Best-effort: the
// worker fires these without blocking the engine, so a failure here is harmless.
export async function handleProgress(request, env) {
  if (!(await authed(request, env))) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { reportId, step, message } = body || {};
  if (!reportId || typeof message !== 'string') return json({ error: 'reportId and message required' }, 400);

  try {
    const log = (await env.KV.get(`progress_log:${reportId}`, 'json')) || [];
    // Trust the worker's monotonic per-job step; fall back to the next index so
    // the SSE `entry.step > since` filter still advances if step is omitted.
    const stepNum = Number.isFinite(step) ? step : (log.length + 1);
    const entry = { step: stepNum, message: message.slice(0, 300), timestamp: Date.now() };
    // Cap the log so a long run can't grow the KV value unbounded (the SSE feed
    // only ever shows recent beats); keep the newest 50.
    const next = [...log, entry].slice(-50);
    await Promise.all([
      env.KV.put(`progress:${reportId}`, JSON.stringify(entry), { expirationTtl: 3600 }),
      env.KV.put(`progress_log:${reportId}`, JSON.stringify(next), { expirationTtl: 3600 }),
    ]);
    return json({ ok: true });
  } catch (err) {
    console.error('[internal] progress error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'progress failed' }, 500);
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

    // The off-CF worker gathers AND runs the HONEST extraction synth on its own (idle homelab,
    // no Cloudflare CPU ceiling → unlimited source mining). It posts a finished `result`; CF's
    // job is to RE-VALIDATE structure (the trust boundary below) and persist. The extraction
    // engine is deterministic and can't fabricate, so this stays honest wherever it runs.
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
