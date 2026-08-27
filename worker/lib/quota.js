/**
 * Per-IP lifetime free-tier quotas for anonymous (signed-out) usage.
 *
 * Uses salted IP hashes (v2) rather than raw IP addresses to honor the
 * privacy policy (public/privacy.html). Key version is bumped to `quota:v2:`
 * because the key space changes from raw IPs to salted IP hashes. This bump
 * resets counters once, deliberately, since old raw-IP keys cannot be migrated.
 *
 * `consumeQuota` writes with an expirationTtl of 365 days (1 year) so keys
 * do not persist forever in KV, while preserving the lifetime allowance
 * across reasonable user timeframes.
 */

import { hashIp } from './ip-hash.js';

export const FREE_SEARCHES = 5;
export const FREE_VERIFIES = 10;
// Quota counters represent a lifetime free-tier allowance, so 365 days
// ensures entries expire eventually to avoid indefinite KV storage while
// preserving user quotas for regular visits.
export const QUOTA_EXPIRATION_TTL = 365 * 24 * 60 * 60; // 365 days (in seconds)

/**
 * Builds the versioned KV key using a salted IP hash.
 * Key space version bumped to quota:v2: to reset counters once deliberately,
 * since old raw-IP keys cannot be migrated.
 */
export async function quotaKey(kind, ip, env) {
    try {
        const hashed = await hashIp(ip, env);
        return `quota:v2:${kind}:${hashed}`;
    } catch (err) {
        console.log('[quota] IP hashing failed (missing IP_HASH_SALT / WORKER_SECRET), falling back to raw IP');
        return `quota:v2:${kind}:${ip}`;
    }
}

export function limitForKind(kind) {
    return kind === 'verify' ? FREE_VERIFIES : FREE_SEARCHES;
}

/**
 * Returns { used, limit, remaining } for the given kind ('search' | 'verify')
 * and IP. A missing KV key means zero usage so far.
 */
export async function getQuota(kv, kind, ip, env) {
    const limit = limitForKind(kind);
    const key = await quotaKey(kind, ip, env);
    const stored = await kv.get(key);
    const used = parseInt(stored, 10) || 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Increments the lifetime usage counter for (kind, ip) by one.
 */
export async function consumeQuota(kv, kind, ip, env) {
    const key = await quotaKey(kind, ip, env);
    const stored = await kv.get(key);
    const used = (parseInt(stored, 10) || 0) + 1;
    await kv.put(key, String(used), { expirationTtl: QUOTA_EXPIRATION_TTL });
    return used;
}
