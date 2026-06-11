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

const SITE = 'https://chrisputer.tech';

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
        `WITH ranked AS (
           SELECT r.*, ROW_NUMBER() OVER (
               PARTITION BY COALESCE(r.canonical_query, r.slug) ORDER BY r.created_at DESC
           ) AS rn
           FROM research r
           WHERE ${publicResearchFilter('r')} AND r.category IS NOT NULL AND r.category <> ''
         )
         SELECT *, (SELECT COUNT(*) FROM products WHERE products.research_id = ranked.id) AS product_count
         FROM ranked WHERE rn = 1
         ORDER BY created_at DESC`
    );
    const allRows = (await stmt.all()).results ?? [];
    const rows = allRows.filter((r) => slugify(r.category) === wantSlug);

    if (rows.length === 0) return null;

    // Display name comes from the first matching row's stored category text.
    const categoryName = rows[0].category;
    const canonicalUrl = `${SITE}/best/${wantSlug}`;

    const cards = rows.map((r) => `<a href="/research/${escapeHtml(r.slug)}" class="card">
<div class="card-top">
<span class="card-badge">${escapeHtml(r.category)}</span>
<span class="card-time">${timeAgo(r.created_at * 1000)}</span>
</div>
<h3>${escapeHtml(displayQuery(r.query))}</h3>
${r.summary ? `<p>${escapeHtml(r.summary)}</p>` : ''}
<div class="card-meta"><span>${r.product_count} products</span><span>${r.view_count} views</span></div>
</a>`).join('');

    const body = `<div class="container" style="padding:3rem 1.5rem">
<nav aria-label="Breadcrumb" class="breadcrumb" style="font-size:.85rem;color:var(--text2);margin-bottom:1rem">
<a href="/" style="color:var(--text2)">Home</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--text3)">/</span>
<a href="/research" style="color:var(--text2)">Research</a>
<span aria-hidden="true" style="margin:0 .4rem;color:var(--text3)">/</span>
<span style="color:var(--text)">${escapeHtml(categoryName)}</span>
</nav>
<div class="page-header" style="margin-bottom:2rem">
<h1>Best ${escapeHtml(categoryName)}</h1>
<p style="color:var(--text2)">Honest, source-backed ${escapeHtml(categoryName.toLowerCase())} research — ${rows.length} guide${rows.length === 1 ? '' : 's'} compiled from real reviews.</p>
</div>
<div class="grid">${cards}</div>
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
        name: `Best ${categoryName} | Chrisputer Labs`,
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

    return layout(
        `Best ${categoryName}`,
        `Honest, source-backed ${categoryName.toLowerCase()} research and buying guides from Chrisputer Labs.`,
        body,
        canonical + structuredData,
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
    const stmt = env.DB.prepare(
        `SELECT r.category AS category, COUNT(*) AS count
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
