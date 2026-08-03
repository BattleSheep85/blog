import { layout, jsonLdScript } from '../lib/html.js';
import { timeAgo, escapeHtml, escapeLikeWildcards, displayQuery, publicResearchFilter } from '../lib/utils.js';
import { searchBar } from '../lib/search-bar.js';
import { listCategories } from '../pages/category.js';
import { jsonEmbed, listLayoutBoot } from '../lib/list-layout-boot.js';
import { renderPagerNav } from '../lib/pager.js';

// 48 cards/page keeps the archive's ~687 reports reachable in about 15 pages,
// so the full numbered pager below (see lib/pager.js) can link every page
// directly from page 1 without a long prev/next chain.
const PER_PAGE = 48;
const MAX_PAGE = 1000;

// Builds a /research href for a given page + optional search query. Page 1
// with no query collapses to the bare /research path.
function researchPageHref(pageNum, searchQuery) {
  const params = [];
  if (pageNum > 1) params.push(`page=${pageNum}`);
  if (searchQuery) params.push(`q=${encodeURIComponent(searchQuery)}`);
  return params.length ? `/research?${params.join('&')}` : '/research';
}

export async function renderBrowse(url, env) {
  const searchQuery = url.searchParams.get('q') ?? '';
  const page = Math.min(Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1), MAX_PAGE);
  const perPage = PER_PAGE;
  const offset = (page - 1) * perPage;

  let rows;

  if (searchQuery) {
    const escaped = `%${escapeLikeWildcards(searchQuery)}%`;
    const stmt = env.DB.prepare(
      `WITH ranked AS (
         SELECT r.*, ROW_NUMBER() OVER (PARTITION BY COALESCE(r.canonical_query, r.slug) ORDER BY r.created_at DESC) AS rn
         FROM research r
         WHERE ${publicResearchFilter('r')} AND r.query LIKE ?1 ESCAPE '\\'
       )
       SELECT *, (SELECT COUNT(*) FROM products WHERE products.research_id = ranked.id) AS product_count
       FROM ranked WHERE rn = 1
       ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
    ).bind(escaped, perPage + 1, offset);
    rows = (await stmt.all()).results ?? [];
  } else {
    const stmt = env.DB.prepare(
      `WITH ranked AS (
         SELECT r.*, ROW_NUMBER() OVER (PARTITION BY COALESCE(r.canonical_query, r.slug) ORDER BY r.created_at DESC) AS rn
         FROM research r
         WHERE ${publicResearchFilter('r')}
       )
       SELECT *, (SELECT COUNT(*) FROM products WHERE products.research_id = ranked.id) AS product_count
       FROM ranked WHERE rn = 1
       ORDER BY created_at DESC LIMIT ?1 OFFSET ?2`
    ).bind(perPage + 1, offset);
    rows = (await stmt.all()).results ?? [];
  }

  const hasMore = rows.length > perPage;
  const results = rows.slice(0, perPage);

  // Total page count, used to render the full numbered pager below. Only the
  // unfiltered listing gets one (search results are open-ended and noindexed
  // already, so a prev/next chain is enough there).
  let totalPages = 1;
  if (!searchQuery) {
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT r.id, ROW_NUMBER() OVER (PARTITION BY COALESCE(r.canonical_query, r.slug) ORDER BY r.created_at DESC) AS rn
         FROM research r WHERE ${publicResearchFilter('r')}
       ) WHERE rn = 1`
    ).first();
    totalPages = Math.max(1, Math.ceil((countRow?.n ?? 0) / perPage));
  }

  // "Browse by category" strip — links to the /best/:slug hubs. Only shown on
  // the un-filtered first page so search-result and paginated views stay lean.
  // Degrades to empty if the query fails (never break the listing for a strip).
  let categoryStrip = '';
  if (!searchQuery && page === 1) {
    const categories = await listCategories(env).catch(() => []);
    const top = categories.slice(0, 12);
    if (top.length > 0) {
      const chips = top.map((c) =>
        `<a href="/best/${escapeHtml(c.slug)}" class="inline-flex items-center gap-1.5 border border-line bg-surface-1 px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink">${escapeHtml(c.category)} <span class="readout text-ink-3">${c.count}</span></a>`
      ).join('');
      categoryStrip = `<div class="mb-8">
<h2 class="mb-3 font-mono text-[11px] uppercase tracking-widest text-ink-3">Index &middot; Browse by category</h2>
<div class="flex flex-wrap gap-2">${chips}</div>
</div>`;
    }
  }

  const listItems = results.map((r) => ({
    slug: r.slug,
    query: displayQuery(r.query),
    ts: r.created_at * 1000,
    category: r.category || '',
    summary: r.summary || '',
    product_count: r.product_count,
    view_count: r.view_count,
  }));


  const body = `<div class="grid-bg border-b border-line">
<div class="mx-auto max-w-5xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 font-mono text-[11px] uppercase tracking-widest text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">Research</span>
</nav>
<p class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Index &middot; Research archive</p>
<h1 class="mt-2 font-serif text-h1 font-semibold text-ink">Browse research</h1>
<p class="mb-6 mt-2 text-lead text-ink-2">Explore past product research or start your own.</p>
${searchBar('compact')}
</div>
</div>

<div class="mx-auto max-w-5xl px-6 py-10">
${categoryStrip}

${searchQuery ? `<div class="mb-6 flex items-center gap-2 font-mono text-xs">
<span class="text-ink-2">Results for:</span>
<span class="inline-flex items-center border border-line-strong px-2 py-1 uppercase tracking-wide text-accent">${escapeHtml(searchQuery)}</span>
<a href="/research" class="ml-1 text-ink-3 hover:text-ink">Clear</a>
</div>` : ''}

${listItems.length ? `${jsonEmbed('research-list-data', listItems)}<div id="research-list">
<div class="grid">${results.map((r) => `<a class="card" href="/research/${escapeHtml(r.slug)}">
${r.category ? `<div class="card-top"><span class="card-badge">${escapeHtml(r.category)}</span><span class="card-time readout">${timeAgo(r.created_at * 1000)}</span></div>` : `<div class="card-top"><span class="card-time readout">${timeAgo(r.created_at * 1000)}</span></div>`}
<h3>${escapeHtml(displayQuery(r.query))}</h3>
${r.summary ? `<p>${escapeHtml(r.summary.slice(0, 140))}${r.summary.length > 140 ? '…' : ''}</p>` : ''}
</a>`).join('')}</div>
</div>` : `<div class="border border-line bg-surface-1 py-16 text-center">
<div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-line text-ink-3"><svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
${searchQuery ? `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">No matches for &ldquo;${escapeHtml(searchQuery)}&rdquo;</h2>
<p class="mb-6 text-body text-ink-2">Try a broader search or start new research:</p>
<form method="POST" action="/research/new" class="mt-4"><input type="hidden" name="q" value="${escapeHtml(searchQuery)}"><button type="submit" class="inline-flex items-center gap-2 bg-accent-strong px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover">Start new research</button></form>` : page > 1 ? `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">You&rsquo;ve reached the end</h2>
<p class="text-body text-ink-2">No more research on this page. <a href="/research" class="text-accent hover:text-accent-hover">Back to the latest</a>.</p>` : `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">No research yet</h2>
<p class="text-body text-ink-2">Be the first to research a product!</p>`}
</div>`}

${(page > 1 || hasMore) ? `<div class="mt-8 flex justify-center gap-2">
${page > 1 ? `<a href="${researchPageHref(page - 1, searchQuery)}" class="inline-flex items-center gap-2 border border-line bg-surface-1 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-ink-3">&larr; Previous</a>` : ''}
${hasMore ? `<a href="${researchPageHref(page + 1, searchQuery)}" class="inline-flex items-center gap-2 border border-line bg-surface-1 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-ink-3">Next &rarr;</a>` : ''}
</div>` : ''}
${!searchQuery ? renderPagerNav(totalPages, page, (n) => researchPageHref(n, ''), 'Research archive pages') : ''}
</div>
</div>`;

  const canonical = `<link rel="canonical" href="https://chrisputer.tech${researchPageHref(page, searchQuery)}">`;
  const prevLink = page > 1 ? `<link rel="prev" href="https://chrisputer.tech${researchPageHref(page - 1, searchQuery)}">` : '';
  const nextLink = hasMore ? `<link rel="next" href="https://chrisputer.tech${researchPageHref(page + 1, searchQuery)}">` : '';
  const noindex = (page > 1 || searchQuery) ? '<meta name="robots" content="noindex, follow">' : '';
  const turnstileScript = env.TURNSTILE_SITE_KEY
    ? '<script nonce="__CSP_NONCE__" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : '';

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chrisputer.tech/' },
      { '@type': 'ListItem', position: 2, name: 'Research', item: 'https://chrisputer.tech/research' },
    ],
  };
  const collectionUrl = searchQuery
    ? `https://chrisputer.tech/research?q=${encodeURIComponent(searchQuery)}${page > 1 ? `&page=${page}` : ''}`
    : `https://chrisputer.tech/research${page > 1 ? `?page=${page}` : ''}`;
  const itemListLd = results.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': collectionUrl,
    url: collectionUrl,
    name: searchQuery ? `Search: ${searchQuery} | Chrisputer Labs` : 'Browse Research',
    description: searchQuery
      ? `Research results matching "${searchQuery}".`
      : 'AI-powered product research archive.',
    inLanguage: 'en-US',
    isPartOf: { '@id': 'https://chrisputer.tech/#website' },
    publisher: { '@id': 'https://chrisputer.tech/#organization' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: results.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: results.map((r, i) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        url: `https://chrisputer.tech/research/${r.slug}`,
        name: displayQuery(r.query),
      })),
    },
  } : null;
  const structuredData = jsonLdScript(breadcrumbLd) +
    (itemListLd ? jsonLdScript(itemListLd) : '');

  const listBoot = listItems.length > 0
    ? listLayoutBoot({ dataId: 'research-list-data', containerId: 'research-list', kind: 'research' })
    : '';

  return layout('Browse Research', 'Explore past AI-powered product research.', body, canonical + prevLink + nextLink + noindex + turnstileScript + structuredData + listBoot, { ogUrl: 'https://chrisputer.tech/research' });
}
