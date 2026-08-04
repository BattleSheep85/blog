/**
 * Small shared flags needed on both sides of the worker/index.js split
 * (worker/routes/pages.js and worker/jobs.js), so neither has to import
 * from worker/index.js and create a circular import.
 */

// Bump when the page template/schema shape changes in a way that should
// invalidate every KV-cached HTML blob. Old keys age out on their own TTL.
export const CACHE_VERSION = 'tr12';

// Phase-B cutover flag: when 'true', the off-Cloudflare research worker is the
// primary processor — the queue consumer defers (acks without processing,
// leaving the row pending for the worker to claim) and a cron fallback handles
// any pending row the worker hasn't picked up in ~5 min (homelab-down safety).
export function externalWorkerEnabled(env) {
  const v = env.EXTERNAL_WORKER_ENABLED;
  return v === true || v === 'true' || v === '1';
}
