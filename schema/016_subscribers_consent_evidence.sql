-- TrueRank D1 Schema - migration 016
-- Record consent evidence for email subscribers (GDPR Art. 7).
--
-- consent_ip_hash      Salted SHA-256 hash of subscriber IP at signup (never raw IP).
-- consent_user_agent   User-Agent string of the subscriber at signup.
-- consent_source       Source page or form where consent was captured.

ALTER TABLE subscribers ADD COLUMN consent_ip_hash TEXT;
ALTER TABLE subscribers ADD COLUMN consent_user_agent TEXT;
ALTER TABLE subscribers ADD COLUMN consent_source TEXT;
