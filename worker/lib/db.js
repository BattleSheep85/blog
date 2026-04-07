/**
 * D1 database helpers. All queries use parameterized statements.
 */

/**
 * Generate a short random ID (URL-safe).
 */
export function generateId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

// -- Research Reports --

export async function createReport(db, { id, query, filtersJson }) {
    const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
    await db.prepare(
        `INSERT INTO research_reports (id, query, filters_json, status, expires_at)
         VALUES (?, ?, ?, 'pending', ?)`
    ).bind(id, query, filtersJson || '{}', expiresAt).run();
    return id;
}

export async function updateReportStatus(db, id, status, reportJson, sourceCount, filteredCount) {
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    await db.prepare(
        `UPDATE research_reports
         SET status = ?, report_json = ?, source_count = ?, filtered_count = ?, completed_at = ?
         WHERE id = ?`
    ).bind(status, reportJson, sourceCount || 0, filteredCount || 0, completedAt, id).run();
}

export async function getReport(db, id) {
    return db.prepare('SELECT * FROM research_reports WHERE id = ?').bind(id).first();
}

export async function findCachedReport(db, query) {
    return db.prepare(
        `SELECT * FROM research_reports
         WHERE query = ? AND status = 'completed' AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`
    ).bind(query).first();
}

// -- Sources --

export async function insertSource(db, source) {
    await db.prepare(
        `INSERT INTO sources (id, report_id, url, source_type, trust_score, content_summary, is_fake, analysis_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        source.id || generateId(),
        source.reportId,
        source.url,
        source.sourceType,
        source.trustScore || 0,
        source.contentSummary || '',
        source.isFake ? 1 : 0,
        source.analysisJson || '{}'
    ).run();
}

export async function getSourcesByReport(db, reportId) {
    return db.prepare('SELECT * FROM sources WHERE report_id = ? ORDER BY trust_score DESC')
        .bind(reportId).all();
}

// -- Products --

export async function insertProduct(db, product) {
    await db.prepare(
        `INSERT INTO products (id, report_id, name, category, rank, trust_score, specs_json, pros_json, cons_json, best_for, price_range, affiliate_links_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        product.id || generateId(),
        product.reportId,
        product.name,
        product.category || '',
        product.rank || 0,
        product.trustScore || 0,
        JSON.stringify(product.specs || {}),
        JSON.stringify(product.pros || []),
        JSON.stringify(product.cons || []),
        product.bestFor || '',
        product.priceRange || '',
        JSON.stringify(product.affiliateLinks || {})
    ).run();
}

export async function getProductsByReport(db, reportId) {
    return db.prepare('SELECT * FROM products WHERE report_id = ? ORDER BY rank ASC')
        .bind(reportId).all();
}

// -- Affiliate Clicks --

export async function logAffiliateClick(db, { productId, reportId, network, ipHash }) {
    await db.prepare(
        `INSERT INTO affiliate_clicks (product_id, report_id, affiliate_network, ip_hash)
         VALUES (?, ?, ?, ?)`
    ).bind(productId, reportId, network || 'amazon', ipHash || '').run();
}

// -- Feedback --

export async function insertFeedback(db, { reportId, rating, comment }) {
    await db.prepare(
        `INSERT INTO feedback (report_id, rating, comment) VALUES (?, ?, ?)`
    ).bind(reportId, rating, comment || '').run();
}
