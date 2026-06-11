/**
 * IndexNow submission — pings the shared IndexNow endpoint so Bing,
 * DuckDuckGo, Yandex (and other participants) discover newly published or
 * updated pages within hours instead of waiting on a crawl.
 *
 * The key is intentionally public (env.INDEXNOW_KEY): the protocol requires it
 * to be hosted at https://chrisputer.tech/<key>.txt so the search engine can
 * verify ownership. Fire-and-forget only — this must never delay or fail the
 * caller, so it swallows all errors and is a no-op when unconfigured.
 */

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'chrisputer.tech';
const TIMEOUT_MS = 5000;
const MAX_URLS = 10000;

/**
 * Submit one or more URLs to IndexNow. Resolves quietly on success or any
 * failure; never throws. No-op when the key is missing or urls is empty.
 *
 * @param {object} env    Worker env (reads env.INDEXNOW_KEY).
 * @param {string[]} urls Absolute URLs to submit.
 */
export async function submitToIndexNow(env, urls) {
    const key = env && env.INDEXNOW_KEY;
    if (!key || !Array.isArray(urls) || urls.length === 0) return;

    const urlList = urls.slice(0, MAX_URLS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
                host: HOST,
                key,
                keyLocation: `https://${HOST}/${key}.txt`,
                urlList,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            console.error(`[indexnow] non-OK response ${res.status} for ${urlList.length} url(s)`);
        }
    } catch (err) {
        console.error('[indexnow] submission failed:', err instanceof Error ? err.message : String(err));
    } finally {
        clearTimeout(timer);
    }
}
