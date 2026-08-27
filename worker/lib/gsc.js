/**
 * Google Search Console → D1 ingestion (zero-dependency).
 *
 * Signs a service-account JWT with WebCrypto (RS256) and calls the Search
 * Analytics API over fetch() — no npm, same pattern as the OpenRouter layer.
 * Fail-SOFT by design: if the GSC_SA_KEY secret is absent or malformed, every
 * entry point returns a {skipped} marker instead of throwing, so the cron and
 * a pre-credential deploy are completely safe.
 *
 * Secret: GSC_SA_KEY = the full service-account JSON (as a string).
 * Optional: GSC_SITE_URL = 'sc-domain:chrisputer.tech' (default, domain
 *   property) or 'https://chrisputer.tech/' (URL-prefix property).
 */

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_SITE = 'sc-domain:chrisputer.tech';
const API_BASE = 'https://www.googleapis.com/webmasters/v3/sites';
const URL_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const DAY_MS = 86_400_000;
const GSC_FETCH_TIMEOUT_MS = 10_000;

// Delay between URL Inspection calls. Google documents ~2000 inspections/day
// and a low per-minute burst limit for this API; a fixed gap keeps a ~30-URL
// diagnostic run far under either ceiling without needing a token bucket.
const INSPECTION_DELAY_MS = 1500;

function siteUrl(env) {
    return (env && env.GSC_SITE_URL) || DEFAULT_SITE;
}

// base64url-encode a string or ArrayBuffer/Uint8Array (no padding).
function b64url(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----") → DER ArrayBuffer for WebCrypto.
function pemToDer(pem) {
    const b64 = String(pem)
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s+/g, '');
    const bin = atob(b64);
    const der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    return der.buffer;
}

// Parse the GSC_SA_KEY secret. Returns null (never throws) when absent/invalid
// so callers degrade to a no-op.
export function parseServiceAccount(env) {
    const raw = env && env.GSC_SA_KEY;
    if (!raw) return null;
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!obj || !obj.client_email || !obj.private_key) return null;
        return obj;
    } catch {
        return null;
    }
}

async function getAccessToken(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: sa.client_email,
        scope: GSC_SCOPE,
        aud: sa.token_uri || TOKEN_URI,
        iat: now,
        exp: now + 3600,
    }));
    const signingInput = `${header}.${claim}`;
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToDer(sa.private_key),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${b64url(sig)}`;

    const res = await fetch(sa.token_uri || TOKEN_URI, {
        method: 'POST',
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
    });
    if (!res.ok) throw new Error(`oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (!data.access_token) throw new Error('oauth: no access_token');
    return data.access_token;
}

