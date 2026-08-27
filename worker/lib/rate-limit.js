/**
 * KV-based sliding window rate limiter.
 * Tracks request timestamps per key (e.g. salted IP hash), enforces max requests per window.
 */

import { hashIp } from './ip-hash.js';

/**
 * Builds a rate-limit key with a salted IP hash, avoiding raw IP storage.
 */
export async function ipRateKey(prefix, ip, env) {
    try {
        const hashed = await hashIp(ip, env);
        return `${prefix}:${hashed}`;
    } catch (err) {
        console.log('[rate-limit] IP hashing failed (missing IP_HASH_SALT / WORKER_SECRET), falling back to raw IP');
        return `${prefix}:${ip}`;
    }
}

/**
 * Check if a request is rate-limited.
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(kv, key, maxRequests, windowSeconds) {
    const storageKey = `ratelimit:${key}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Get existing timestamps
    const stored = await kv.get(storageKey, 'json');
    const timestamps = (stored || []).filter(ts => ts > windowStart);

    if (timestamps.length >= maxRequests) {
        const oldestInWindow = Math.min(...timestamps);
        const resetAt = oldestInWindow + windowMs;
        return {
            allowed: false,
            remaining: 0,
            resetAt,
        };
    }

    // Add current timestamp and store
    const updated = [...timestamps, now];
    await kv.put(storageKey, JSON.stringify(updated), { expirationTtl: windowSeconds + 60 });

    return {
        allowed: true,
        remaining: maxRequests - updated.length,
        resetAt: now + windowMs,
    };
}
