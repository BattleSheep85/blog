/**
 * Category hubs (Phase 5 programmatic-SEO): /best/:categorySlug
 *
 * An SSR index page listing every completed, public research run whose
 * research.category slugifies to the requested slug. Category is stored as
 * free text on the research row (e.g. "Mechanical Keyboards"), so matching is
 * done by slugifying that column in SQL-loaded rows rather than storing a
 * separate slug column. ItemList + BreadcrumbList JSON-LD give the hub a shot
 * at rich results; layout()/canonical mirror the rest of the site.
 *
 * Returns null when no rows match so the router can fall back to a static
 * guide asset or 404.
 */

import { layout, jsonLdScript } from '../lib/html.js';
import {
    timeAgo, escapeHtml, displayQuery, slugify, publicResearchFilter,
} from '../lib/utils.js';
import { listableRowsSql, PRODUCT_COUNT_SELECT } from '../lib/listable.js';

const SITE = 'https://chrisputer.tech';

// A "Best X" hub with fewer than this many distinct guides is a thin/doorway
// page (it just links to one research result). Such hubs render noindex,follow
// and are excluded from the sitemap (see lib/sitemap.js) so they don't drag
// down the site's overall content quality in Google's eyes.
export const MIN_HUB_GUIDES = 2;

/**
 * Render the /best/:categorySlug hub. Returns an HTML string, or null when no
 * complete research matches the slug.
 * @param {string} category The requested category slug (already a slug).
 * @param {object} env Worker env bindings.
 */
export async function renderCategoryHub(category, env) {
    const wantSlug = slugify(String(category || ''));
    if (!wantSlug) return null;

    // Pull one row per canonical cluster (newest), only public/complete rows
    // with a non-null category, then filter to the requested slug in JS — the
    // slugify rules live in one place (utils.js) and we avoid reimplementing
    // them in SQL. The candidate set is small (categories, not the full table).
    const stmt = env.DB.prepare(
        listableRowsSql({
            select: `*, ${PRODUCT_COUNT_SELECT}`,
            extraWhere: `r.category IS NOT NULL AND r.category <> ''`,
        })
    );
    const allRows = (await stmt.all()).results ?? [];
    const rows = allRows.filter((r) => slugify(r.category) === wantSlug);

    if (rows.length === 0) return null;

    // Display name comes from the first matching row's stored category text.
    const categoryName = rows[0].category;
    const canonicalUrl = `${SITE}/best/${wantSlug}`;

    const cards = rows.map((r) => `<a href="/research/${escapeHtml(r.slug)}" class="flex flex-col border border-line bg-surface-1 p-5 transition-colors hover:border-line-strong">
<div class="mb-2 flex items-center justify-between gap-3">
<span class="inline-flex items-center border border-line-strong px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-accent">${escapeHtml(r.category)}</span>
<span class="readout font-mono text-[11px] text-ink-3">${timeAgo(r.created_at * 1000)}</span>
</div>
<h3 class="font-serif text-h3 font-semibold text-ink">${escapeHtml(displayQuery(r.query))}</h3>
${r.summary ? `<p class="mt-2 line-clamp-2 text-body-sm text-ink-2">${escapeHtml(r.summary)}</p>` : ''}
<div class="mt-4 flex gap-4 border-t border-line pt-3 font-mono text-[11px] uppercase tracking-wide text-ink-3"><span class="readout">${r.product_count} products</span><span class="readout">${r.view_count} views</span></div>
</a>`).join('');

    const body = `<div class="grid-bg border-b border-line">
<div class="mx-auto max-w-5xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 font-mono text-[11px] uppercase tracking-widest text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<a href="/research" class="hover:text-ink">Research</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">${escapeHtml(categoryName)}</span>
</nav>
<p class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Hub &middot; Category ledger</p>
<h1 class="mt-2 font-serif text-h1 font-semibold text-ink">Best ${escapeHtml(categoryName)}</h1>
<p class="mt-2 text-lead text-ink-2">Honest, source-backed ${escapeHtml(categoryName.toLowerCase())} research — ${rows.length} guide${rows.length === 1 ? '' : 's'} compiled from real reviews.</p>
</div>
</div>
<div class="mx-auto max-w-5xl px-6 py-10">
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>
</div>`;

    const breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'Research', item: `${SITE}/research` },
            { '@type': 'ListItem', position: 3, name: categoryName, item: canonicalUrl },
        ],
    };
    const itemListLd = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': canonicalUrl,
        url: canonicalUrl,
        name: `Best ${categoryName} | Frank`,
        description: `Source-backed ${categoryName.toLowerCase()} research and buying guides.`,
        inLanguage: 'en-US',
        isPartOf: { '@id': `${SITE}/#website` },
        publisher: { '@id': `${SITE}/#organization` },
        mainEntity: {
            '@type': 'ItemList',
            numberOfItems: rows.length,
            itemListOrder: 'https://schema.org/ItemListOrderDescending',
            itemListElement: rows.map((r, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `${SITE}/research/${r.slug}`,
                name: displayQuery(r.query),
            })),
        },
    };

    const canonical = `<link rel="canonical" href="${canonicalUrl}">`;
    const structuredData = jsonLdScript(breadcrumbLd) + jsonLdScript(itemListLd);
    // Thin single-guide hubs stay crawlable (so the noindex is honored + the
    // outbound link to the research page passes equity) but are kept out of the index.
    const robots = rows.length < MIN_HUB_GUIDES ? '<meta name="robots" content="noindex, follow">' : '';

    return layout(
        `Best ${categoryName}`,
        `Honest, source-backed ${categoryName.toLowerCase()} research and buying guides from Frank.`,
        body,
        robots + canonical + structuredData,
        { ogUrl: canonicalUrl },
    );
}

/**
 * List distinct categories for hub discovery (sitemap, home linking). Cheap:
 * one GROUP BY over public rows. Returns [{ category, slug, count }] sorted by
 * count desc. Slugs are computed in JS so they match renderCategoryHub's
 * matching exactly; if two stored category strings slugify to the same slug
 * their counts are merged.
 */
export async function listCategories(env) {
    // COUNT(DISTINCT cluster) so `count` equals the number of guides the hub
    // actually renders (renderCategoryHub dedupes to one row per canonical
    // cluster) — keeps the sitemap's MIN_HUB_GUIDES gate in sync with the page.
    const stmt = env.DB.prepare(
        `SELECT r.category AS category,
                COUNT(DISTINCT COALESCE(r.canonical_query, r.slug)) AS count
         FROM research r
         WHERE ${publicResearchFilter('r')} AND r.category IS NOT NULL AND r.category <> ''
         GROUP BY r.category`
    );
    const rows = (await stmt.all()).results ?? [];

    const bySlug = new Map();
    for (const r of rows) {
        const slug = slugify(r.category);
        if (!slug) continue;
        const prev = bySlug.get(slug);
        if (prev) {
            prev.count += Number(r.count) || 0;
        } else {
            bySlug.set(slug, { category: r.category, slug, count: Number(r.count) || 0 });
        }
    }

    return Array.from(bySlug.values()).sort((a, b) => b.count - a.count);
}
