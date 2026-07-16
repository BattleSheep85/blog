-- TrueRank D1 Schema - migration 012
-- Drop the products -> research(id) FOREIGN KEY by rebuilding `products`
-- without the REFERENCES clause (identical columns/data otherwise).
--
-- Why: migration 011 must rebuild `research` (SQLite can't widen a CHECK
-- in place), but SQLite refuses to DROP a parent table while a child holds
-- a foreign key to it, and D1 rejects the PRAGMA defer_foreign_keys
-- workaround at commit. FK-free is already this repo's deliberate
-- convention for exactly this reason (see affiliate_clicks_v2 in 003):
-- referential integrity is enforced by the application's persist layer
-- (DELETE+INSERT per research_id inside worker/pipeline/*), not the DB.
--
-- MUST run BEFORE 011 on any database created from 001-003 (where products
-- carries the FK). Rebuild-in-place: create, copy, drop, rename, re-index.

CREATE TABLE products_v2 (
  id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL,
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
  metadata TEXT
);

INSERT INTO products_v2 SELECT * FROM products;

DROP TABLE products;
ALTER TABLE products_v2 RENAME TO products;

CREATE INDEX IF NOT EXISTS idx_products_research ON products(research_id);