async function queryAnalytics(accessToken, site, body) {
    const url = `${API_BASE}/${encodeURIComponent(site)}/searchAnalytics/query`;
    const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

function ymd(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Pull the trailing window (GSC data lags ~2 days) and upsert into gsc_metrics.
 * Re-fetching a 5-day window each run backfills late-arriving rows idempotently
 * (UNIQUE(date,query,page) + INSERT OR REPLACE). Fail-soft on no key.
 */
export async function ingestGsc(env, { days = 5, rowLimit = 5000 } = {}) {
    const sa = parseServiceAccount(env);
    if (!sa) return { skipped: 'no GSC_SA_KEY' };
    if (!env.DB) return { skipped: 'no DB' };

    const endMs = Date.now() - 2 * DAY_MS;          // GSC finalizes ~2 days late
    const startMs = endMs - (Math.max(1, days) - 1) * DAY_MS;
    const startDate = ymd(startMs);
    const endDate = ymd(endMs);

    const token = await getAccessToken(sa);
    const data = await queryAnalytics(token, siteUrl(env), {
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page'],
        rowLimit,
        dataState: 'all',
    });

    const rows = Array.isArray(data.rows) ? data.rows : [];
    const fetchedAt = Math.floor(Date.now() / 1000);
    let written = 0;

    // INSERT OR REPLACE keeps the latest figures for a (date,query,page) key.
    const stmt = env.DB.prepare(
        `INSERT OR REPLACE INTO gsc_metrics
           (date, query, page, clicks, impressions, ctr, position, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    );
    for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50)
            .filter((r) => Array.isArray(r.keys) && r.keys.length === 3)
            .map((r) => stmt.bind(
                String(r.keys[0]),
                String(r.keys[1]).slice(0, 500),
                String(r.keys[2]).slice(0, 1000),
                Math.round(r.clicks || 0),
                Math.round(r.impressions || 0),
                Number(r.ctr || 0),
                Number(r.position || 0),
                fetchedAt,
            ));
        if (chunk.length) {
            await env.DB.batch(chunk);
            written += chunk.length;
        }
    }

    return { ingested: written, startDate, endDate, site: siteUrl(env) };
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call urlInspection.index:inspect for one URL. Returns the raw
 * inspectionResult, or throws on a non-OK response (caller decides how to
 * handle 429 vs other errors).
 *
 * Response fields we read (per the URL Inspection API reference):
 *   indexStatusResult.verdict          — PASS / NEUTRAL / FAIL / VERDICT_UNSPECIFIED
 *   indexStatusResult.coverageState    — human-readable state, e.g. "Submitted
 *                                        and indexed", "Crawled - currently not
 *                                        indexed", "Discovered - currently not
 *                                        indexed", "URL is unknown to Google"
 *   indexStatusResult.robotsTxtState   — ALLOWED / DISALLOWED
 *   indexStatusResult.indexingState    — INDEXING_ALLOWED / BLOCKED_BY_* etc.
 *   indexStatusResult.pageFetchState   — SUCCESSFUL / NOT_FOUND / SOFT_404 etc.
 *   indexStatusResult.lastCrawlTime    — RFC3339 timestamp, absent if never crawled
 */
async function inspectUrl(accessToken, siteUrl, inspectionUrl) {
    const res = await fetch(URL_INSPECTION_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl, siteUrl }),
    });
    if (res.status === 429) {
        const err = new Error('urlInspection 429: rate limited');
        err.rateLimited = true;
        throw err;
    }
    if (!res.ok) {
        throw new Error(`urlInspection ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
}

// Flatten one inspection response into the fields the report needs.
function summarizeInspection(url, label, body) {
    const r = body?.inspectionResult?.indexStatusResult ?? {};
    return {
        url,
        label,
        verdict: r.verdict ?? null,
        coverageState: r.coverageState ?? null,
        robotsTxtState: r.robotsTxtState ?? null,
        indexingState: r.indexingState ?? null,
        pageFetchState: r.pageFetchState ?? null,
        lastCrawlTime: r.lastCrawlTime ?? null,
    };
}

// Research rows for one labeled slice of the sample. `orderBy` and `having`
// are literal SQL fragments built from fixed strings only (never user input).
async function fetchResearchSlugs(env, { orderBy, having = '', limit }) {
    const sql = `SELECT slug FROM research
       WHERE status = 'complete' ${having}
       ORDER BY ${orderBy}
       LIMIT ?1`;
    const rows = await env.DB.prepare(sql).bind(limit).all();
    return (rows.results ?? []).map((r) => r.slug);
}

// One slug per non-duplicate query (LOWER(TRIM(query)) has exactly one
// complete row). Picks the newest row per query group.
async function fetchNoDuplicateSlugs(env, limit) {
    const rows = await env.DB.prepare(
        `SELECT r.slug FROM research r
           JOIN (
             SELECT LOWER(TRIM(query)) AS q, COUNT(*) AS n
               FROM research WHERE status = 'complete'
              GROUP BY q HAVING n = 1
           ) uniq ON LOWER(TRIM(r.query)) = uniq.q
          WHERE r.status = 'complete'
          ORDER BY r.created_at DESC
          LIMIT ?1`,
    ).bind(limit).all();
    return (rows.results ?? []).map((r) => r.slug);
}

// One slug per duplicate-query group, drawn from distinct groups (so the
// sample covers separate duplicate clusters rather than one group 5x).
async function fetchDuplicateGroupSlugs(env, limit) {
    const groups = await env.DB.prepare(
        `SELECT LOWER(TRIM(query)) AS q, COUNT(*) AS n
           FROM research WHERE status = 'complete'
          GROUP BY q HAVING n > 1
          ORDER BY n DESC
          LIMIT ?1`,
    ).bind(limit).all();

    const slugs = [];
    for (const g of groups.results ?? []) {
        const row = await env.DB.prepare(
            `SELECT slug FROM research
               WHERE status = 'complete' AND LOWER(TRIM(query)) = ?1
               ORDER BY created_at DESC LIMIT 1`,
        ).bind(g.q).first();
        if (row?.slug) slugs.push(row.slug);
    }
    return slugs;
}

// The one non-research page GSC actually served impressions to, used as a
// content-type control (indexed blog post vs research pages). Picked from
// stored gsc_metrics rows rather than hardcoded, since the two blog posts
// aren't tracked in D1 the way research rows are.
async function fetchBlogControlUrl(env, origin) {
    const row = await env.DB.prepare(
        `SELECT page, SUM(impressions) AS impr
           FROM gsc_metrics
          WHERE page NOT LIKE ?1 AND page NOT LIKE ?2 AND page <> ?3
          GROUP BY page
          ORDER BY impr DESC
          LIMIT 1`,
    ).bind(`${origin}/research/%`, `${origin}/best/%`, `${origin}/`).first();
    return row?.page ?? null;
}

// Build the deliberately-chosen diagnostic sample described in the task:
// homepage, 5 highest-viewed, 5 newest, 5 oldest, 5 non-duplicate queries,
// 5 distinct duplicate-query groups, and one blog-post control. Duplicate
// URLs across slices are collapsed to a single inspection (first label wins).
export async function buildInspectionSample(env, origin) {
    const SLICE_SIZE = 5;
    const [topViewed, newest, oldest, noDup, dupGroups, blogUrl] = await Promise.all([
        fetchResearchSlugs(env, { orderBy: 'view_count DESC, created_at DESC', limit: SLICE_SIZE }),
        fetchResearchSlugs(env, { orderBy: 'created_at DESC', limit: SLICE_SIZE }),
        fetchResearchSlugs(env, { orderBy: 'created_at ASC', limit: SLICE_SIZE }),
        fetchNoDuplicateSlugs(env, SLICE_SIZE),
        fetchDuplicateGroupSlugs(env, SLICE_SIZE),
        fetchBlogControlUrl(env, origin),
    ]);

    const labeled = [
        { url: `${origin}/`, label: 'homepage' },
        ...topViewed.map((s) => ({ url: `${origin}/research/${s}`, label: 'top_viewed' })),
        ...newest.map((s) => ({ url: `${origin}/research/${s}`, label: 'newest' })),
        ...oldest.map((s) => ({ url: `${origin}/research/${s}`, label: 'oldest' })),
        ...noDup.map((s) => ({ url: `${origin}/research/${s}`, label: 'no_duplicate' })),
        ...dupGroups.map((s) => ({ url: `${origin}/research/${s}`, label: 'has_duplicate' })),
        ...(blogUrl ? [{ url: blogUrl, label: 'blog_control' }] : []),
    ];

    const seen = new Set();
    return labeled.filter((entry) => {
        if (seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
    });
}

/**
 * Run the URL Inspection sample end to end: build the sample, inspect each
 * URL with a fixed delay between calls, and stop cleanly (returning whatever
 * was collected so far) on a 429. Fail-soft: no GSC_SA_KEY returns {skipped}.
 */
export async function runUrlInspectionSample(env, origin) {
    const sa = parseServiceAccount(env);
    if (!sa) return { skipped: 'no GSC_SA_KEY' };
    if (!env.DB) return { skipped: 'no DB' };

    const sample = await buildInspectionSample(env, origin);
    const token = await getAccessToken(sa);
    const site = siteUrl(env);

    const results = [];
    let stoppedEarly = false;
    for (let i = 0; i < sample.length; i++) {
        const { url, label } = sample[i];
        try {
            const body = await inspectUrl(token, site, url);
            results.push(summarizeInspection(url, label, body));
        } catch (err) {
            if (err.rateLimited) {
                stoppedEarly = true;
                break;
            }
            results.push({ url, label, error: err instanceof Error ? err.message : String(err) });
        }
        if (i < sample.length - 1) await sleep(INSPECTION_DELAY_MS);
    }

    return {
        site,
        sample_size: sample.length,
        inspected: results.length,
        stopped_early_rate_limited: stoppedEarly,
        results,
    };
}

/**
 * List the sitemaps Search Console has registered for the configured site,
 * per https://developers.google.com/webmaster-tools/v1/sitemaps/list.
 * Read-only, works with the webmasters.readonly scope. Fail-soft: no
 * GSC_SA_KEY returns {skipped}.
 */
export async function listSitemaps(env) {
    const sa = parseServiceAccount(env);
    if (!sa) return { skipped: 'no GSC_SA_KEY' };

    const token = await getAccessToken(sa);
    const site = siteUrl(env);
    const url = `${API_BASE}/${encodeURIComponent(site)}/sitemaps`;
    const res = await fetch(url, {
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        return { site, status: res.status, error: (await res.text()).slice(0, 500) };
    }
    const data = await res.json();
    return { site, sitemap: data.sitemap ?? [] };
}

/**
 * List the Search Console properties this service account can see, per
 * https://developers.google.com/webmaster-tools/v1/sites/list. Read-only.
 * Fail-soft: no GSC_SA_KEY returns {skipped}.
 */
export async function listSites(env) {
    const sa = parseServiceAccount(env);
    if (!sa) return { skipped: 'no GSC_SA_KEY' };

    const token = await getAccessToken(sa);
    const res = await fetch(API_BASE, {
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        return { status: res.status, error: (await res.text()).slice(0, 500) };
    }
    const data = await res.json();
    return { siteEntry: data.siteEntry ?? [] };
}

/**
 * Submit a sitemap, per
 * https://developers.google.com/webmaster-tools/v1/sitemaps/submit.
 * The webmasters.readonly scope cannot write, so this is expected to return
 * a 403. Callers should surface that plainly rather than retry.
 */
export async function submitSitemap(env, feedpath) {
    const sa = parseServiceAccount(env);
    if (!sa) return { skipped: 'no GSC_SA_KEY' };

    const token = await getAccessToken(sa);
    const site = siteUrl(env);
    const url = `${API_BASE}/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feedpath)}`;
    const res = await fetch(url, {
        method: 'PUT',
        signal: AbortSignal.timeout(GSC_FETCH_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        return { site, feedpath, status: res.status, error: (await res.text()).slice(0, 500) };
    }
    return { site, feedpath, status: res.status, submitted: true };
}

/**
 * Top GSC rows for the /metrics snapshot + flywheel demand. Returns the highest
 * impression queries and the "opportunity" set (high impressions, weak CTR or
 * positions 5-20 a dedicated page could win). Aggregated across the stored
 * window. Fail-soft → empty arrays when the table is empty / absent.
 */
export async function getGscSummary(env, { limit = 20, sinceDays = 28 } = {}) {
    if (!env.DB) return { available: false, top: [], opportunities: [] };
    const since = ymd(Date.now() - sinceDays * DAY_MS);
    try {
        const top = await env.DB.prepare(
            `SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                    ROUND(AVG(position), 1) AS position
             FROM gsc_metrics WHERE date >= ?1
             GROUP BY query ORDER BY impressions DESC LIMIT ?2`,
        ).bind(since, limit).all();

        // Demand a dedicated page could capture: real impressions, ranking just
        // off page-1 (positions 5-20), so a focused run can lift it.
        const opps = await env.DB.prepare(
            `SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
                    ROUND(AVG(position), 1) AS position
             FROM gsc_metrics WHERE date >= ?1
             GROUP BY query
             HAVING impressions >= 20 AND position BETWEEN 5 AND 20
             ORDER BY impressions DESC LIMIT ?2`,
        ).bind(since, limit).all();

        return {
            available: true,
            top: top.results ?? [],
            opportunities: opps.results ?? [],
        };
    } catch (err) {
        console.error('[gsc] summary failed:', err instanceof Error ? err.message : String(err));
        return { available: false, top: [], opportunities: [] };
    }
}
