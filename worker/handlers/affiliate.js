/**
 * Affiliate click tracking handler.
 * GET /api/go/:productId - redirect through affiliate link, log click.
 */

import { logAffiliateClick, logGuideClick } from '../lib/db.js';

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

    // Look up the product's affiliate link (v2 schema: single affiliate_url,
    // with product_url as the untagged fallback).
    const product = await env.DB.prepare(
        'SELECT affiliate_url, product_url FROM products WHERE id = ?'
    ).bind(productId).first();

    const amazonTag = env.AMAZON_ASSOCIATE_TAG || env.AMAZON_AFFILIATE_TAG || '';
    let redirectUrl = `https://www.amazon.com/?tag=${amazonTag}`;

    const candidate = product?.affiliate_url || product?.product_url;
    // Only allow https:// URLs to prevent javascript: or other protocol attacks
    if (candidate && candidate.startsWith('https://')) {
        redirectUrl = candidate;
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

/**
 * Handle GET /api/go/search?q=...&ref=<guide-slug>
 * Redirect for static guide pages (no DB product). Builds an Amazon search
 * link with the associate tag server-side, so the tag stays out of static
 * files, and records a best-effort guide click.
 */
export async function handleAffiliateSearch(request, env) {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    const ref = (url.searchParams.get('ref') || '').slice(0, 64);
    const network = (url.searchParams.get('network') || 'amazon').slice(0, 32);

    const amazonTag = env.AMAZON_ASSOCIATE_TAG || env.AMAZON_AFFILIATE_TAG || '';
    const tagSuffix = amazonTag ? `&tag=${encodeURIComponent(amazonTag)}` : '';
    // Only ever build an amazon.com URL server-side. No user-controlled host,
    // so there is no open-redirect surface.
    const redirectUrl = q
        ? `https://www.amazon.com/s?k=${encodeURIComponent(q)}${tagSuffix}`
        : `https://www.amazon.com/${amazonTag ? `?tag=${encodeURIComponent(amazonTag)}` : ''}`;

    // Best-effort analytics. Never let logging break the redirect.
    try {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipHash = await hashString(ip);
        await logGuideClick(env.DB, { guideSlug: ref, productQuery: q, network, ipHash });
    } catch (err) {
        console.error('Guide click logging failed:', err);
    }

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
