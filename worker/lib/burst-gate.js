/**
 * Burst gate over the native Workers rate limiting binding (RL_BURST).
 * Caps per-key CONCURRENCY (10/60s) in front of the KV hourly window in
 * worker/lib/rate-limit.js, which stays the volume ceiling. The binding
 * is atomic per colo, which equals per attacking source for per-IP keys.
 *
 * FAIL-OPEN by design: a missing binding (plain-Node unit runs, stale
 * local config, config-only rollback) or a binding error must never block
 * traffic. The KV layer behind it still enforces the hourly cap.
 *
 * Design: docs/rate-limit-design.md section 4.2.
 */

// The binding's window is fixed at 60 s in wrangler.toml (`period = 60`).
// A blocked caller can retry after at most one window, so this is the
// Retry-After the call sites synthesize.
export const BURST_RESET_MS = 60_000;

// Shape returned on the allow path. The numeric fields stay null because the
// binding reports neither a remaining count nor a reset time. Call sites
// discard this object and use the KV result instead, so the nulls are never
// read. Frozen so no caller can mutate the shared literal.
const ALLOWED = Object.freeze({ allowed: true, remaining: null, resetAt: null });

/**
 * Check the burst gate for one key.
 *
 * @param {{ limit: (opts: { key: string }) => Promise<{ success: boolean }> } | undefined} limiter
 *   The RL_BURST binding, or undefined when it is not configured.
 * @param {string} key Subject key, e.g. `research:1.2.3.4`.
 * @returns {Promise<{allowed: boolean, remaining: number|null, resetAt: number|null}>}
 *   The same contract checkRateLimit returns. On a block, both numeric
 *   fields are real numbers so the existing 429 + Retry-After branches work
 *   unchanged.
 */
export async function checkBurstGate(limiter, key) {
    if (!limiter || typeof limiter.limit !== 'function') return ALLOWED;
    try {
        const { success } = await limiter.limit({ key });
        if (success) return ALLOWED;
        return { allowed: false, remaining: 0, resetAt: Date.now() + BURST_RESET_MS };
    } catch (err) {
        console.error('[burst-gate] limit() failed:', err instanceof Error ? err.message : String(err));
        return ALLOWED;
    }
}
