/**
 * Dispositions for pages Google has impressions for that no longer resolve.
 * Found via the GSC sitemaps/impressions audit (2026-08-03): both entries
 * live-checked as 404 with no equivalent content elsewhere on the site, so
 * both get 410 Gone. 410 tells Google to drop the URL promptly instead of
 * retrying a dead page for months, unlike a bare 404.
 *
 * Add a path here (with a leading slash, no origin) to change how the worker
 * answers it. Use { status: 410 } for content that is genuinely gone, or
 * { status: 301, location: '/some/equivalent/path' } when the same content
 * now lives somewhere else.
 */
export const DEAD_URL_DISPOSITIONS = {
    '/posts/zero-trust-small-business-budget/': { status: 410 },
    '/posts/disaster-recovery-kansas-tornado/': { status: 410 },
};

// Returns a Response for a known dead URL, or null if `path` isn't one.
export function deadUrlResponse(path) {
    const disposition = DEAD_URL_DISPOSITIONS[path];
    if (!disposition) return null;

    if (disposition.status === 301) {
        return new Response(null, {
            status: 301,
            headers: {
                'Location': disposition.location,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    }

    // 410 Gone: no body needed, short cache so Google keeps re-checking
    // until it drops the URL rather than caching the verdict forever.
    return new Response('Gone', {
        status: 410,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
