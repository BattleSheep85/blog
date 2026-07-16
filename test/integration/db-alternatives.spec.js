// Integration coverage for worker/lib/db.js's findRankingForCategory — the
// "Better alternatives" section's read-side lookup. Exercised against a real
// (in-memory Miniflare) D1 with the full schema (including migration 011's
// `kind` column) so the exact-match / LIKE-fallback / verification-exclusion
// SQL is validated for real, not just asserted against a mock.
import { env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import { applySchema } from './_schema.js';
import { insertProductV2 } from './_helpers.js';
import * as db from '../../worker/lib/db.js';

beforeAll(async () => {
  await applySchema(env.DB);
});

// completeResearch from _helpers.js doesn't set kind/topical_category, so
// write rows directly here to cover both the ranking (kind NULL) and
// verification (kind='verification') shapes findRankingForCategory must
// distinguish between.
async function seedResearchRow(db_, { id, slug, query, category = null, topicalCategory = null, canonicalQuery = null, kind = null, status = 'complete', createdAt = null }) {
  await db_.prepare(
    `INSERT INTO research (id, slug, query, status, category, topical_category, canonical_query, kind, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE(?9, strftime('%s','now')))`,
  ).bind(id, slug, query, status, category, topicalCategory, canonicalQuery, kind, createdAt).run();
}

describe('db.js findRankingForCategory', () => {
  it('returns null for an empty/whitespace category', async () => {
    expect(await db.findRankingForCategory(env.DB, '')).toBeNull();
    expect(await db.findRankingForCategory(env.DB, '   ')).toBeNull();
    expect(await db.findRankingForCategory(env.DB, null)).toBeNull();
  });

  it('returns null when no ranking row matches the category', async () => {
    expect(await db.findRankingForCategory(env.DB, 'nonexistent-category-xyz')).toBeNull();
  });

  it('finds an exact normalized category match and its top-N products by rank', async () => {
    const rid = db.generateId();
    await seedResearchRow(env.DB, { id: rid, slug: 'best-mesh-wifi', query: 'best mesh wifi', category: 'Mesh WiFi Routers', kind: null });
    await insertProductV2(env.DB, { researchId: rid, name: 'Third', rank: 3, rating: 4.0 });
    await insertProductV2(env.DB, { researchId: rid, name: 'First', rank: 1, rating: 4.8 });
    await insertProductV2(env.DB, { researchId: rid, name: 'Second', rank: 2, rating: 4.5 });
    await insertProductV2(env.DB, { researchId: rid, name: 'Fourth', rank: 4, rating: 3.5 });

    // Case/whitespace-insensitive exact match.
    const found = await db.findRankingForCategory(env.DB, '  mesh wifi routers  ');
    expect(found).not.toBeNull();
    expect(found.research.id).toBe(rid);
    expect(found.products.map((p) => p.name)).toEqual(['First', 'Second', 'Third']); // default limit 3, ordered by rank
  });

  it('respects a custom limit', async () => {
    const rid = db.generateId();
    await seedResearchRow(env.DB, { id: rid, slug: 'best-standing-desks', query: 'best standing desks', category: 'Standing Desks', kind: null });
    await insertProductV2(env.DB, { researchId: rid, name: 'A', rank: 1 });
    await insertProductV2(env.DB, { researchId: rid, name: 'B', rank: 2 });

    const found = await db.findRankingForCategory(env.DB, 'standing desks', 1);
    expect(found.products.map((p) => p.name)).toEqual(['A']);
  });

  it('falls back to a LIKE match on category/topical_category when no exact match exists', async () => {
    const rid = db.generateId();
    await seedResearchRow(env.DB, { id: rid, slug: 'best-noise-canceling', query: 'best noise canceling headphones', category: 'Noise-Canceling Headphones (Over-Ear)', kind: null });
    await insertProductV2(env.DB, { researchId: rid, name: 'Sony', rank: 1 });

    const found = await db.findRankingForCategory(env.DB, 'noise-canceling headphones');
    expect(found).not.toBeNull();
    expect(found.research.id).toBe(rid);
  });

  it('excludes verification rows (kind = "verification") even on an exact category match', async () => {
    const vid = db.generateId();
    await seedResearchRow(env.DB, { id: vid, slug: 'verify-acme-headphones', query: 'Acme Headphones', category: 'exclusive-category-verify-only', kind: 'verification' });
    await insertProductV2(env.DB, { researchId: vid, name: 'Acme', rank: 1 });

    expect(await db.findRankingForCategory(env.DB, 'exclusive-category-verify-only')).toBeNull();
  });

  it('excludes non-complete ranking rows and rows with zero products', async () => {
    const pendingId = db.generateId();
    await seedResearchRow(env.DB, { id: pendingId, slug: 'pending-cat', query: 'q', category: 'pending-only-category', kind: null, status: 'pending' });
    await insertProductV2(env.DB, { researchId: pendingId, name: 'X', rank: 1 });
    expect(await db.findRankingForCategory(env.DB, 'pending-only-category')).toBeNull();

    const noProductsId = db.generateId();
    await seedResearchRow(env.DB, { id: noProductsId, slug: 'no-products-cat', query: 'q', category: 'no-products-category', kind: null, status: 'complete' });
    expect(await db.findRankingForCategory(env.DB, 'no-products-category')).toBeNull();
  });

  it('prefers the most recent complete ranking when multiple match', async () => {
    const olderId = db.generateId();
    await seedResearchRow(env.DB, { id: olderId, slug: 'older-blenders', query: 'best blenders', category: 'Blenders', kind: null, createdAt: 1000 });
    await insertProductV2(env.DB, { researchId: olderId, name: 'Old Pick', rank: 1 });

    const newerId = db.generateId();
    await seedResearchRow(env.DB, { id: newerId, slug: 'newer-blenders', query: 'best blenders 2026', category: 'Blenders', kind: null, createdAt: 2000 });
    await insertProductV2(env.DB, { researchId: newerId, name: 'New Pick', rank: 1 });

    const found = await db.findRankingForCategory(env.DB, 'Blenders');
    expect(found.research.id).toBe(newerId);
    expect(found.products[0].name).toBe('New Pick');
  });
});
