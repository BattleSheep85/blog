-- TrueRank D1 Schema - migration 015
-- Timestamp recording when research processing actually started.
--
-- processing_started_at  INTEGER unix epoch seconds when row transitioned
--                        from pending to processing. Prevents the reaper
--                        from failing rows that waited in pending before
--                        processing began.

ALTER TABLE research ADD COLUMN processing_started_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_research_processing_started ON research(status, processing_started_at);

-- Backfill: existing processing rows get created_at as an approximation
UPDATE research SET processing_started_at = created_at
 WHERE status = 'processing' AND processing_started_at IS NULL;
