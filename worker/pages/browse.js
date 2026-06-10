import { layout } from '../lib/html.js';
import { timeAgo, escapeHtml, escapeLikeWildcards, displayQuery, publicResearchFilter } from '../lib/utils.js';

// inlined from src/pages/home.ts for phase 1 (home page not ported in this phase)
function searchBar(size = 'large', turnstileSiteKey) {
  const ph = size === 'large'
    ? 'What product are you researching?'
    : 'Research a product...';
  const turnstileWidget = turnstileSiteKey
    ? `<div id="turnstile-wrap" class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-theme="dark" data-size="compact" style="margin:0.75rem auto 0;display:none"></div>`
    : '';
  const tierSelector = size === 'large' ? `<div class="tier-selector" role="radiogroup" aria-label="Research depth">
<label class="tier-option">
<input type="radio" name="tier" value="instant" checked>
<div class="tier-card">
<span class="tier-name">Instant</span>
<span class="tier-desc">~90s &middot; 50 sources</span>
</div>
</label>
<label class="tier-option">
<input type="radio" name="tier" value="full">
<div class="tier-card">
<span class="tier-name">Full</span>
<span class="tier-desc">~3 min &middot; 75+ sources</span>
</div>
</label>
<label class="tier-option">
<input type="radio" name="tier" value="exhaustive">
<div class="tier-card tier-featured">
<span class="tier-name">Deep Dive</span>
<span class="tier-desc">~7 min &middot; 400+ sources</span>
<span class="tier-limit">5 free/day</span>
</div>
</label>
</div>` : '<input type="hidden" name="tier" value="instant">';

  const turnstileToggle = (size === 'large' && turnstileSiteKey)
    ? `<script nonce="__CSP_NONCE__">document.querySelectorAll('input[name="tier"]').forEach(function(r){r.addEventListener('change',function(){var w=document.getElementById('turnstile-wrap');if(w)w.style.display=this.value==='exhaustive'?'':'none'})})</script>`
    : '';

  const loadingScript = `<script nonce="__CSP_NONCE__">
(function(){
if(window.__loadInit)return;window.__loadInit=true;
document.querySelectorAll('form.search-form').forEach(function(f){
f.addEventListener('submit',function(){
var tier=(f.querySelector('input[name="tier"]:checked')||{}).value||'instant';
var wait=tier==='exhaustive'?'up to 7 minutes':(tier==='full'?'about 3 minutes':'about 90 seconds');
var o=document.createElement('div');
o.style.cssText='position:fixed;inset:0;background:rgba(12,17,25,0.94);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:#fff;gap:1.25rem;padding:1rem;text-align:center';
o.innerHTML='<div class="spinner"></div><div style="font-size:1.1rem;font-weight:600">Running research\u2026</div><div style="font-size:0.95rem;color:rgba(255,255,255,0.75);max-width:440px">Takes '+wait+'. Please keep this tab open \u2014 we\u2019ll redirect you automatically when it\u2019s ready.</div>';
document.body.appendChild(o);
var btn=f.querySelector('button[type="submit"]');
if(btn){btn.disabled=true;btn.textContent='Researching\u2026'}
})
})
})();
</script>`;

  const autocompleteScript = `<script nonce="__CSP_NONCE__">
(function(){
if(window.__acInit)return;window.__acInit=true;
var inputs=document.querySelectorAll('input[name="q"]');
inputs.forEach(function(input){
var box=input.closest('.search-box');
if(!box)return;
box.style.position='relative';
var dd=document.createElement('div');
dd.className='ac-dropdown';
box.appendChild(dd);
var t;
input.addEventListener('input',function(){
clearTimeout(t);
var q=input.value.trim();
if(q.length<2){dd.style.display='none';return}
t=setTimeout(function(){
fetch('/api/search/suggest?q='+encodeURIComponent(q))
.then(function(r){return r.json()})
.then(function(items){
if(!items.length){dd.style.display='none';return}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
dd.innerHTML=items.map(function(i){
return '<a class="ac-item" href="/research/'+encodeURIComponent(i.slug)+'"><span>'+esc(i.query)+'</span>'+(i.category?'<span class="ac-cat">'+esc(i.category)+'</span>':'')+'</a>'
}).join('');
dd.style.display='block'
}).catch(function(){dd.style.display='none'})
},200)
});
input.addEventListener('blur',function(){setTimeout(function(){dd.style.display='none'},200)});
input.addEventListener('focus',function(){if(dd.innerHTML&&input.value.trim().length>=2)dd.style.display='block'});
})
})();
</script>`;

  return `<form action="/research/new" method="GET" class="search-form">
<div class="search-glow"></div>
<div class="search-box">
<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
<input type="text" name="q" placeholder="${ph}" required aria-label="Search query" autocomplete="off">
<button type="submit">Research</button>
</div>
${tierSelector}
${turnstileWidget}
${turnstileToggle}
${autocompleteScript}
${loadingScript}
</form>`;
}

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
         WHERE ${publicResearchFilter('r')} AND r.query LIKE ?1
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

  const cards = results.map((r) => `<a href="/research/${escapeHtml(r.slug)}" class="card">
<div class="card-top">
${r.category ? `<span class="card-badge">${escapeHtml(r.category)}</span>` : '<span></span>'}
<span class="card-time">${timeAgo(r.created_at * 1000)}</span>
</div>
<h3>${escapeHtml(displayQuery(r.query))}</h3>
${r.summary ? `<p>${escapeHtml(r.summary)}</p>` : ''}
<div class="card-meta"><span>${r.product_count} products</span><span>${r.view_count} views</span></div>
</a>`).join('');

  const qs = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';

  const body = `<div class="container" style="padding:3rem 1.5rem">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--text2);margin-bottom:1rem">
<a href="/" style="color:var(--text2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--text3)">/</span>
<span style="color:var(--text)">Research</span>
</nav>
<div class="page-header" style="margin-bottom:2rem">
<h1>Browse research</h1>
<p style="color:var(--text2);margin-bottom:1.5rem">Explore past product research or start your own.</p>
${searchBar('compact', env.TURNSTILE_SITE_KEY)}
</div>

${searchQuery ? `<div style="margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem;font-size:.85rem">
<span style="color:var(--text2)">Results for:</span>
<span class="card-badge">${escapeHtml(searchQuery)}</span>
<a href="/research" style="color:var(--text3);margin-left:.5rem;font-size:.85rem">Clear</a>
</div>` : ''}

${cards ? `<div class="grid">${cards}</div>` : `<div class="empty">
<div class="empty-icon"><svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
${searchQuery ? `<h2>No matches for &ldquo;${escapeHtml(searchQuery)}&rdquo;</h2>
<p>Try a broader search or <a href="/research/new?q=${encodeURIComponent(searchQuery)}">start new research</a>.</p>` : page > 1 ? `<h2>You&rsquo;ve reached the end</h2>
<p>No more research on this page. <a href="/research">Back to the latest</a>.</p>` : `<h2>No research yet</h2>
<p>Be the first to research a product!</p>`}
</div>`}

${(page > 1 || hasMore) ? `<div class="pagination">
${page > 1 ? `<a href="/research?page=${page - 1}${qs}" class="btn btn-ghost">Previous</a>` : ''}
${hasMore ? `<a href="/research?page=${page + 1}${qs}" class="btn btn-ghost">Next</a>` : ''}
</div>` : ''}
</div>`;

  const canonical = '<link rel="canonical" href="https://chrisputer.tech/research">';
  const prevLink = page > 1 ? `<link rel="prev" href="https://chrisputer.tech/research?page=${page - 1}${qs}">` : '';
  const nextLink = hasMore ? `<link rel="next" href="https://chrisputer.tech/research?page=${page + 1}${qs}">` : '';
  const noindex = (page > 1 || searchQuery) ? '<meta name="robots" content="noindex, follow">' : '';
  const turnstileScript = env.TURNSTILE_SITE_KEY
    ? '<script nonce="__CSP_NONCE__" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : '';

  const breadcrumbLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chrisputer.tech/' },
      { '@type': 'ListItem', position: 2, name: 'Research', item: 'https://chrisputer.tech/research' },
    ],
  });
  const collectionUrl = searchQuery
    ? `https://chrisputer.tech/research?q=${encodeURIComponent(searchQuery)}${page > 1 ? `&page=${page}` : ''}`
    : `https://chrisputer.tech/research${page > 1 ? `?page=${page}` : ''}`;
  const itemListLd = results.length > 0 ? JSON.stringify({
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
  }) : '';
  const structuredData = `<script type="application/ld+json" nonce="__CSP_NONCE__">${breadcrumbLd}</script>` +
    (itemListLd ? `<script type="application/ld+json" nonce="__CSP_NONCE__">${itemListLd}</script>` : '');

  return layout('Browse Research', 'Explore past AI-powered product research.', body, canonical + prevLink + nextLink + noindex + turnstileScript + structuredData, { ogUrl: 'https://chrisputer.tech/research' });
}
