-- TrueRank D1 Schema - migration 002
-- Click tracking for static "best of" guide pages. These have no associated
-- products/reports row, so unlike affiliate_clicks there are no foreign keys.

CREATE TABLE IF NOT EXISTS guide_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guide_slug TEXT,
    product_query TEXT,
    affiliate_network TEXT NOT NULL DEFAULT 'amazon',
    ip_hash TEXT,
    clicked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_clicks_slug ON guide_clicks(guide_slug);
CREATE INDEX IF NOT EXISTS idx_guide_clicks_date ON guide_clicks(clicked_at);
