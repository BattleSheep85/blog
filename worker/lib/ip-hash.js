/**
 * Shared salted IP hash helper.
 *
 * Privacy requirement: public/privacy.html states that no raw client IPs are
 * stored. Client IPs must be hashed before storage in KV (rate limits, quotas)
 * or D1 (affiliate clicks).
 *
 * An unsalted SHA-256 hash of an IPv4 address can be brute-forced across the
 * entire ~4.3 billion address space in seconds on modern hardware. Therefore,
 * this function strictly requires a secret salt (IP_HASH_SALT or WORKER_SECRET)
 * and fails closed by throwing an Error if neither is configured.
 */

export async function hashIp(ip, env) {
    const salt = env && (env.IP_HASH_SALT || env.WORKER_SECRET);
    if (!salt) {
        throw new Error('IP_HASH_SALT or WORKER_SECRET must be set to hash client IPs');
    }
    const data = new TextEncoder().encode(`${salt}:${ip}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
