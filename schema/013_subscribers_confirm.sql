-- TrueRank D1 Schema - migration 013
-- Double opt-in for the notification list. Active-recipient predicate becomes:
--   unsubscribed_at IS NULL AND confirmed_at IS NOT NULL
--
-- confirm_token       random per-row token that the confirmation link carries.
-- confirm_sent_at     epoch seconds of the last confirmation mail for the row.
--                     The link is valid for 7 days from this stamp.
-- confirm_send_count  how many confirmation mails this row caused. Capped so a
--                     stranger cannot mail-bomb a victim address.
-- confirmed_at        epoch seconds when the mailbox owner clicked the link.
--                     NULL means the address is not proven and gets no notices.
-- last_notified_at    epoch seconds of the last report-ready notice. Powers the
--                     one-hour dedupe in worker/lib/notify.js.
ALTER TABLE subscribers ADD COLUMN confirm_token TEXT;
ALTER TABLE subscribers ADD COLUMN confirm_sent_at INTEGER;
ALTER TABLE subscribers ADD COLUMN confirm_send_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN confirmed_at INTEGER;
ALTER TABLE subscribers ADD COLUMN last_notified_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token ON subscribers(confirm_token);

-- Grandfather pre-mailer rows: their consent basis is documented in migration
-- 009 and nothing was ever sent to them. The list is tiny, so re-permission
-- mail would itself be unsolicited.
UPDATE subscribers SET confirmed_at = created_at
 WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL;
