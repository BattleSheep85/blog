/**
 * Pure state machine for POST /api/subscribe. No I/O: the handler reads the
 * rows, calls this, and applies the action with parameterized statements.
 *
 * Double opt-in is the rule. An address that has not clicked its confirmation
 * link never receives a report notice, and the number of confirmation mails one
 * address can ever cause is capped. That is what stops a stranger from using
 * the open POST endpoint to mail-bomb a victim.
 */

// One confirmation mail per address per day, whatever IP asks for it.
export const CONFIRM_COOLDOWN_S = 86_400;
// Lifetime ceiling per address, until the 30-day purge clears the rows.
export const CONFIRM_MAX_SENDS = 3;
// How long a confirmation link stays valid, from confirm_sent_at.
export const CONFIRM_TTL_S = 7 * 86_400;

const ACTION_NOOP = 'noop';
const ACTION_INSERT_CONFIRMED = 'insert-confirmed';
const ACTION_INSERT_UNCONFIRMED = 'insert-unconfirmed';
const ACTION_REACTIVATE = 'reactivate';
const ACTION_RESEND = 'resend';

/** Null-safe match of a row against the requested research id. */
function isPair(row, researchId) {
    const rowId = row.research_id ?? null;
    return rowId === (researchId ?? null);
}

/** Newest confirmation-send timestamp across every row of the address. */
function lastSentAt(rows) {
    return rows.reduce((newest, row) => Math.max(newest, row.confirm_sent_at || 0), 0);
}

/** Total confirmation mails this address has already caused. */
function totalSends(rows) {
    return rows.reduce((sum, row) => sum + (row.confirm_send_count || 0), 0);
}

/**
 * Decide whether a confirmation mail may go out, and why not when it may not.
 * `ignoreRowId` drops one row's lifetime count: a reactivated row starts a
 * fresh consent cycle with its counter reset.
 */
function confirmationGate(rows, now, ignoreRowId) {
    const counted = ignoreRowId == null ? rows : rows.filter((row) => row.id !== ignoreRowId);
    if (totalSends(counted) >= CONFIRM_MAX_SENDS) return { send: false, reason: 'lifetime-cap' };
    const last = lastSentAt(rows);
    if (last > 0 && now - last < CONFIRM_COOLDOWN_S) return { send: false, reason: 'cooldown' };
    return { send: true, reason: null };
}

/** Build the returned decision without mutating anything. */
function decision(action, sendConfirmation, suppressedReason, rowId) {
    return { action, rowId: rowId ?? null, sendConfirmation, suppressedReason: suppressedReason ?? null };
}

/**
 * Decide what POST /api/subscribe should do for one address.
 *
 * @param {Array<{id: number, research_id: string|null, confirmed_at: number|null,
 *   unsubscribed_at: number|null, confirm_sent_at: number|null,
 *   confirm_send_count: number|null}>} rowsForEmail Every existing row for the address.
 * @param {{researchId: string|null, now: number}} input Requested pair and epoch seconds.
 * @returns {{action: string, rowId: number|null, sendConfirmation: boolean,
 *   suppressedReason: string|null}}
 */
export function decideSubscribeAction(rowsForEmail, { researchId, now }) {
    const rows = Array.isArray(rowsForEmail) ? rowsForEmail : [];
    const pair = rows.find((row) => isPair(row, researchId)) || null;

    // Already on the list for this exact report, and the mailbox is proven.
    if (pair && pair.unsubscribed_at == null && pair.confirmed_at != null) {
        return decision(ACTION_NOOP, false, null, pair.id);
    }

    // The reader unsubscribed this pair before. Start a fresh consent cycle.
    if (pair && pair.unsubscribed_at != null) {
        const gate = confirmationGate(rows, now, pair.id);
        return decision(ACTION_REACTIVATE, gate.send, gate.reason, pair.id);
    }

    // The pair exists but nobody clicked the link yet. Offer another mail.
    if (pair) {
        const gate = confirmationGate(rows, now, null);
        return decision(ACTION_RESEND, gate.send, gate.reason, pair.id);
    }

    // New pair for an address that already proved its mailbox elsewhere.
    const provenElsewhere = rows.some((row) => row.confirmed_at != null && row.unsubscribed_at == null);
    if (provenElsewhere) return decision(ACTION_INSERT_CONFIRMED, false, null, null);

    const gate = confirmationGate(rows, now, null);
    return decision(ACTION_INSERT_UNCONFIRMED, gate.send, gate.reason, null);
}

/** True when a confirmation link issued at `sentAt` is still inside its window. */
export function confirmTokenFresh(sentAt, now) {
    if (!sentAt) return false;
    return now - sentAt <= CONFIRM_TTL_S;
}
