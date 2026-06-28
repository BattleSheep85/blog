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
const DAY_MS = 86_400_000;

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
