// YouTube description extraction. Video-provider sources come back from Serper
// with just title + short snippet — the affiliate gold is in the description
// text, where reviewers drop "Buy here: amzn.to/xxx" links below the fold.
// Without fetching it we can't tag video reviews as affiliate-conflicted.
//
// No YouTube Data API key needed: the watch page HTML embeds a JSON blob
// (`ytInitialPlayerResponse`) that contains the full description under
// `shortDescription`. Scraping this blob is brittle by nature — YouTube can
// change the shape any time — so every step fails safe: on any error, return
// empty string and the rest of the pipeline proceeds with the snippet alone.

const YOUTUBE_TIMEOUT_MS = 5000;
const MAX_DESC_LENGTH = 5000;

const YOUTUBE_HOSTS = /(?:^|\.)(youtube\.com|youtu\.be)$/i;

function isYoutubeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return YOUTUBE_HOSTS.test(host);
  } catch {
    return false;
  }
}

/**
 * Fetches a YouTube watch page and extracts the video description.
 * Returns empty string if the URL isn't a YouTube video, the fetch fails, or
 * the description JSON blob can't be located.
 *
 * Cost: 1 subrequest per call. Safe to call in parallel — each goes to
 * youtube.com which handles high concurrency.
 */
export async function fetchYoutubeDescription(url) {
  if (!isYoutubeUrl(url)) return '';
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
      headers: {
        // Consumer UA — YouTube serves different HTML to non-browser agents.
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    // `shortDescription` is the field name YouTube uses for the full user-facing
    // description. The value is a JSON-encoded string (escaped quotes, \n, etc.)
    const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (!m) return '';
    const unescaped = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');
    return unescaped.slice(0, MAX_DESC_LENGTH);
  } catch {
    return '';
  }
}

/**
 * Returns true if the URL is a YouTube video page. Re-exported so callers can
 * filter source lists without importing the private helper.
 */
export function isYouTube(url) {
  return isYoutubeUrl(url);
}
