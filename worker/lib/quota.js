/**
 * Per-IP lifetime free-tier quotas for anonymous (signed-out) usage.
 *
 * Mirrors the `cost:${YYYY-MM}` KV counter precedent in the budget governor
 * (worker/pipeline/orchestrator.js) — a plain integer string, no TTL (these
 * are lifetime caps, not rolling windows), read-add-put with no CAS. That
 * non-atomicity is an accepted tradeoff here too: worst case a burst of
 * concurrent requests from the same IP lets a couple extra free runs
 * through, which is fine for an abuse-deterrent, not a hard billing cap.
 */

export const FREE_SEARCHES = 5;
export const FREE_VERIFIES = 10;

function quotaKey(kind, ip) {
    return `quota:v1:${kind}:${ip}`;
}

function limitForKind(kind) {
    return kind === 'verify' ? FREE_VERIFIES : FREE_SEARCHES;
}

/**
 * Returns { used, limit, remaining } for the given kind ('search' | 'verify')
 * and IP. A missing KV key means zero usage so far.
 */
export async function getQuota(kv, kind, ip) {
    const limit = limitForKind(kind);
    const stored = await kv.get(quotaKey(kind, ip));
    const used = parseInt(stored, 10) || 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Increments the lifetime usage counter for (kind, ip) by one.
 */
export async function consumeQuota(kv, kind, ip) {
    const key = quotaKey(kind, ip);
    const stored = await kv.get(key);
    const used = (parseInt(stored, 10) || 0) + 1;
    await kv.put(key, String(used));
    return used;
}
