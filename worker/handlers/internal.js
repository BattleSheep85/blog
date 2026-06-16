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

import { claimNextPendingJob, persistEngineResult } from '../pipeline/orchestrator.js';

function authed(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  return Boolean(env.WORKER_SECRET) && secret === env.WORKER_SECRET;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// GET/POST /api/internal/next-job → { job: {reportId, query, slug, facets,
// topicalCategory, clarifications, config} | null }
export async function handleNextJob(request, env) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
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
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { reportId, query, slug, facets, topicalCategory } = body || {};
  if (!reportId || !query) return json({ error: 'reportId and query required' }, 400);

  try {
    // Worker-side total failure → mark the row failed so it doesn't hang in
    // 'processing' until the cron reaper sweeps it.
    if (body.error) {
      await env.DB.prepare(
        `UPDATE research SET status = 'failed', result = ?1, completed_at = ?2 WHERE id = ?3`
      ).bind(JSON.stringify({ error: String(body.error).slice(0, 300) }), Math.floor(Date.now() / 1000), reportId).run();
      return json({ status: 'failed' });
    }

    const engine = {
      result: body.result,
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
