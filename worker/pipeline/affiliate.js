/**
 * Affiliate Enrichment: Add affiliate links to products in the report JSON.
 * Currently supports Amazon Associates.
 *
 * The enriched `affiliate_links` object only lives in the report JSON blob
 * (research.result column + KV report copy) consumed by the legacy
 * /api/report client renderer (public/js/render.js). It is NOT persisted to
 * products.affiliate_url — the server renderer rejects Amazon search URLs
 * and builds its own tagged search fallback instead.
 */

/**
 * Enrich report products with affiliate links.
 * Takes the report JSON and adds affiliate URLs to each product.
 */
export function enrichWithAffiliateLinks(report, amazonTag) {
    if (!report.products || !amazonTag) {
        return report;
    }

    const enrichedProducts = report.products.map(product => {
        const affiliateLinks = {};

        // Amazon Associates search link
        const searchTerm = encodeURIComponent(product.name);
        affiliateLinks.amazon = `https://www.amazon.com/s?k=${searchTerm}&tag=${amazonTag}`;

        return {
            ...product,
            affiliate_links: affiliateLinks,
        };
    });

    return {
        ...report,
        products: enrichedProducts,
    };
}
