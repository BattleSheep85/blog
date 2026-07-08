-- TrueRank D1 Schema - migration 009
-- Consent + self-serve unsubscribe for the email list (GDPR/CAN-SPAM).
--
-- created_at already records WHEN consent was given (the opt-in submit is the
-- consent basis — a user actively asking to be notified). This migration adds:
--   unsub_token       — random per-row token for one-click unsubscribe links
--                        (goes in the List-Unsubscribe header + email footer when
--                        a mailer is added). New rows get one; pre-mailer rows may
--                        be NULL (nothing was ever sent to them).
--   unsubscribed_at    — epoch seconds when the user unsubscribed; NULL = active.
--                        Any future send MUST filter `WHERE unsubscribed_at IS NULL`.
ALTER TABLE subscribers ADD COLUMN unsub_token TEXT;
ALTER TABLE subscribers ADD COLUMN unsubscribed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON subscribers(unsub_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
