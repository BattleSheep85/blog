/**
 * Email capture handler.
 * POST /api/subscribe  body: { email, researchId? }
 *
 * Records an opt-in to be notified when a research report completes or is
 * re-run. Idempotent: a repeat (email, research_id) submission is silently
 * ignored via the table's UNIQUE constraint. Always returns {ok:true} on a
 * well-formed request so the front-end shows the same "thanks" either way and
 * we don't leak whether an address was already on the list.
 */

// Pragmatic, deliberately-not-RFC-5322 email check. We only need to reject
// obvious junk before it hits the DB; real deliverability is verified out of
// band when we actually send. <=254 chars is the SMTP address length limit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}

export async function handleSubscribe(request, env) {
    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed', message: 'Method not allowed.' }, 405);
    }

    // Parse defensively — never trust the body. Malformed JSON is a client error.
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, error: 'invalid_json', message: 'We could not read your request. Please try again.' }, 400);
    }

    if (!body || typeof body !== 'object') {
        return jsonResponse({ ok: false, error: 'invalid_body', message: 'Invalid request.' }, 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
        return jsonResponse({ ok: false, error: 'invalid_email', message: 'Please enter a valid email address.' }, 400);
    }

    // researchId is optional; normalize empty/whitespace to NULL so a general
    // subscription dedupes correctly against the UNIQUE(email, research_id) key.
    const rawId = typeof body.researchId === 'string' ? body.researchId.trim() : '';
    const researchId = rawId ? rawId.slice(0, 128) : null;

    const createdAt = Math.floor(Date.now() / 1000);
    // Per-row token for one-click unsubscribe (List-Unsubscribe + email footer).
    // created_at is the consent timestamp (the opt-in submit is the consent basis).
    const unsubToken = crypto.randomUUID().replace(/-/g, '');

    try {
        await env.DB.prepare(
            'INSERT OR IGNORE INTO subscribers (email, research_id, created_at, unsub_token) VALUES (?, ?, ?, ?)'
        ).bind(email, researchId, createdAt, unsubToken).run();
    } catch (err) {
        console.error('Subscribe insert failed:', err);
        return jsonResponse({ ok: false, error: 'server_error', message: 'Something went wrong on our end. Please try again shortly.' }, 500);
    }

    return jsonResponse({ ok: true });
}
