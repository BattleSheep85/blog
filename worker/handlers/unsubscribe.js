/**
 * Self-serve email unsubscribe — GET or POST /unsubscribe?token=<unsub_token>
 *
 * One click removes the email tied to the token from ALL notifications (sets
 * unsubscribed_at on every row for that address). Token-based so there's no
 * email-enumeration surface. Any future mailer MUST:
 *   - filter recipients on `unsubscribed_at IS NULL`, and
 *   - send `List-Unsubscribe: <https://<host>/unsubscribe?token=...>` +
 *     `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) — this
 *     handler accepts POST for that one-click flow and GET for a clicked link.
 */

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

export async function handleUnsubscribe(request, env) {
    const token = (new URL(request.url).searchParams.get('token') || '').trim().slice(0, 64);
    if (!token) {
        return page('Invalid link', 'This unsubscribe link is missing its token. Please use the link from your email.', 400);
    }

    try {
        const row = await env.DB.prepare('SELECT email FROM subscribers WHERE unsub_token = ?').bind(token).first();
        if (!row) {
            return page('Link not recognized', 'This unsubscribe link is invalid or has already been used.', 404);
        }
        const now = Math.floor(Date.now() / 1000);
        // Remove this address from every notification in one click.
        await env.DB.prepare(
            'UPDATE subscribers SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL'
        ).bind(now, row.email).run();
        return page('Unsubscribed', 'You have been removed from TrueRank email notifications. You will not receive further emails.', 200);
    } catch (err) {
        console.error('Unsubscribe failed:', err instanceof Error ? err.message : String(err));
        return page('Something went wrong', 'We could not process that just now. Please try again shortly.', 500);
    }
}
