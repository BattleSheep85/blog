// Single source of truth for the static /best/ guide pages (served from
// public/best/ via ASSETS). The sitemap derives its <url> entries from this and
// dedupes dynamic category hubs against STATIC_GUIDE_SLUGS; index.js reads
// GUIDES_LASTMOD for the guides' sitemap lastmod. Add a guide in one place.
export const GUIDES_LASTMOD = '2026-06-09';

export const STATIC_GUIDES = [
  { slug: 'nas-for-home-media-server', changefreq: 'monthly', priority: '0.8' },
  { slug: 'mechanical-keyboards-under-100', changefreq: 'monthly', priority: '0.8' },
  { slug: 'wireless-earbuds-under-100', changefreq: 'monthly', priority: '0.8' },
  { slug: 'synology-vs-qnap', changefreq: 'monthly', priority: '0.8' },
];

export const STATIC_GUIDE_SLUGS = new Set(STATIC_GUIDES.map((g) => g.slug));
