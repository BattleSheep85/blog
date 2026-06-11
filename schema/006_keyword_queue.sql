-- TrueRank D1 Schema - migration 006
-- Phase 5: programmatic-SEO flywheel. A queue of hand-curated, high-intent
-- "best X under $Y" buyable queries that the cron flywheel drains one at a
-- time (budget- and rate-gated) into real research runs. Production-gated:
-- runFlywheelTick() bails unless SERPER_API_KEY is set, so this table can
-- exist and be seeded long before any tick actually consumes from it.
--
-- Timestamps are unix epoch SECONDS (INTEGER), matching the research table.

CREATE TABLE IF NOT EXISTS keyword_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','done','failed')),
  research_id TEXT,
  created_at INTEGER NOT NULL,
  done_at INTEGER
);

-- The claim query orders by (status, priority DESC, id); this index makes the
-- "next pending, highest priority" pick a cheap range scan.
CREATE INDEX IF NOT EXISTS idx_keyword_queue_status_priority
  ON keyword_queue (status, priority DESC);
