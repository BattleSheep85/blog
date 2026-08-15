/**
 * Site-wide (GLOBAL) throttle for the affiliate redirect surface.
 *
 * Second, independent layer next to the per-IP hourly cap in
 * worker/handlers/affiliate.js. A per-IP cap cannot stop an IP-rotating
 * attacker by construction: incident 2026-08-14/15 put 1,232 clicks on 213
 * report pages from 1,232 DISTINCT ip_hash values, about one click per
 * address, so no single address ever came near the 30/hour per-IP cap.
 *
 * Mechanism: the native Workers rate-limit binding counts per unique key
 * string. Calling it with a CONSTANT key makes one counter that every request
 * on the site shares, which is exactly a site-wide throttle. The binding is
 * RL_AFFILIATE_GLOBAL, separate from RL_BURST so the two can be tuned apart.
 *
 * FAIL-OPEN, inherited from checkBurstGate: a missing binding or a binding
 * error never blocks traffic. The per-IP KV cap stays behind it.
 */

import { checkBurstGate } from './burst-gate.js';

// One counter for the whole site. The constant (not IP-derived) key IS the
// mechanism: change it to anything per-visitor and this stops being global.
export const AFFILIATE_GLOBAL_KEY = 'affiliate:global';

// These MUST match [ratelimits.simple] on the RL_AFFILIATE_GLOBAL binding in
// wrangler.toml and wrangler.dev.toml (test/unit/affiliate-gate.test.js
// asserts it). They are declared here so the trip log reports the settings the
// number was tuned against.
//
// Sizing, from production D1 before the incident (5 weeks, 2026-07-08 to
// 2026-08-13):
//   - busiest real minute, more than one visitor: 3 clicks
//   - busiest real hour, more than one visitor:   9 clicks
//   - busiest hour of any kind on record:        24 clicks
//   - median day:                                 4 clicks
// 6 per 60 s is 2x the busiest real minute, and its 360/hour ceiling is 15x
// the busiest hour ever recorded and 40x the busiest multi-visitor hour, so
// real traffic at today's scale cannot reach it. It also caps the damage: the
// worst incident hour on record (1,475 clicks, 2026-06-21) would have been
// held to 360, and the 2026-08-15 pattern (peaks of 17 to 23 clicks a minute)
// loses about two thirds of its peak minutes.
export const AFFILIATE_GLOBAL_LIMIT = 6;
export const AFFILIATE_GLOBAL_PERIOD_SECONDS = 60;

/**
 * Consume one token from the site-wide affiliate counter.
 *
 * @param {{ RL_AFFILIATE_GLOBAL?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }} env
 * @returns {Promise<boolean>} true when site-wide volume is over the limit and
 *   the caller must treat the request as suspicious.
 */
export async function isAffiliateFloodActive(env) {
    const gate = await checkBurstGate(env?.RL_AFFILIATE_GLOBAL, AFFILIATE_GLOBAL_KEY);
    if (gate.allowed) return false;
    // Tuning data. One line per throttled click, so the owner can see how often
    // the gate fires and whether the limit needs to move.
    console.log(JSON.stringify({
        where: 'affiliate-gate',
        event: 'global-throttle',
        key: AFFILIATE_GLOBAL_KEY,
        limit: AFFILIATE_GLOBAL_LIMIT,
        periodSeconds: AFFILIATE_GLOBAL_PERIOD_SECONDS,
        resetAt: gate.resetAt,
    }));
    return true;
}
