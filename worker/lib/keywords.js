/**
 * Programmatic-SEO flywheel (Phase 5).
 *
 * runFlywheelTick() is called from the worker's scheduled() cron. It drains the
 * keyword_queue one keyword per tick into a real research run, behind three
 * hard gates so it can never run away with the LLM budget:
 *   1. SERPER_API_KEY must exist — a search-starved run wastes money producing
 *      thin pages, so we bail silently when it's absent (this is also the
 *      production gate: until the secret is set, the flywheel is dormant).
 *   2. The monthly budget governor (KV cost:YYYY-MM vs MONTHLY_BUDGET_USD).
 *   3. A daily cap (KV flywheel:YYYY-MM-DD vs FLYWHEEL_DAILY_MAX).
 *
 * It also reuses handleStartResearch's exact insert+enqueue shape (shared
 * helpers from db.js / utils.js) and its canonical-query clustering: if a
 * prior completed run already covers the keyword, we mark the keyword done
 * against that research_id instead of paying for a duplicate.
 */

import {
    generateId, insertResearch, findResearchByCanonicalQuery,
} from './db.js';
import { generateSlug, canonicalizeQuery } from './utils.js';

const DEFAULT_DAILY_MAX = 6;
const DEFAULT_RERESEARCH_DAILY_MAX = 2;
const THIRTY_DAYS_SECS = 30 * 86400;

