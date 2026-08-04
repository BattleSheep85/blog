/**
 * The one place that decides whether mail may leave, and the transport seam.
 *
 * `sendMail` NEVER throws. Every caller treats mail as best effort, so a dead
 * mail server can never fail a signup, an unsubscribe, or a research run.
 *
 * Gate order (first match wins):
 *   1. MAIL_ENABLED is not exactly "true"      -> skipped: 'disabled'
 *   2. TRUERANK_SMTP_USER / PASSWORD missing   -> skipped: 'not-configured'
 *   3. MAIL_DAILY_CAP reached for the UTC day  -> skipped: 'daily-cap'
 *
 * Gate 1 is fail-CLOSED on purpose. An absent or misspelled MAIL_ENABLED keeps
 * mail off, so losing the var can never switch sending on by accident.
 *
 * The seam is `env.__mailTransport`. Integration tests attach a recording stub
 * there, so no socket ever opens in a test run. Production never sets it.
 *
 * SECURITY: the log line carries a short hash of the recipient, never the
 * address, never the credentials, and never the message body.
 */

import { buildMimeMessage } from './mime.js';
import { sendViaSmtp } from './smtp.js';

const DEFAULT_HOST = 'smtp.hostinger.com';
const DEFAULT_PORT = '465';
const DEFAULT_FROM = 'chris@chrisputer.tech';
const DEFAULT_FROM_NAME = 'Frank';
const DEFAULT_DAILY_CAP = 200;
// Two days of TTL covers the UTC-day rollover with room to inspect the counter.
const COUNTER_TTL_S = 2 * 86400;
const HASH_CHARS = 12;

/** `mail:sent:YYYY-MM-DD` for the UTC day that contains `nowMs`. */
export function dailyCounterKey(nowMs) {
    return `mail:sent:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/** Read the mail settings out of env, applying the documented defaults. */
export function mailSettings(env) {
    const from = env.MAIL_FROM || DEFAULT_FROM;
    const capRaw = Number(env.MAIL_DAILY_CAP);
    return {
        from,
        fromName: env.MAIL_FROM_NAME || DEFAULT_FROM_NAME,
        host: env.SMTP_HOST || DEFAULT_HOST,
        port: env.SMTP_PORT || DEFAULT_PORT,
        heloDomain: from.slice(from.indexOf('@') + 1),
        dailyCap: Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_DAILY_CAP,
    };
}

/** True only when the switch says "true" and both secrets are present. */
export function mailEnabled(env) {
    return String(env?.MAIL_ENABLED ?? '') === 'true';
}

/** True when mail is switched on and both secrets are present. */
export function mailConfigured(env) {
    return mailEnabled(env) && Boolean(env?.TRUERANK_SMTP_USER && env?.TRUERANK_SMTP_PASSWORD);
}

/** Short, one-way tag for logs so an address never reaches the log stream. */
async function hashAddress(address) {
    try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, HASH_CHARS);
    } catch {
        return 'unhashed';
    }
}

/** Default transport: the hand-written SMTP client. Swapped out by the seam. */
function defaultTransport(cfg, rawMessage) {
    return sendViaSmtp(cfg, rawMessage);
}

/** Read today's send counter. A KV failure reads as zero so mail is not lost. */
async function readDailyCount(kv, key) {
    try {
        return Number(await kv.get(key)) || 0;
    } catch (err) {
        console.error(JSON.stringify({ where: 'mailer', step: 'cap-read', error: String(err?.message || err) }));
        return 0;
    }
}

/** Bump today's send counter. Best effort: a miss only loosens the cap. */
async function bumpDailyCount(kv, key, current) {
    try {
        await kv.put(key, String(current + 1), { expirationTtl: COUNTER_TTL_S });
    } catch (err) {
        console.error(JSON.stringify({ where: 'mailer', step: 'cap-write', error: String(err?.message || err) }));
    }
}

/**
 * Send one message to one recipient.
 *
 * @param {object} env Worker env (bindings, vars, secrets).
 * @param {{to: string, subject: string, text: string, html: string,
 *          extraHeaders?: Record<string,string>}} message
 * @returns {Promise<{ok: true, response?: string} | {ok: false, skipped?: string, error?: string}>}
 */
export async function sendMail(env, message) {
    if (!mailEnabled(env)) {
        // Loud on purpose. While the switch is off this line is the ONLY
        // evidence that a visitor was promised a mail that never left.
        console.log(JSON.stringify({ where: 'mailer', skipped: 'disabled' }));
        return { ok: false, skipped: 'disabled' };
    }
    if (!env?.TRUERANK_SMTP_USER || !env?.TRUERANK_SMTP_PASSWORD) {
        console.log(JSON.stringify({ where: 'mailer', skipped: 'not-configured' }));
        return { ok: false, skipped: 'not-configured' };
    }

    const settings = mailSettings(env);
    const counterKey = dailyCounterKey(Date.now());
    const sentToday = env.KV ? await readDailyCount(env.KV, counterKey) : 0;
    if (sentToday >= settings.dailyCap) {
        console.log(JSON.stringify({ where: 'mailer', skipped: 'daily-cap', cap: settings.dailyCap }));
        return { ok: false, skipped: 'daily-cap' };
    }

    const tag = await hashAddress(String(message?.to || ''));
    try {
        const raw = buildMimeMessage({
            from: settings.from,
            fromName: settings.fromName,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            extraHeaders: message.extraHeaders || {},
        });
        const transport = typeof env.__mailTransport === 'function' ? env.__mailTransport : defaultTransport;
        const result = await transport({
            host: settings.host,
            port: settings.port,
            username: env.TRUERANK_SMTP_USER,
            password: env.TRUERANK_SMTP_PASSWORD,
            from: settings.from,
            to: message.to,
            heloDomain: settings.heloDomain,
        }, raw);
        if (env.KV) await bumpDailyCount(env.KV, counterKey, sentToday);
        // The accept line holds the server's queue id and no personal data.
        // It is what a mail-host support ticket needs to trace a message.
        console.log(JSON.stringify({ where: 'mailer', to: tag, ok: true, response: result?.response }));
        return { ok: true, response: result?.response };
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ where: 'mailer', to: tag, ok: false, error: reason }));
        return { ok: false, error: reason };
    }
}
