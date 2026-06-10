-- TrueRank D1 Schema - migration 003
-- Research v2: ports Exhaustive's research data model (migrations 0000-0008
-- consolidated) into TrueRank. Replaces the old ephemeral research_reports/
-- sources/products tables — their rows are 24h throwaways (user-approved drop).
-- Deliberately NOT ported in this phase: FTS5 table + triggers (phase 3),
-- rate_limits, subscribers, research_events (later phases).
-- Untouched: guide_clicks. affiliate_clicks/feedback are rebuilt WITHOUT their
-- foreign keys to the dropped tables (rows preserved) so inserts keep working.

-- Rebuild affiliate_clicks without FKs to research_reports/products.
CREATE TABLE IF NOT EXISTS affiliate_clicks_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  affiliate_network TEXT NOT NULL DEFAULT 'amazon',
  ip_hash TEXT,
  clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO affiliate_clicks_v2 (id, product_id, report_id, affiliate_network, ip_hash, clicked_at)
  SELECT id, product_id, report_id, affiliate_network, ip_hash, clicked_at FROM affiliate_clicks;
DROP TABLE affiliate_clicks;
ALTER TABLE affiliate_clicks_v2 RENAME TO affiliate_clicks;
CREATE INDEX IF NOT EXISTS idx_clicks_product ON affiliate_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON affiliate_clicks(clicked_at);

-- Rebuild feedback without the FK to research_reports.
CREATE TABLE IF NOT EXISTS feedback_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO feedback_v2 (id, report_id, rating, comment, created_at)
  SELECT id, report_id, rating, comment, created_at FROM feedback;
DROP TABLE feedback;
ALTER TABLE feedback_v2 RENAME TO feedback;

-- Old TrueRank tables (drop children before parent for FK hygiene).
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS research_reports;

-- Research runs. One row per query; timestamps are unix epoch INTEGERs.
CREATE TABLE IF NOT EXISTS research (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
  tier TEXT NOT NULL DEFAULT 'instant',
  category TEXT,
  -- Freeform classifier output (e.g. "Italian restaurants", "mechanical keyboards").
  topical_category TEXT,
  -- Normalized/sorted token form for semantic clustering and cache hits.
  canonical_query TEXT,
  summary TEXT,
  result TEXT,
  sources TEXT,
  -- JSON {is_buyable, needs_location, is_experience, is_content, is_service, is_comparative}
  facets TEXT,
  -- JSON object of clarifying answers, e.g. {"budget": "$200-500"}. Nullable.
  clarifications TEXT,
  -- Quick-answer preview text shown while the full pipeline completes.
  preview TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  -- Sum of LLM usage cost (USD) across every call; NULL on failed/legacy rows.
  cost_usd REAL,
  -- Model that produced the final report, for later metrics aggregation.
  synth_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_slug ON research(slug);
CREATE INDEX IF NOT EXISTS idx_research_status ON research(status);
CREATE INDEX IF NOT EXISTS idx_research_created ON research(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_canonical ON research(canonical_query, status, created_at);

-- Ranked items extracted from a research run. pros/cons/specs/metadata are JSON text.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL REFERENCES research(id),
  name TEXT NOT NULL,
  brand TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  rating REAL,
  image_url TEXT,
  product_url TEXT,
  affiliate_url TEXT,
  manufacturer_url TEXT,
  pros TEXT,
  cons TEXT,
  specs TEXT,
  verdict TEXT,
  rank INTEGER,
  best_for TEXT,
  -- JSON: facet-specific key/value pairs (address, hours, cuisine, ...) that
  -- don't fit the buyable-product columns. Unknown keys render generically.
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_research ON products(research_id);
