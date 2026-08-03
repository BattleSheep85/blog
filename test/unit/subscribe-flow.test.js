// Unit coverage for worker/lib/subscribe-flow.js — the pure decision table
// behind POST /api/subscribe. These rules are the abuse ceiling: they decide
// how much mail a stranger can aim at a victim address.
import {
  decideSubscribeAction, confirmTokenFresh,
  CONFIRM_COOLDOWN_S, CONFIRM_MAX_SENDS, CONFIRM_TTL_S,
} from '../../worker/lib/subscribe-flow.js';

const NOW = 1_800_000_000;

// Row factory with the table's defaults. Never mutated by the module.
const row = (over = {}) => ({
  id: 1,
  research_id: 'r1',
  confirmed_at: null,
  unsubscribed_at: null,
  confirm_sent_at: null,
  confirm_send_count: 0,
  ...over,
});

export function runSubscribeFlowTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const decide = (rows, researchId = 'r1') => decideSubscribeAction(rows, { researchId, now: NOW });

  // 1. A brand new address gets a row and one confirmation mail.
  {
    const d = decide([]);
    eq('new address inserts unconfirmed', d.action, 'insert-unconfirmed');
    eq('new address is mailed', d.sendConfirmation, true);
    eq('no row id yet', d.rowId, null);
    eq('nothing suppressed it', d.suppressedReason, null);
  }

  // 2. Already confirmed and active for this exact report: do nothing.
  {
    const d = decide([row({ confirmed_at: NOW - 100 })]);
    eq('repeat of a confirmed pair is a noop', d.action, 'noop');
    eq('no mail on a noop', d.sendConfirmation, false);
    eq('the existing row is named', d.rowId, 1);
  }

  // 3. The address proved itself on another report: add the pair silently.
  {
    const rows = [row({ id: 7, research_id: 'other', confirmed_at: NOW - 500 })];
    const d = decide(rows);
    eq('proven mailbox inserts confirmed', d.action, 'insert-confirmed');
    eq('no second confirmation mail', d.sendConfirmation, false);
  }

  // 4. An unsubscribed row elsewhere does NOT count as a proven mailbox.
  {
    const rows = [row({ id: 7, research_id: 'other', confirmed_at: NOW - 500, unsubscribed_at: NOW - 10 })];
    const d = decide(rows);
    eq('an unsubscribed proof does not carry over', d.action, 'insert-unconfirmed');
  }

  // 5. The pair exists unconfirmed and the cooldown has passed: mail again.
  {
    const rows = [row({ confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1, confirm_send_count: 1 })];
    const d = decide(rows);
    eq('unconfirmed pair resends', d.action, 'resend');
    eq('a second mail is allowed after the cooldown', d.sendConfirmation, true);
    eq('the row id is carried', d.rowId, 1);
  }

  // 6. Inside the 24 hour cooldown the mail is suppressed, the row stays.
  {
    const rows = [row({ confirm_sent_at: NOW - 60, confirm_send_count: 1 })];
    const d = decide(rows);
    eq('still a resend action', d.action, 'resend');
    eq('but no mail leaves', d.sendConfirmation, false);
    eq('the reason is the cooldown', d.suppressedReason, 'cooldown');
  }

  // 7. The cooldown is address-wide, not per report.
  {
    const rows = [
      row({ id: 1, research_id: 'other', confirm_sent_at: NOW - 60, confirm_send_count: 1 }),
      row({ id: 2, research_id: 'r1', confirm_sent_at: null, confirm_send_count: 0 }),
    ];
    const d = decide(rows);
    eq('a recent mail on another report suppresses this one', d.sendConfirmation, false);
    eq('reason is the cooldown', d.suppressedReason, 'cooldown');
  }

  // 8. A new pair for an address that was mailed minutes ago is also capped.
  {
    const rows = [row({ id: 1, research_id: 'other', confirm_sent_at: NOW - 60, confirm_send_count: 1 })];
    const d = decide(rows, 'brand-new');
    eq('the row is still created', d.action, 'insert-unconfirmed');
    eq('but no mail leaves', d.sendConfirmation, false);
  }

  // 9. The lifetime cap beats an expired cooldown.
  {
    const rows = [row({ confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1, confirm_send_count: CONFIRM_MAX_SENDS })];
    const d = decide(rows);
    eq('no mail after the lifetime cap', d.sendConfirmation, false);
    eq('reason is the lifetime cap', d.suppressedReason, 'lifetime-cap');
  }

  // 10. The lifetime cap sums across every row of the address.
  {
    const rows = [
      row({ id: 1, research_id: 'a', confirm_send_count: 2, confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1 }),
      row({ id: 2, research_id: 'b', confirm_send_count: 1, confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1 }),
    ];
    eq('three mails across two rows reach the cap', decide(rows, 'c').sendConfirmation, false);
    eq('reason is the lifetime cap', decide(rows, 'c').suppressedReason, 'lifetime-cap');
  }

  // 11. Just under the cap, a mail is still allowed.
  {
    const rows = [row({ confirm_send_count: CONFIRM_MAX_SENDS - 1, confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1 })];
    eq('one mail left', decide(rows).sendConfirmation, true);
  }

  // 12. Reactivate after an unsubscribe: fresh consent cycle.
  {
    const rows = [row({ confirmed_at: NOW - 5000, unsubscribed_at: NOW - 4000, confirm_send_count: CONFIRM_MAX_SENDS, confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1 })];
    const d = decide(rows);
    eq('an unsubscribed pair reactivates', d.action, 'reactivate');
    eq('the reset row does not count against itself', d.sendConfirmation, true);
    eq('the row id is carried', d.rowId, 1);
  }

  // 13. Reactivate still respects the address-wide cooldown.
  {
    const rows = [
      row({ id: 1, research_id: 'r1', unsubscribed_at: NOW - 10 }),
      row({ id: 2, research_id: 'other', confirm_sent_at: NOW - 30, confirm_send_count: 1 }),
    ];
    const d = decide(rows);
    eq('reactivate is still the action', d.action, 'reactivate');
    eq('but the cooldown holds', d.sendConfirmation, false);
  }

  // 14. Reactivate is still capped by mail sent to OTHER rows of the address.
  {
    const rows = [
      row({ id: 1, research_id: 'r1', unsubscribed_at: NOW - 10, confirm_send_count: 1 }),
      row({ id: 2, research_id: 'other', confirm_send_count: CONFIRM_MAX_SENDS, confirm_sent_at: NOW - CONFIRM_COOLDOWN_S - 1 }),
    ];
    eq('other rows still cap it', decide(rows).sendConfirmation, false);
  }

  // 15. A NULL research_id (general list) matches a null request, not 'r1'.
  {
    const rows = [row({ id: 3, research_id: null, confirmed_at: NOW - 10 })];
    eq('null pairs with null', decideSubscribeAction(rows, { researchId: null, now: NOW }).action, 'noop');
    eq('undefined is treated as null', decideSubscribeAction(rows, { researchId: undefined, now: NOW }).action, 'noop');
    eq('null does not match a report id', decide(rows).action, 'insert-confirmed');
  }

  // 16. Defensive input handling: a missing or broken row list is empty.
  {
    eq('undefined rows behave as new', decideSubscribeAction(undefined, { researchId: 'r1', now: NOW }).action, 'insert-unconfirmed');
    eq('a non-array behaves as new', decideSubscribeAction(null, { researchId: 'r1', now: NOW }).action, 'insert-unconfirmed');
  }

  // 17. The input rows are never mutated.
  {
    const rows = [row({ confirm_send_count: 1, confirm_sent_at: NOW - 10 })];
    const before = JSON.stringify(rows);
    decide(rows);
    eq('rows are untouched', JSON.stringify(rows), before);
  }

  // 18. Token freshness window.
  {
    eq('a fresh token passes', confirmTokenFresh(NOW - 10, NOW), true);
    eq('exactly at the limit still passes', confirmTokenFresh(NOW - CONFIRM_TTL_S, NOW), true);
    eq('one second past the limit fails', confirmTokenFresh(NOW - CONFIRM_TTL_S - 1, NOW), false);
    eq('a missing stamp fails', confirmTokenFresh(null, NOW), false);
    eq('a zero stamp fails', confirmTokenFresh(0, NOW), false);
  }

  // 19. The published constants match the documented policy.
  {
    eq('cooldown is one day', CONFIRM_COOLDOWN_S, 86_400);
    eq('lifetime cap is three', CONFIRM_MAX_SENDS, 3);
    eq('link lives seven days', CONFIRM_TTL_S, 7 * 86_400);
  }

  return report;
}
