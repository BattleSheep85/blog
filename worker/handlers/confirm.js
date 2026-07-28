/**
 * Double opt-in confirmation — GET /confirm?token=<confirm_token>
 *
 * One click proves the mailbox. Confirming any pending row confirms every
 * pending row of that address, because the proof belongs to the address, not
 * to one report. The page is self-contained (no asset, no script) and matches
 * the style of worker/handlers/unsubscribe.js.
 *
 * Idempotent: a second click on the same link shows the same success page.
 */

import { confirmTokenFresh } from '../lib/subscribe-flow.js';

const TOKEN_MAX_LEN = 64;

function page(title, message, status) {
    const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · TrueRank</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0c;color:#e7e7ea;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:1.5rem}
.card{max-width:32rem;background:#161618;border:1px solid #2a2a2e;border-radius:1rem;padding:2rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .75rem}p{color:#a8a8b0;line-height:1.6;margin:0 0 1.25rem}a{color:#8ab4ff}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p><a href="/">Back to TrueRank</a></div></body></html>`;
    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Cache-Control': 'no-store',
        },
    });
}

const CONFIRMED_PAGE = () => page(
    'Email confirmed',
    'Thank you. We will email you once when the report you asked about is ready. Every email has a one-click unsubscribe link.',
    200,
);

export async function handleConfirm(request, env) {
    const token = (new URL(request.url).searchParams.get('token') || '').trim().slice(0, TOKEN_MAX_LEN);
    if (!token) {
        return page('Invalid link', 'This confirmation link is missing its token. Please use the link from your email.', 400);
    }

    try {
        const row = await env.DB.prepare(
            `SELECT email, confirmed_at, unsubscribed_at, COALESCE(confirm_sent_at, created_at) AS issued_at
               FROM subscribers WHERE confirm_token = ?1`,
        ).bind(token).first();
        if (!row) {
            return page('Link not recognized', 'This confirmation link is invalid or it has expired.', 404);
        }
        if (row.confirmed_at != null) return CONFIRMED_PAGE();

        const now = Math.floor(Date.now() / 1000);
        if (!confirmTokenFresh(row.issued_at, now)) {
            return page(
                'Link expired',
                'This confirmation link is older than 7 days. Please ask for the notification again on the report page.',
                200,
            );
        }

        // Confirming once proves the mailbox for every pending row of the
        // address. Unsubscribed rows stay out: leaving the list is final until
        // the reader subscribes again.
        await env.DB.prepare(
            `UPDATE subscribers SET confirmed_at = ?1
              WHERE email = (SELECT email FROM subscribers WHERE confirm_token = ?2)
                AND confirmed_at IS NULL AND unsubscribed_at IS NULL`,
        ).bind(now, token).run();
        return CONFIRMED_PAGE();
    } catch (err) {
        console.error('Confirm failed:', err instanceof Error ? err.message : String(err));
        return page('Something went wrong', 'We could not confirm that just now. Please try again shortly.', 500);
    }
}
