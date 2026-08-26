/**
 * Report-ready notifications: the reason the subscriber list exists.
 *
 * Called from the `won` block of persistEngineResult, which is the single
 * choke point every completion path crosses (queue consumer, cron fallback,
 * flywheel, and the off-Cloudflare worker handoff). The `won` latch also
 * guarantees at most one notify per completion when two processors race.
 *
 * NEVER throws. A dead mail server must not fail a research run. Notices are
 * best effort by product definition, because the report page is the source of
 * truth and it is already committed before this runs.
 */

import { sendMail, mailConfigured } from './mailer.js';
import { reportReadyEmail, SITE_URL } from './email-templates.js';

// One notice per subscriber row per hour. A re-research inside the hour is
// almost always the same content, so it stays quiet.
export const NOTIFY_DEDUPE_S = 3600;
// Hard ceiling per completion. Far above the real list size, and it bounds a
// single run's outbound volume no matter what the table holds.
export const NOTIFY_MAX_RECIPIENTS = 100;

const RECIPIENT_SQL = `SELECT id, email, unsub_token FROM subscribers
 WHERE research_id = ?1
   AND unsubscribed_at IS NULL
   AND confirmed_at IS NOT NULL
   AND (last_notified_at IS NULL OR last_notified_at < ?2)
 ORDER BY id ASC
 LIMIT ?3`;

/** Empty tally, so every exit path returns the same shape. */
function tally(reason) {
    return { sent: 0, failed: 0, skipped: 0, reason: reason ?? null };
}

/**
 * Older rows predate the mailer and may hold no unsubscribe token. Issue one
 * before the first send, otherwise the List-Unsubscribe header would be dead.
 */
async function ensureUnsubToken(env, row) {
    if (row.unsub_token) return row.unsub_token;
    const token = crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare('UPDATE subscribers SET unsub_token = ?1 WHERE id = ?2 AND unsub_token IS NULL')
        .bind(token, row.id).run();
    return token;
}

/** Send one notice and record the result. Returns 'sent', 'failed' or 'skipped'. */
async function notifyOne(env, row, { query, reportUrl, now }) {
    const token = await ensureUnsubToken(env, row);
    const message = reportReadyEmail({
        query,
        reportUrl,
        unsubUrl: `${SITE_URL}/unsubscribe?token=${token}`,
    });
    const result = await sendMail(env, { to: row.email, ...message });
    if (!result.ok) return result.skipped ? 'skipped' : 'failed';
    await env.DB.prepare('UPDATE subscribers SET last_notified_at = ?1 WHERE id = ?2').bind(now, row.id).run();
    return 'sent';
}

/**
 * Notify every confirmed, active subscriber of one research row.
 *
 * @param {object} env Worker env.
 * @param {{researchId: string, query: string, slug: string}} input
 * @returns {Promise<{sent: number, failed: number, skipped: number, reason: string|null}>}
 */
export async function notifySubscribersForResearch(env, { researchId, query, slug }) {
    if (!researchId || !slug) return tally('no-target');
    if (!mailConfigured(env)) return tally('not-configured');

    try {
        const now = Math.floor(Date.now() / 1000);
        const { results } = await env.DB.prepare(RECIPIENT_SQL)
            .bind(researchId, now - NOTIFY_DEDUPE_S, NOTIFY_MAX_RECIPIENTS).all();
        const rows = results || [];
        if (rows.length === 0) return tally('no-recipients');

        const reportUrl = `${SITE_URL}/research/${slug}`;
        // Sequential on purpose: one RCPT per message, and a small list must
        // never open a burst of sockets against the shared mail host.
        const outcomes = [];
        for (const row of rows) {
            outcomes.push(await notifyOne(env, row, { query, reportUrl, now })
                .catch((err) => {
                    console.error(JSON.stringify({ where: 'notify', researchId, error: String(err?.message || err) }));
                    return 'failed';
                }));
        }
        const count = (name) => outcomes.filter((outcome) => outcome === name).length;
        const counts = { sent: count('sent'), failed: count('failed'), skipped: count('skipped') };
        console.log(JSON.stringify({ where: 'notify', researchId, ...counts }));
        return { ...counts, reason: null };
    } catch (err) {
        console.error(JSON.stringify({ where: 'notify', researchId, error: String(err?.message || err) }));
        return tally('error');
    }
}
