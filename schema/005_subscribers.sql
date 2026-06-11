-- TrueRank D1 Schema - migration 005
-- Email capture for "notify me when research completes / is re-run". One row per
-- (email, research_id) pair; research_id may be NULL for a general/category
-- subscription not tied to a specific report. INSERT OR IGNORE relies on the
-- UNIQUE constraint to make repeat submissions idempotent.

CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    research_id TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(email, research_id)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_research ON subscribers(research_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);
