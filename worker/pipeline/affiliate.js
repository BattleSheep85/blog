/**
 * Affiliate Enrichment: Add affiliate links to products in the report.
 * Currently supports Amazon Associates.
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

/**
 * Generate an affiliate redirect URL for click tracking.
 */
export function buildAffiliateRedirectUrl(product, network, amazonTag) {
    if (network === 'amazon' && product.affiliate_links?.amazon) {
        return product.affiliate_links.amazon;
    }

    // Default: Amazon search for the product name
    const searchTerm = encodeURIComponent(product.name);
    return `https://www.amazon.com/s?k=${searchTerm}&tag=${amazonTag}`;
}
