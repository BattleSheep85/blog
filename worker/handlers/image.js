/**
 * Product image proxy — GET /api/img/:productId
 *
 * Product photos live on third-party CDNs that often block hotlinking by
 * Referer (or rot entirely). Serving them through the worker fixes both:
 * the server-side fetch carries no Referer, and Cloudflare's edge cache
 * (cacheEverything, 7 days) absorbs nearly all origin traffic.
 *
 * Not an open proxy: the URL comes from our own products.image_url column,
 * never from the request. Non-image or placeholder-sized responses 404 so
 * the page's onerror fallback tile takes over cleanly.
 */

const FETCH_TIMEOUT_MS = 10_000;
// Anything under this is a tracking pixel / placeholder, not a photo.
const MIN_BYTES = 1_000;
// Product photos are well under this; a larger declared size is abuse/mis-served
// content, not a product image — reject rather than proxy it through the worker.
const MAX_BYTES = 10 * 1024 * 1024;

function createByteLimitStream(maxBytes) {
    let bytes = 0;
    return new TransformStream({
        transform(chunk, controller) {
            bytes += chunk.byteLength || chunk.length || 0;
            if (bytes > maxBytes) {
                controller.error(new Error(`Image exceeded max size of ${maxBytes} bytes`));
                return;
            }
            controller.enqueue(chunk);
        },
    });
}

export async function handleProductImage(productId, env) {
    const row = await env.DB.prepare(
        'SELECT image_url FROM products WHERE id = ?1'
    ).bind(productId).first();

    const imageUrl = row?.image_url || '';
    if (!imageUrl.startsWith('https://')) {
        return notFoundImage();
    }

    let upstream;
    try {
        upstream = await fetch(imageUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
                // Real-browser UA: several product CDNs 403 obvious bots.
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
            },
            cf: { cacheEverything: true, cacheTtl: 7 * 86400 },
        });
    } catch (err) {
        console.log(`[img-proxy] fetch failed for ${productId}: ${err instanceof Error ? err.message : String(err)}`);
        return notFoundImage();
    }

    const contentType = upstream.headers.get('Content-Type') || '';
    const length = Number(upstream.headers.get('Content-Length')) || null;
    if (!upstream.ok || !contentType.startsWith('image/') || (length !== null && (length < MIN_BYTES || length > MAX_BYTES))) {
        return notFoundImage();
    }

    const body = upstream.body ? upstream.body.pipeThrough(createByteLimitStream(MAX_BYTES)) : null;

    return new Response(body, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
            'X-Content-Type-Options': 'nosniff',
            ...(length !== null ? { 'Content-Length': String(length) } : {}),
        },
    });
}

function notFoundImage() {
    // Plain 404 (no body): <img> fires onerror and the branded fallback tile
    // renders. Short s-maxage so a later backfill shows up within minutes.
    return new Response(null, {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    });
}