// 'YYYY-MM' and 'YYYY-MM-DD' from a caller-supplied epoch-ms clock. The caller
// (scheduled handler) passes `now` explicitly so ticks are testable and the
// budget/daily keys line up with the rest of the system's UTC month keys.
function monthKeyFrom(now) {
    const d = new Date(now);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function dayKeyFrom(now) {
    const d = new Date(now);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function monthlyBudget(env) {
    const v = Number(env.MONTHLY_BUDGET_USD);
    return Number.isFinite(v) && v >= 0 ? v : 60;
}

function dailyMax(env) {
    const v = Number(env.FLYWHEEL_DAILY_MAX);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_MAX;
}

/**
 * Reconcile queued keywords against terminal research outcomes. Runs at the
 * start of every tick (cheaper and simpler than threading a callback through
 * the orchestrator): any keyword still 'queued' whose research has since
 * completed becomes 'done'; whose research failed becomes 'failed'.
 */
async function sweepOutcomes(env, now) {
    const ts = Math.floor(now / 1000);
    await env.DB.prepare(
        `UPDATE keyword_queue
         SET status = 'done', done_at = ?
         WHERE status = 'queued'
           AND research_id IN (SELECT id FROM research WHERE status = 'complete')`
    ).bind(ts).run();
    await env.DB.prepare(
        `UPDATE keyword_queue
         SET status = 'failed', done_at = ?
         WHERE status = 'queued'
           AND research_id IN (SELECT id FROM research WHERE status = 'failed')`
    ).bind(ts).run();
}

/**
 * Drain at most one keyword from the queue into a research run.
 * @param {object} env Worker env bindings.
 * @param {number} now Epoch milliseconds (caller-supplied clock).
 * @returns {Promise<{status:string, [k:string]:any}>} A small result object
 *          describing what the tick did (useful for logging/tests).
 */
export async function runFlywheelTick(env, now = Date.now()) {
    // Gate 1: no search key → dormant. Silent by design.
    if (!env.SERPER_API_KEY) {
        return { status: 'skipped', reason: 'no-serper-key' };
    }

    // Reconcile previously-queued keywords before claiming a new one.
    await sweepOutcomes(env, now);

    // Gate 2: monthly budget governor.
    const month = monthKeyFrom(now);
    const spent = Number(await env.KV.get(`cost:${month}`)) || 0;
    if (spent >= monthlyBudget(env)) {
        return { status: 'skipped', reason: 'budget-exhausted', spent };
    }

    // Gate 3: daily cap.
    const day = dayKeyFrom(now);
    const dayKey = `flywheel:${day}`;
    const todayCount = Number(await env.KV.get(dayKey)) || 0;
    if (todayCount >= dailyMax(env)) {
        return { status: 'skipped', reason: 'daily-cap', count: todayCount };
    }

    // Claim the next pending keyword atomically. The guarded UPDATE ... RETURNING
    // (D1/SQLite supports both) means two overlapping ticks can't grab the same
    // row: only one UPDATE flips it to 'queued', the other's WHERE no longer
    // matches and returns nothing.
    const claimed = await env.DB.prepare(
        `UPDATE keyword_queue SET status = 'queued'
         WHERE id = (
             SELECT id FROM keyword_queue
             WHERE status = 'pending'
             ORDER BY priority DESC, id LIMIT 1
         ) AND status = 'pending'
         RETURNING *`
    ).first();

    if (!claimed) {
        // No new keyword to drain — but the same gates (SERPER + budget + daily)
        // also clear the re-research sweep, so try to upgrade a stale money page
        // before returning. The sweep never throws (see runReresearchSweep).
        const reresearch = await runReresearchSweep(env, now);
        return { status: 'skipped', reason: 'queue-empty', reresearch };
    }

    const keyword = String(claimed.keyword || '').trim();
    const normalizedQuery = keyword.toLowerCase();

    // Clustering first: if a prior completed run already covers this canonical
    // query, attach the keyword to it and skip the spend entirely.
    const canonical = canonicalizeQuery(normalizedQuery);
    const existing = await findResearchByCanonicalQuery(env.DB, canonical, 14);
    if (existing) {
        await env.DB.prepare(
            `UPDATE keyword_queue SET status = 'done', research_id = ?, done_at = ? WHERE id = ?`
        ).bind(existing.id, Math.floor(now / 1000), claimed.id).run();
        const reresearch = await runReresearchSweep(env, now);
        return { status: 'clustered', keyword, researchId: existing.id, reresearch };
    }

    // Create the permanent research row — same shape as handleStartResearch.
    const id = generateId();
    const slug = generateSlug(normalizedQuery, id);
    await insertResearch(env.DB, {
        id,
        slug,
        query: normalizedQuery,
        canonicalQuery: canonical,
        tier: 'full',
    });

    // Enqueue the research job (identical message shape to the API path).
    await env.RESEARCH_QUEUE.send({
        reportId: id,
        query: normalizedQuery,
        tier: 'full',
    });

    // Link the keyword to its run and bump the daily counter (TTL 2 days so
    // stale day-keys self-evict). The keyword stays 'queued' until sweepOutcomes
    // on a later tick observes the research's terminal status.
    await env.DB.prepare(
        `UPDATE keyword_queue SET research_id = ? WHERE id = ?`
    ).bind(id, claimed.id).run();
    await env.KV.put(dayKey, String(todayCount + 1), { expirationTtl: 172800 });

    // Re-research sweep shares the same gates already cleared above. Its own
    // daily cap (and the monthly budget governor) keep combined spend bounded.
    const reresearch = await runReresearchSweep(env, now);

    return { status: 'enqueued', keyword, researchId: id, slug, reresearch };
}

/**
 * Metrics-driven re-research sweep (the flywheel's optimization loop).
 *
 * Upgrades proven-traffic "money pages" that have stopped converting: a page
 * with real views but ZERO affiliate clicks in the last 30 days is leaving
 * revenue on the table, so we re-run it at the exhaustive tier (opus-4.8 synth,
 * ~$0.19/run — justified precisely because the traffic is already proven).
 *
 * Critically, we REUSE the existing research row (same id/slug/URL) so the
 * page's accumulated SEO equity and inbound links survive the refresh. The
 * orchestrator's DELETE-then-insert product persistence replaces the products
 * in place, and its completed_at refresh bumps the sitemap lastmod — together
 * that re-indexes a fresher, better-converting page at the SAME URL.
 *
 * This function NEVER throws out of runFlywheelTick: any failure is caught and
 * logged so a transient DB/queue error can't abort the keyword flywheel.
 *
 * @param {object} env Worker env bindings.
 * @param {number} now Epoch milliseconds (caller-supplied clock).
 * @returns {Promise<{status:string, [k:string]:any}>}
 */
async function runReresearchSweep(env, now) {
    try {
        // Separate daily cap from the keyword flywheel — exhaustive runs are the
        // most expensive tier, so they get their own (smaller) budget.
        const day = dayKeyFrom(now);
        const dayKey = `rersrch:${day}`;
        const max = Number(env.RERESEARCH_DAILY_MAX || DEFAULT_RERESEARCH_DAILY_MAX);
        const todayCount = Number(await env.KV.get(dayKey)) || 0;
        if (todayCount >= max) {
            return { status: 'skipped', reason: 'daily-cap', count: todayCount };
        }

        // completed_at is unix-epoch seconds; clicked_at is a TEXT datetime
        // ('YYYY-MM-DD HH:MM:SS' UTC), so we compare each against its own form
        // of the 30-days-ago cutoff.
        const cutoffSecs = Math.floor(now / 1000) - THIRTY_DAYS_SECS;
        const clickCutoff = toSqliteDatetime(now - THIRTY_DAYS_SECS * 1000);

        // Candidate: a complete, non-exhaustive page with real traffic whose
        // products earned ZERO affiliate clicks in the last 30 days. LEFT JOIN
        // products → affiliate_clicks (only recent clicks survive the join's ON
        // filter); GROUP BY + HAVING COUNT(recent clicks)=0 selects the misses.
        const row = await env.DB.prepare(
            `SELECT r.id AS id, r.query AS query, r.view_count AS view_count
             FROM research r
             LEFT JOIN products p ON p.research_id = r.id
             LEFT JOIN affiliate_clicks ac
               ON ac.product_id = p.id AND ac.clicked_at >= ?1
             WHERE r.status = 'complete'
               AND r.view_count >= 25
               AND r.completed_at IS NOT NULL
               AND r.completed_at < ?2
               AND r.tier != 'exhaustive'
             GROUP BY r.id
             HAVING COUNT(ac.id) = 0
             ORDER BY r.view_count DESC
             LIMIT 1`
        ).bind(clickCutoff, cutoffSecs).first();

        if (!row) {
            return { status: 'skipped', reason: 'no-candidate' };
        }

        // Reclaim the row for re-processing. Guarded UPDATE (status='complete')
        // is the idempotency latch: it mirrors the queue consumer's
        // pending→processing claim, so two overlapping ticks (or a redelivered
        // queue message) can't double-enqueue the same page — only the first
        // UPDATE matches (meta.changes === 1).
        const claim = await env.DB.prepare(
            `UPDATE research SET status = 'pending', tier = 'exhaustive'
             WHERE id = ?1 AND status = 'complete'`
        ).bind(row.id).run();

        if (!claim.meta || claim.meta.changes !== 1) {
            return { status: 'skipped', reason: 'claim-lost', researchId: row.id };
        }

        // Enqueue at the exhaustive tier. The orchestrator reads tier from the
        // row, but we pass it in the message too to match the keyword path's
        // shape. DELETE-then-insert product persistence replaces products in
        // place and the completed_at refresh updates the sitemap lastmod, so the
        // page is re-indexed fresher at the SAME indexed URL (equity preserved).
        await env.RESEARCH_QUEUE.send({
            reportId: row.id,
            query: row.query,
            tier: 'exhaustive',
        });

        // Bump the separate daily counter (2-day TTL so stale keys self-evict).
        await env.KV.put(dayKey, String(todayCount + 1), { expirationTtl: 172800 });

        return {
            status: 'reresearched',
            researchId: row.id,
            query: row.query,
            viewCount: row.view_count,
        };
    } catch (err) {
        console.error('[flywheel] re-research sweep failed:', JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
        }));
        return { status: 'error', error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Format epoch milliseconds as a UTC 'YYYY-MM-DD HH:MM:SS' string — the exact
 * shape SQLite's datetime('now') writes, so string comparison against
 * affiliate_clicks.clicked_at is lexicographically correct.
 */
function toSqliteDatetime(ms) {
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Mark a keyword's outcome by research id. Not wired into the orchestrator —
 * runFlywheelTick reconciles via sweepOutcomes — but exported for callers that
 * want to settle a single keyword eagerly (e.g. an admin tool or future hook).
 * @param {object} env Worker env bindings.
 * @param {string} researchId The research row id.
 * @param {boolean} ok True → 'done', false → 'failed'.
 */
export async function markKeywordOutcome(env, researchId, ok) {
    if (!researchId) return;
    await env.DB.prepare(
        `UPDATE keyword_queue SET status = ?, done_at = ?
         WHERE research_id = ? AND status = 'queued'`
    ).bind(ok ? 'done' : 'failed', Math.floor(Date.now() / 1000), researchId).run();
}
