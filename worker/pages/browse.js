import { layout, jsonLdScript } from '../lib/html.js';
import { timeAgo, escapeHtml, escapeLikeWildcards, displayQuery, publicResearchFilter } from '../lib/utils.js';
import { searchBar } from '../lib/search-bar.js';
import { listCategories } from '../pages/category.js';

export async function renderBrowse(url, env) {
  const searchQuery = url.searchParams.get('q') ?? '';
  const page = Math.min(Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1), 1000);
  const perPage = 12;
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

  // "Browse by category" strip — links to the /best/:slug hubs. Only shown on
  // the un-filtered first page so search-result and paginated views stay lean.
  // Degrades to empty if the query fails (never break the listing for a strip).
  let categoryStrip = '';
  if (!searchQuery && page === 1) {
    const categories = await listCategories(env).catch(() => []);
    const top = categories.slice(0, 12);
    if (top.length > 0) {
      const chips = top.map((c) =>
        `<a href="/best/${escapeHtml(c.slug)}" class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-caption font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink">${escapeHtml(c.category)} <span class="font-mono text-ink-3 num">${c.count}</span></a>`
      ).join('');
      categoryStrip = `<div class="mb-8">
<h2 class="mb-3 text-overline uppercase text-ink-3">Browse by category</h2>
<div class="flex flex-wrap gap-2">${chips}</div>
</div>`;
    }
  }

  const cards = results.map((r) => `<a href="/research/${escapeHtml(r.slug)}" class="flex flex-col rounded-xl border border-line bg-surface-1 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift">
<div class="mb-2 flex items-center justify-between gap-3">
${r.category ? `<span class="inline-flex items-center rounded-full bg-accent-quiet px-2.5 py-1 text-caption font-medium text-accent">${escapeHtml(r.category)}</span>` : '<span></span>'}
<span class="text-caption text-ink-3">${timeAgo(r.created_at * 1000)}</span>
</div>
<h3 class="font-serif text-h3 font-semibold text-ink">${escapeHtml(displayQuery(r.query))}</h3>
${r.summary ? `<p class="mt-2 line-clamp-2 text-body-sm text-ink-2">${escapeHtml(r.summary)}</p>` : ''}
<div class="mt-4 flex gap-4 font-mono text-caption text-ink-3 num"><span>${r.product_count} products</span><span>${r.view_count} views</span></div>
</a>`).join('');

  const qs = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';

  const body = `<div class="mx-auto max-w-5xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 text-caption text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">Research</span>
</nav>
<div class="mb-8">
<h1 class="font-serif text-h1 font-semibold text-ink">Browse research</h1>
<p class="mb-6 mt-2 text-lead text-ink-2">Explore past product research or start your own.</p>
${searchBar('compact')}
</div>

${categoryStrip}

${searchQuery ? `<div class="mb-6 flex items-center gap-2 text-body-sm">
<span class="text-ink-2">Results for:</span>
<span class="inline-flex items-center rounded-full bg-accent-quiet px-2.5 py-1 text-caption font-medium text-accent">${escapeHtml(searchQuery)}</span>
<a href="/research" class="ml-1 text-caption text-ink-3 hover:text-ink">Clear</a>
</div>` : ''}

${cards ? `<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>` : `<div class="py-20 text-center">
<div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-3"><svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
${searchQuery ? `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">No matches for &ldquo;${escapeHtml(searchQuery)}&rdquo;</h2>
<p class="mb-6 text-body text-ink-2">Try a broader search or start new research:</p>
<form method="POST" action="/research/new" class="mt-4"><input type="hidden" name="q" value="${escapeHtml(searchQuery)}"><button type="submit" class="inline-flex items-center gap-2 rounded-lg bg-accent-strong px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover">Start new research</button></form>` : page > 1 ? `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">You&rsquo;ve reached the end</h2>
<p class="text-body text-ink-2">No more research on this page. <a href="/research" class="text-accent hover:text-accent-hover">Back to the latest</a>.</p>` : `<h2 class="mb-2 font-serif text-h2 font-semibold text-ink">No research yet</h2>
<p class="text-body text-ink-2">Be the first to research a product!</p>`}
</div>`}

${(page > 1 || hasMore) ? `<div class="mt-8 flex justify-center gap-2">
${page > 1 ? `<a href="/research?page=${page - 1}${qs}" class="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-4 py-2 text-body-sm font-semibold text-ink transition-colors hover:bg-surface-2">Previous</a>` : ''}
${hasMore ? `<a href="/research?page=${page + 1}${qs}" class="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-4 py-2 text-body-sm font-semibold text-ink transition-colors hover:bg-surface-2">Next</a>` : ''}
</div>` : ''}
</div>`;

  const canonical = '<link rel="canonical" href="https://chrisputer.tech/research">';
  const prevLink = page > 1 ? `<link rel="prev" href="https://chrisputer.tech/research?page=${page - 1}${qs}">` : '';
  const nextLink = hasMore ? `<link rel="next" href="https://chrisputer.tech/research?page=${page + 1}${qs}">` : '';
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

  return layout('Browse Research', 'Explore past AI-powered product research.', body, canonical + prevLink + nextLink + noindex + turnstileScript + structuredData, { ogUrl: 'https://chrisputer.tech/research' });
}
