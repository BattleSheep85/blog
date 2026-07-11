-- TrueRank D1 Schema - migration 010
-- Product-claims verification: foundation tables for the deterministic
-- verdict core (worker/lib/verdict.js). Additive + safe — new `claims` table
-- plus nullable ALTER COLUMNs on `research`. Does not touch existing rows or
-- the ranking path. NOT wired into the engine/orchestrator/handlers/UI yet;
-- this migration is foundation only.

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL,              -- spec | marketing | warranty | support
  source_url TEXT,                        -- where the product itself makes this claim
  verdict TEXT,                           -- verified | partially-verified | unsubstantiated | contradicted
  confidence REAL,
  support_weight REAL,
  contradict_weight REAL,
  evidence TEXT,                          -- JSON: [{url, stance, credibility, independence, span}]
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_claims_research ON claims(research_id);

-- Additive, nullable columns on `research` — SQLite ADD COLUMN is safe and
-- won't touch existing rows or the ranking path.
ALTER TABLE research ADD COLUMN subject_url TEXT;
ALTER TABLE research ADD COLUMN overall_verdict TEXT;
ALTER TABLE research ADD COLUMN overall_score REAL;
