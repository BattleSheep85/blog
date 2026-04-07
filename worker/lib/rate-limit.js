/**
 * KV-based sliding window rate limiter.
 * Tracks request timestamps per IP, enforces max requests per window.
 */

/**
 * Check if a request is rate-limited.
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export async function checkRateLimit(kv, ip, maxRequests, windowSeconds) {
    const key = `ratelimit:${ip}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Get existing timestamps
    const stored = await kv.get(key, 'json');
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
    await kv.put(key, JSON.stringify(updated), { expirationTtl: windowSeconds + 60 });

    return {
        allowed: true,
        remaining: maxRequests - updated.length,
        resetAt: now + windowMs,
    };
}
