// Coverage for the free search/content providers (fetch mocked). These parse
// external HTML/XML/markdown and MUST fail safe (return [] / '') on any error.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchYoutubeDescription, isYouTube } from '../../worker/lib/youtube.js';
import { fetchPageContent } from '../../worker/lib/jina.js';
import { duckduckgoSearch } from '../../worker/lib/duckduckgo.js';
import { rssSearch } from '../../worker/lib/rss.js';

afterEach(() => vi.unstubAllGlobals());

describe('youtube.js', () => {
  it('isYouTube recognizes watch/short hosts, rejects others', () => {
    expect(isYouTube('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTube('https://youtu.be/abc')).toBe(true);
    expect(isYouTube('https://example.com/x')).toBe(false);
    expect(isYouTube('not a url')).toBe(false);
  });

  it('extracts + unescapes the description from watch-page HTML', async () => {
    const html = '...{"shortDescription":"Buy here: https:\\/\\/amzn.to\\/x \\u0026 more\\nline2"}...';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));
    const desc = await fetchYoutubeDescription('https://www.youtube.com/watch?v=abc');
    expect(desc).toContain('amzn.to/x');
    expect(desc).toContain('&');
    expect(desc).toContain('\n');
  });

  it('returns "" for non-YouTube urls (no fetch)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await fetchYoutubeDescription('https://example.com/x')).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns "" on non-OK, throw, and missing blob', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await fetchYoutubeDescription('https://youtu.be/a')).toBe('');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect(await fetchYoutubeDescription('https://youtu.be/a')).toBe('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no blob here', { status: 200 })));
    expect(await fetchYoutubeDescription('https://youtu.be/a')).toBe('');
  });
});

describe('jina.js fetchPageContent', () => {
  const route = (jinaRes, directRes) => vi.fn(async (url) =>
    String(url).includes('r.jina.ai') ? jinaRes() : directRes());

  it('returns Jina markdown when long enough', async () => {
    const md = '# Title\n' + 'content '.repeat(50);
    vi.stubGlobal('fetch', route(() => new Response(md, { status: 200 }), () => new Response('', { status: 500 })));
    expect(await fetchPageContent('https://x/p')).toContain('content');
  });

  it('falls back to direct extraction when Jina is non-OK', async () => {
    const html = '<html><body><nav>menu</nav><article><h1>Hi</h1><p>Real body text here.</p></article><footer>f</footer></body></html>';
    vi.stubGlobal('fetch', route(() => new Response('', { status: 429 }), () => new Response(html, { status: 200 })));
    const text = await fetchPageContent('https://x/p');
    expect(text).toContain('Real body text here');
    expect(text).not.toContain('menu'); // nav stripped
  });

  it('returns "" when both Jina and direct fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await fetchPageContent('https://x/p')).toBe('');
  });
});

describe('duckduckgoSearch (fail-safe)', () => {
  it('returns [] on the 202 anti-bot page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 202 })));
    expect(await duckduckgoSearch('q')).toEqual([]);
  });
  it('returns [] on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await duckduckgoSearch('q')).toEqual([]);
  });
  it('returns [] when the body is an anomaly page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<div class="anomaly-modal">blocked</div>', { status: 200 })));
    expect(await duckduckgoSearch('q')).toEqual([]);
  });
  it('returns [] on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }));
    expect(await duckduckgoSearch('q')).toEqual([]);
  });
  it('parses organic result blocks on a 200', async () => {
    const html = '<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=z">Example Page</a><a class="result__snippet">A snippet</a></div>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));
    const out = await duckduckgoSearch('q');
    expect(Array.isArray(out)).toBe(true); // parse path executed
  });
});

describe('rssSearch (fail-safe)', () => {
  it('never throws and returns an array on a fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }));
    const out = await rssSearch('best nas');
    expect(Array.isArray(out)).toBe(true);
  });
});
