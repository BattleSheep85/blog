// Note: DuckDuckGo HTML scraping is permanently CAPTCHA-blocked from datacenter
// and Cloudflare IPs and returns empty results. It has been removed from the
// active fallback chain in worker/engine/tools.js, but this module is preserved
// for tests and fail-safe handling.
//
// ScrapedSource is a runtime-erased type: { url, title, content, source, publishedAt? }

const DDG_TIMEOUT_MS = 8000;

// A real browser User-Agent is REQUIRED. The previous port sent a custom
// "ChrisputerLabs/1.0" UA, which DDG answers with an HTTP 202 "anomaly" page
// (0 organic results). With the UA + Accept + Accept-Language headers below,
// a GET to html.duckduckgo.com/html/ returns HTTP 200 with parseable results.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  Referer: 'https://duckduckgo.com/',
};

/**
 * Scrape DuckDuckGo HTML search results (no auth, no API key).
 *
 * Endpoint diagnosis (verified live 2026-06-11 via curl from a dev network):
 *   - GET  html.duckduckgo.com/html/?q=...  + browser headers  -> HTTP 200, 10
 *     clean organic results. THIS is the only variant that works.
 *   - POST html.duckduckgo.com/html/ (form body)               -> HTTP 202 anomaly.
 *   - GET/POST lite.duckduckgo.com/lite/                       -> HTTP 202 anomaly.
 *   - Any non-browser User-Agent                               -> HTTP 202 anomaly.
 *
 * Per-IP soft-block caveat: DDG rate-limits scraping per source IP. After a
 * burst of requests from one IP it serves the 202 "anomaly" page to ALL
 * subsequent queries (observed on the dev network; did not recover after a
 * 45s cooldown). Cloudflare Worker egress IPs differ from and rotate relative
 * to any single dev IP, so this is best-effort: when DDG blocks us we detect
 * the anomaly page and return [] gracefully rather than throwing. Callers must
 * treat an empty result as "no free results available", not as a hard error.
 */
export async function duckduckgoSearch(query) {
  try {
    const params = new URLSearchParams({ q: query, kl: 'us-en' });
    const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      signal: AbortSignal.timeout(DDG_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
    });

    // DDG returns 202 (not an error status) for its anti-bot "anomaly" page.
    if (response.status === 202) {
      console.log(`[ddg] anomaly/anti-bot page (202) q="${query}" -> []`);
      return [];
    }
    if (!response.ok) {
      console.log(`[ddg] HTTP ${response.status} q="${query}"`);
      return [];
    }

    const html = await response.text();

    // Defensive: some blocks come back 200 but still contain the anomaly body.
    if (html.includes('anomaly-modal') || html.includes('detected unusual')) {
      console.log(`[ddg] anomaly body in 200 response q="${query}" -> []`);
      return [];
    }

    return parseResults(html, query);
  } catch (err) {
    console.log(
      `[ddg] ERROR q="${query}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

function parseResults(html, query) {
  const results = [];

  // Each organic result is a <div class="result ..."> block. Ads carry the
  // extra "result--ad" class and are skipped. Inside each block:
  //   <a class="result__a" href="//duckduckgo.com/l/?uddg=<ENCODED_URL>&rut=...">Title</a>
  //   <a class="result__snippet" href="...">Snippet text (with <b> highlights)</a>
  // (verified live 2026-06-11). The real destination URL is the url-encoded
  // `uddg` query param on the DDG redirect link.
  const blocks = html.split(/<div class="result\b/);

  for (let i = 1; i < blocks.length && results.length < 10; i++) {
    const block = blocks[i];

    // Skip sponsored/ad results (class "result--ad" / "result--ad-text").
    if (/^[^>]*result--ad/.test(block.slice(0, 60))) continue;

    // Title link: capture href + inner text up to the closing </a>.
    const titleMatch = block.match(
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!titleMatch) continue;

    const href = titleMatch[1];
    const title = decodeEntities(stripTags(titleMatch[2]).trim());
    if (!title) continue;

    const url = resolveUrl(href);
    if (!url) continue;

    // Snippet link: inner text up to its closing </a>.
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
    );
    const snippet = snippetMatch
      ? decodeEntities(stripTags(snippetMatch[1]).trim())
      : '';

    results.push({
      url,
      title,
      content: snippet,
      source: 'duckduckgo',
    });
  }

  console.log(`[ddg] q="${query}" parsed -> ${results.length} results`);
  return results;
}

/**
 * Resolve a DDG result href to the real destination URL.
 * Modern markup wraps every link as //duckduckgo.com/l/?uddg=<ENCODED>&rut=...
 * Older/edge markup may use a direct http(s) href. Returns '' if unusable.
 */
function resolveUrl(href) {
  if (!href) return '';

  // &amp; HTML-encodes the param separator in the raw markup, so the encoded
  // URL runs up to "&amp;rut=". Match the uddg value, stopping at & or ".
  const uddg = href.match(/uddg=([^&"]+)/);
  if (uddg) {
    try {
      const decoded = decodeURIComponent(uddg[1]);
      return decoded.startsWith('http') ? decoded : '';
    } catch {
      return '';
    }
  }

  return /^https?:\/\//.test(href) ? href : '';
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/');
}
