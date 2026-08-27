/**
 * Injects a small "recent research" section of crawlable /research/:slug
 * links into otherwise-static pages. The homepage (public/index.html) and
 * the /best/ guide index (public/best/index.html) render zero links to
 * report pages on their own — a crawler landing on either page (both are
 * well-linked externally) has nowhere to go. Both files carry a
 * `<!--RECENT_REPORTS-->` marker; this module swaps it for a server-rendered
 * list of the newest completed reports at request time, so the links exist
 * in the HTML a crawler actually fetches (no client JS required).
 */

import { escapeHtml, displayQuery, timeAgo } from '../lib/utils.js';
import { listableRowsSql } from '../lib/listable.js';
import { notFound, withSecurityHeaders, makeNonce } from '../lib/http-response.js';

const RECENT_HOME_LIMIT = 6;
const MARKER = '<!--RECENT_REPORTS-->';

// Fetches the newest completed, public reports for the homepage/best-index
// link section. Failure degrades to an empty string (never break the page).
export async function recentReportsSection(env, limit = RECENT_HOME_LIMIT) {
  const stmt = env.DB.prepare(
    listableRowsSql({
      select: 'slug, query, category, created_at',
      tail: 'LIMIT ?1',
    })
  ).bind(limit);
  const rows = (await stmt.all()).results ?? [];
  if (rows.length === 0) return '';

  const cards = rows.map((r) => `<a class="card" href="/research/${escapeHtml(r.slug)}">
${r.category ? `<div class="card-top"><span class="card-badge">${escapeHtml(r.category)}</span><span class="card-time readout">${timeAgo(r.created_at * 1000)}</span></div>` : `<div class="card-top"><span class="card-time readout">${timeAgo(r.created_at * 1000)}</span></div>`}
<h3>${escapeHtml(displayQuery(r.query))}</h3>
</a>`).join('');

  return `<section id="recent-reports" class="border-b border-line">
<div class="mx-auto max-w-5xl px-6 py-14 md:py-20">
<div class="flex flex-wrap items-baseline justify-between gap-3">
<h2 class="font-serif text-h2 font-semibold text-ink">Recent research</h2>
<a href="/research" class="font-mono text-xs uppercase tracking-wide text-accent hover:text-accent-hover">Browse every report &rarr;</a>
</div>
<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>
</div>
</section>`;
}

// Serves the static asset behind `request`, swapping the recent-reports
// marker for the live section and applying the usual per-request CSP nonce.
// Falls back to the plain asset (still nonce'd) if the marker is missing.
async function injectRecentReports(request, env) {
  const asset = await env.ASSETS.fetch(request);
  if (asset.status === 404) return notFound();

  const contentType = asset.headers.get('Content-Type') || '';
  const pathname = new URL(request.url).pathname;
  const longLived = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|webmanifest)$/i.test(pathname);
  const cacheControl = longLived
    ? 'public, max-age=604800, stale-while-revalidate=2592000'
    : 'public, max-age=3600, stale-while-revalidate=604800';

  if (!contentType.includes('text/html')) {
    const out = withSecurityHeaders(asset, null);
    out.headers.set('Cache-Control', cacheControl);
    return out;
  }

  let html = await asset.text();
  if (html.includes(MARKER)) {
    const section = await recentReportsSection(env).catch(() => '');
    html = html.replace(MARKER, () => section);
  }

  const nonce = makeNonce();
  html = html.replaceAll('__CSP_NONCE__', nonce);
  const out = withSecurityHeaders(asset, nonce, html);
  out.headers.set('Cache-Control', cacheControl);
  return out;
}

export async function renderHome(request, env) {
  return injectRecentReports(request, env);
}

export async function renderBestIndex(request, env) {
  return injectRecentReports(request, env);
}
