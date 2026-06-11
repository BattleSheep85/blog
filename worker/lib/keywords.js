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
        return { status: 'skipped', reason: 'queue-empty' };
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
        return { status: 'clustered', keyword, researchId: existing.id };
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

    return { status: 'enqueued', keyword, researchId: id, slug };
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
