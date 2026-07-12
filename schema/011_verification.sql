-- TrueRank D1 Schema - migration 011
-- Product-verification pipeline: marks a research row as a verification run
-- (as opposed to the legacy ranking pipeline) via the new `kind` column, and
-- widens `research.status` to allow 'needs_input' — the verify orchestrator's
-- outcome when it cannot resolve the subject's own product page and needs the
-- user to paste a URL. Additive + safe: does not touch the ranking pipeline's
-- behavior (existing rows keep kind=NULL and their current status values).
--
-- SQLite has no ALTER TABLE ... DROP/MODIFY CONSTRAINT, so widening the CHECK
-- on `status` requires the standard rebuild-in-place pattern: create the new
-- table shape, copy every row across unchanged, drop the old table, rename.

CREATE TABLE research_v3 (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'processing', 'complete', 'failed', 'needs_input')),
  tier TEXT NOT NULL DEFAULT 'instant',
  category TEXT,
  topical_category TEXT,
  canonical_query TEXT,
  summary TEXT,
  result TEXT,
  sources TEXT,
  facets TEXT,
  clarifications TEXT,
  preview TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  synth_model TEXT,
  subject_url TEXT,
  overall_verdict TEXT,
  overall_score REAL,
  -- NULL/absent = legacy ranking row; 'verification' = a Truth Audit run.
  kind TEXT
);

INSERT INTO research_v3
  SELECT id, slug, query, status, tier, category, topical_category, canonical_query,
         summary, result, sources, facets, clarifications, preview, created_at,
         completed_at, view_count, cost_usd, synth_model, subject_url,
         overall_verdict, overall_score, NULL
  FROM research;

DROP TABLE research;
ALTER TABLE research_v3 RENAME TO research;

CREATE INDEX IF NOT EXISTS idx_research_slug ON research(slug);
CREATE INDEX IF NOT EXISTS idx_research_status ON research(status);
CREATE INDEX IF NOT EXISTS idx_research_created ON research(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_canonical ON research(canonical_query, status, created_at);
CREATE INDEX IF NOT EXISTS idx_research_kind ON research(kind);
