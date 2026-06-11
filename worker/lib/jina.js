const JINA_TIMEOUT_MS = 8000;
const DIRECT_TIMEOUT_MS = 8000;
const MAX_CONTENT_LENGTH = 15_000;

/**
 * Fetch full page content as markdown via Jina Reader.
 * Free tier: ~20 req/min. Returns clean markdown with headings, lists, tables preserved.
 *
 * Resilience: Jina's free tier throttles aggressively (~20 req/min), and under the
 * flywheel + organic load we routinely hit 429/5xx or empty bodies. When the Jina
 * path fails for any reason (network error, timeout, 429/5xx, or an empty/blocked
 * body) we fall back to fetching the URL directly with browser-like headers and a
 * dependency-free HTML-to-text extraction so the pipeline keeps making progress
 * instead of silently losing the page. Both paths return the same shape (a string,
 * capped at MAX_CONTENT_LENGTH). The graceful empty-string failure remains the final
 * fallback; this function never throws.
 */
export async function fetchPageContent(url) {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
      headers: {
        Accept: 'text/markdown',
        'X-Return-Format': 'markdown',
      },
    });

    if (!response.ok) {
      console.log(`[jina] HTTP ${response.status} for ${url}`);
      return await fetchDirect(url);
    }

    const text = await response.text();
    // Jina sometimes returns boilerplate for blocked/empty pages
    if (text.length < 100) return await fetchDirect(url);
    return text.slice(0, MAX_CONTENT_LENGTH);
  } catch (err) {
    console.log(`[jina] ERROR ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return await fetchDirect(url);
  }
}

/**
 * Direct fallback: fetch the raw page with browser-like headers and extract
 * readable text without any DOM library. Returns '' on any failure; never throws.
 */
async function fetchDirect(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log(`[jina:direct] HTTP ${response.status} for ${url}`);
      return '';
    }

    const html = await response.text();
    if (!html) return '';
    return extractReadableText(html);
  } catch (err) {
    console.log(`[jina:direct] ERROR ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return '';
  }
}

/**
 * Convert raw HTML to readable plain text with no DOM library:
 * strip non-content blocks, prefer <article>/<main> (else <body>), strip remaining
 * tags, decode common entities, collapse whitespace, and cap at MAX_CONTENT_LENGTH.
 */
function extractReadableText(html) {
  let s = html;

  // Drop blocks whose contents are never readable body text.
  for (const tag of ['script', 'style', 'nav', 'header', 'footer', 'aside']) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }

  // Prefer the main content region when present.
  const region =
    matchRegion(s, 'article') || matchRegion(s, 'main') || matchRegion(s, 'body') || s;

  let text = region
    .replace(/<[^>]+>/g, ' ') // strip remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, MAX_CONTENT_LENGTH);
}

/** Return the inner HTML of the first matching <tag>...</tag> region, or null. */
function matchRegion(html, tag) {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1] : null;
}
