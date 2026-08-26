/**
 * Shared numbered-pagination helpers for /research and /reviews. Renders a
 * full run of page-number links (crawlable <a href>, never a JS "load more"
 * button) so every page is reachable in a small, fixed number of hops from
 * page 1 instead of a long prev/next chain.
 *
 * When totalPages is small enough (<= MAX_FULL_RUN) every page number gets
 * its own link. Past that we window around the current page plus the first
 * and last page, so the link count stays bounded while first/last still stay
 * one hop away.
 */

const MAX_FULL_RUN = 30;
const WINDOW_RADIUS = 2;

// Returns an ordered array of page numbers and '...' separators to render.
export function pagerNumbers(totalPages, page) {
  if (totalPages <= 1) return [];
  if (totalPages <= MAX_FULL_RUN) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const set = new Set([1, totalPages]);
  for (let p = page - WINDOW_RADIUS; p <= page + WINDOW_RADIUS; p++) {
    if (p >= 1 && p <= totalPages) set.add(p);
  }
  const sorted = Array.from(set).sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('...');
    out.push(sorted[i]);
  }
  return out;
}

// Renders the numbered pager as a <nav>. `hrefFor(pageNum)` builds the href
// for a given page number; `label` sets aria-label for the nav landmark.
export function renderPagerNav(totalPages, page, hrefFor, label) {
  const numbers = pagerNumbers(totalPages, page);
  if (numbers.length === 0) return '';
  const items = numbers.map((n) => {
    if (n === '...') return '<span aria-hidden="true" class="px-2 text-ink-3">&hellip;</span>';
    const active = n === page;
    const cls = active
      ? 'border-line-strong bg-surface-2 font-semibold text-ink'
      : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink';
    return `<a href="${hrefFor(n)}" ${active ? 'aria-current="page"' : ''} class="inline-flex min-w-[2.25rem] items-center justify-center border ${cls} px-2 py-1.5 font-mono text-xs">${n}</a>`;
  }).join('');
  return `<nav aria-label="${label}" class="mt-8 flex flex-wrap items-center justify-center gap-1.5">${items}</nav>`;
}
