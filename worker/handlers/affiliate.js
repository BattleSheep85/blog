/**
 * Affiliate click tracking handler.
 * GET /api/go/:productId — redirect through affiliate link, log click.
 */

import { logAffiliateClick } from '../lib/db.js';

/**
 * Handle GET /api/go/:productId
 * Logs the click and redirects to the affiliate URL.
 */
export async function handleAffiliateClick(productId, request, env) {
    const reportId = new URL(request.url).searchParams.get('ref') || '';
    const network = new URL(request.url).searchParams.get('network') || 'amazon';
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Hash the IP for privacy (don't store raw IPs)
    const ipHash = await hashString(ip);

    // Log the click asynchronously (don't block the redirect)
    const logPromise = logAffiliateClick(env.DB, {
        productId,
        reportId,
        network,
        ipHash,
    }).catch(err => console.error('Click logging failed:', err));

    // Look up the product's affiliate link
    const product = await env.DB.prepare(
        'SELECT affiliate_links_json FROM products WHERE id = ?'
    ).bind(productId).first();

    // Default to Amazon search if product not found
    const amazonTag = env.AMAZON_ASSOCIATE_TAG || '';
    let redirectUrl = `https://www.amazon.com/?tag=${amazonTag}`;

    if (product?.affiliate_links_json) {
        try {
            const links = JSON.parse(product.affiliate_links_json);
            const candidate = links[network] || links.amazon;
            // Only allow https:// URLs to prevent javascript: or other protocol attacks
            if (candidate && candidate.startsWith('https://')) {
                redirectUrl = candidate;
            }
        } catch {
            // Use default redirect
        }
    }

    // Wait for logging before redirecting
    await logPromise;

    return new Response(null, {
        status: 302,
        headers: {
            'Location': redirectUrl,
            'Cache-Control': 'no-cache, no-store',
        },
    });
}

async function hashString(str) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
