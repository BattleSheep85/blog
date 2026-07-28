/**
 * The three messages TrueRank sends. Every function is pure and returns
 * `{ subject, text, html }` (plus `extraHeaders` where the message belongs to
 * a list). The plain-text part is the canonical copy.
 *
 * The HTML part is one narrow column, dark text on white, system fonts, and at
 * most one link. No images, no tracking pixel, no external asset.
 */

import { escapeHtml } from './utils.js';

export const SITE_URL = 'https://chrisputer.tech';
const SIGNATURE = `Chris\n${SITE_URL.replace('https://', '')}`;
// Long queries make ugly subjects and can break header folding. Cut early.
const SUBJECT_QUERY_MAX = 120;
// Control characters (including CR and LF) are stripped from every value that
// reaches a header or a body line. Built from char codes so no raw control
// byte sits in this source file.
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]+`, 'g');

/**
 * Flatten any user text to one safe header/body line: no control characters,
 * no line breaks, trimmed, and length capped.
 */
export function sanitizeLine(value, maxLen = SUBJECT_QUERY_MAX) {
    const flat = String(value ?? '')
        .replace(CONTROL_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return flat.length > maxLen ? `${flat.slice(0, maxLen - 1)}…` : flat;
}

/** Minimal HTML document shared by the three messages. */
function htmlDocument({ title, paragraphs, action }) {
    const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
    const link = action
        ? `<p style="margin:0 0 16px"><a href="${escapeHtml(action.url)}" style="color:#1a4fd6">${escapeHtml(action.label)}</a></p>`
        : '';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:34rem;margin:0 auto">${body}${link}</div></body></html>`;
}

/**
 * Message 1: prove the mailbox before anything else is sent.
 * @param {{query?: string|null, confirmUrl: string}} input
 */
export function confirmationEmail({ query, confirmUrl }) {
    const topic = sanitizeLine(query);
    const opening = topic
        ? `You asked TrueRank to email you when research on "${topic}" is ready.`
        : 'You asked TrueRank to email you when new research is ready.';
    const text = [
        opening,
        '',
        'Confirm this address to turn the notification on:',
        '',
        confirmUrl,
        '',
        'The link works for 7 days. If you did not request this, ignore this',
        'email. We will not email you again.',
        '',
        SIGNATURE,
    ].join('\n');
    const html = htmlDocument({
        title: 'Confirm your TrueRank email notification',
        paragraphs: [
            escapeHtml(opening),
            'Confirm this address to turn the notification on.',
            'The link works for 7 days. If you did not request this, ignore this email. We will not email you again.',
            'Chris<br>chrisputer.tech',
        ],
        action: { url: confirmUrl, label: 'Confirm my email address' },
    });
    return { subject: 'Confirm your TrueRank email notification', text, html };
}

/**
 * Message 2: the report the reader asked about is published.
 * @param {{query: string, reportUrl: string, unsubUrl: string}} input
 */
export function reportReadyEmail({ query, reportUrl, unsubUrl }) {
    const topic = sanitizeLine(query);
    const text = [
        'The research you asked about is done.',
        '',
        `  "${topic}"`,
        `  Read the report: ${reportUrl}`,
        '',
        'You get this email because you asked for one notification about this',
        'report on chrisputer.tech. Reply to this email to reach a human.',
        '',
        `One-click unsubscribe: ${unsubUrl}`,
    ].join('\n');
    const html = htmlDocument({
        title: 'Your TrueRank report is ready',
        paragraphs: [
            'The research you asked about is done.',
            `<strong>${escapeHtml(topic)}</strong>`,
            'You get this email because you asked for one notification about this report on chrisputer.tech. Reply to this email to reach a human.',
            `<a href="${escapeHtml(unsubUrl)}" style="color:#606068">One-click unsubscribe</a>`,
        ],
        action: { url: reportUrl, label: 'Read the report' },
    });
    return {
        subject: `Your TrueRank report is ready: ${topic}`,
        text,
        html,
        // RFC 8058. The handler at /unsubscribe accepts the POST with no
        // confirmation step, so mail clients can offer one-click removal.
        extraHeaders: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
    };
}

/**
 * Message 3: the receipt for the reader's own unsubscribe click. It is a
 * one-time transactional acknowledgement, so it carries no List-Unsubscribe
 * header. There is no list membership left to leave.
 */
export function unsubReceiptEmail() {
    const text = [
        'This confirms your unsubscribe request. We removed your address from',
        'all TrueRank email notifications. We will not send you further email.',
        '',
        'If this was a mistake, subscribe again on any report page.',
        '',
        SIGNATURE,
    ].join('\n');
    const html = htmlDocument({
        title: 'You are unsubscribed from TrueRank',
        paragraphs: [
            'This confirms your unsubscribe request. We removed your address from all TrueRank email notifications. We will not send you further email.',
            'If this was a mistake, subscribe again on any report page.',
            'Chris<br>chrisputer.tech',
        ],
        action: null,
    });
    return { subject: 'You are unsubscribed from TrueRank', text, html };
}
