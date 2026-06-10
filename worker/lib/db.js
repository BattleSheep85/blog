/**
 * D1 database helpers. All queries use parameterized statements.
 * research/products match schema/003_research_v2.sql. Timestamps on the new
 * tables are unix epoch SECONDS (INTEGER), not TEXT datetimes.
 */

/**
 * Generate a short random ID (URL-safe, [a-z0-9]{16}).
 */
export function generateId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

function nowEpoch() {
    return Math.floor(Date.now() / 1000);
}

// -- Research (permanent rows, server-rendered at /research/:slug) --

export async function insertResearch(db, { id, slug, query, canonicalQuery, tier }) {
    await db.prepare(
        `INSERT INTO research (id, slug, query, status, tier, canonical_query, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    ).bind(id, slug, query, tier || 'full', canonicalQuery || null, nowEpoch()).run();
    return id;
}

export async function findResearchByCanonicalQuery(db, canonicalQuery, maxAgeDays = 14) {
    if (!canonicalQuery) return null;
    const cutoff = nowEpoch() - maxAgeDays * 86400;
    return db.prepare(
        `SELECT * FROM research
         WHERE canonical_query = ? AND status = 'complete' AND created_at > ?
         ORDER BY created_at DESC LIMIT 1`
    ).bind(canonicalQuery, cutoff).first();
}

export async function getResearchBySlug(db, slug) {
    return db.prepare('SELECT * FROM research WHERE slug = ?').bind(slug).first();
}

export async function getResearchById(db, id) {
    return db.prepare('SELECT * FROM research WHERE id = ?').bind(id).first();
}

export async function updateResearchStatus(db, id, status) {
    await db.prepare('UPDATE research SET status = ? WHERE id = ?').bind(status, id).run();
}

/**
 * Finalize a research row: status 'complete' or 'failed', plus the report
 * payload. summary/category/result/sources may be null on failure.
 */
export async function completeResearch(db, { id, status, summary, category, result, sources }) {
    await db.prepare(
        `UPDATE research
         SET status = ?, summary = ?, category = ?, result = ?, sources = ?, completed_at = ?
         WHERE id = ?`
    ).bind(status, summary ?? null, category ?? null, result ?? null, sources ?? null, nowEpoch(), id).run();
}

// -- Products (v2 schema; pros/cons/specs/metadata are pre-serialized JSON text) --

export async function insertProductV2(db, p) {
    await db.prepare(
        `INSERT INTO products (id, research_id, name, brand, price, currency, rating,
            image_url, product_url, affiliate_url, manufacturer_url,
            pros, cons, specs, verdict, rank, best_for, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        p.id || generateId(),
        p.researchId,
        p.name,
        p.brand ?? null,
        p.price ?? null,
        p.currency ?? 'USD',
        p.rating ?? null,
        p.imageUrl ?? null,
        p.productUrl ?? null,
        p.affiliateUrl ?? null,
        p.manufacturerUrl ?? null,
        p.pros ?? '[]',
        p.cons ?? '[]',
        p.specs ?? '{}',
        p.verdict ?? null,
        p.rank ?? null,
        p.bestFor ?? null,
        p.metadata ?? null
    ).run();
}

export async function getProductsByResearchId(db, researchId) {
    return db.prepare('SELECT * FROM products WHERE research_id = ? ORDER BY rank ASC')
        .bind(researchId).all();
}

// -- Affiliate Clicks --

export async function logAffiliateClick(db, { productId, reportId, network, ipHash }) {
    await db.prepare(
        `INSERT INTO affiliate_clicks (product_id, report_id, affiliate_network, ip_hash)
         VALUES (?, ?, ?, ?)`
    ).bind(productId, reportId, network || 'amazon', ipHash || '').run();
}

// -- Guide Clicks (static "best of" pages; no FK to products/reports) --

export async function logGuideClick(db, { guideSlug, productQuery, network, ipHash }) {
    await db.prepare(
        `INSERT INTO guide_clicks (guide_slug, product_query, affiliate_network, ip_hash)
         VALUES (?, ?, ?, ?)`
    ).bind(guideSlug || '', productQuery || '', network || 'amazon', ipHash || '').run();
}

// -- Feedback --

export async function insertFeedback(db, { reportId, rating, comment }) {
    await db.prepare(
        `INSERT INTO feedback (report_id, rating, comment) VALUES (?, ?, ?)`
    ).bind(reportId, rating, comment || '').run();
}
