-- TrueRank D1 Schema - migration 008
-- Google Search Console daily metrics, ingested by worker/lib/gsc.js on the
-- scheduled() cron (once/day, fail-soft on no credential). One row per
-- (date, query, page); re-ingesting the trailing window REPLACEs rows so
-- late-arriving GSC figures self-heal. Powers the /metrics GSC block and the
-- demand-driven keyword flywheel (ending the "funnel freeze").

CREATE TABLE IF NOT EXISTS gsc_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                 -- YYYY-MM-DD (the GSC data date)
  query TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  UNIQUE(date, query, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_date ON gsc_metrics(date);
CREATE INDEX IF NOT EXISTS idx_gsc_impressions ON gsc_metrics(impressions DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_query ON gsc_metrics(query);
