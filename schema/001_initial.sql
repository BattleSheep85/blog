-- TrueRank D1 Schema

CREATE TABLE IF NOT EXISTS research_reports (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    filters_json TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    report_json TEXT,
    source_count INTEGER DEFAULT 0,
    filtered_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_query ON research_reports(query);
CREATE INDEX IF NOT EXISTS idx_reports_status ON research_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_expires ON research_reports(expires_at);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    url TEXT NOT NULL,
    source_type TEXT NOT NULL,
    trust_score REAL DEFAULT 0.0,
    content_summary TEXT,
    is_fake INTEGER DEFAULT 0,
    analysis_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES research_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_sources_report ON sources(report_id);
CREATE INDEX IF NOT EXISTS idx_sources_trust ON sources(trust_score);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    rank INTEGER,
    trust_score REAL DEFAULT 0.0,
    specs_json TEXT DEFAULT '{}',
    pros_json TEXT DEFAULT '[]',
    cons_json TEXT DEFAULT '[]',
    best_for TEXT,
    price_range TEXT,
    affiliate_links_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES research_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_products_report ON products(report_id);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    report_id TEXT NOT NULL,
    affiliate_network TEXT NOT NULL DEFAULT 'amazon',
    ip_hash TEXT,
    clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (report_id) REFERENCES research_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_clicks_product ON affiliate_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_clicks_date ON affiliate_clicks(clicked_at);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES research_reports(id)
);
