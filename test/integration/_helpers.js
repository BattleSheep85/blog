// Shared test-only helpers standing in for the db.js functions removed on
// 2026-06-25 (completeResearch, insertProductV2 — deleted from production because
// they lacked the DELETE-before-INSERT idempotency latch persistEngineResult
// uses). Specs still need to seed completed rows + products, so they do the same
// raw-SQL writes here rather than resurrecting the footgun in production db.js.
import { generateId } from '../../worker/lib/db.js';

export async function completeResearch(db, { id, status = 'complete', summary = null, category = null, result = null, sources = null }) {
  await db.prepare(
    "UPDATE research SET status = ?2, summary = ?3, category = ?4, result = ?5, sources = ?6, completed_at = strftime('%s','now') WHERE id = ?1",
  ).bind(id, status, summary, category, result, sources).run();
}

export async function insertProductV2(db, {
  id, researchId, name, brand = null, rank = null, rating = null, price = null,
  imageUrl = null, productUrl = null, affiliateUrl = null,
  pros = '[]', cons = '[]', specs = '{}',
}) {
  await db.prepare(
    `INSERT INTO products (id, research_id, name, brand, rank, rating, price, image_url, product_url, affiliate_url, pros, cons, specs)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
  ).bind(id || generateId(), researchId, name, brand, rank, rating, price, imageUrl, productUrl, affiliateUrl, pros, cons, specs).run();
}
