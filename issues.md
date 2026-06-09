# Issues

Last updated: 2026-06-09

All code-resolvable issues are fixed. The remaining open items need either your
production domain, your Cloudflare credentials, or are intentional design choices.

## Security

- [x] CRITICAL: Stored XSS via unescaped quotes + no URL-scheme allowlist. (Fixed: attribute-safe `escapeHtml` + `safeHref` in render.js.)
- [x] LOW: No Content-Security-Policy. (Fixed: `public/_headers` adds CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy. Verified served via `wrangler dev`.)
- [ ] LOW (by design): CORS is wildcard (*) on the API. Intentional for a public tool. Tighten to the production origin or an allowlist if cross-origin abuse appears. Needs the real domain.
- [ ] LOW (inherent): LLM prompt-injection surface via user queries. Inherent to LLM systems; mitigated by output escaping and not executing model output.

## Bugs

- [x] CRITICAL: Live-report affiliate CTAs 404'd (no product id). (Fixed: orchestrator stamps `product.id` + render.js `/api/go/search` fallback.)
- [x] HIGH: Missing paths returned 500 not 404. (Fixed: `binding = "ASSETS"` in wrangler.toml.)
- [x] LOW: Cached-report response omitted source/filtered counts. (Fixed.)
- [x] LOW: Report permalink heading used absent `report.query`. (Fixed: orchestrator stamps `query`.)
- [x] LOW: report.js unguarded querySelector deref. (Fixed.)

## UX / Accessibility

- [x] HIGH: Opacity modifiers on var-based colors compiled to nothing. (Fixed: color-mix color functions.)
- [x] HIGH: `text-ink-3` failed WCAG AA. (Fixed: darkened both themes.)
- [x] HIGH: Light trust-high/trust-low failed AA on badges. (Fixed: darkened.)
- [x] HIGH: Citation popover was hover-only. (Fixed: focus-within reveal + `title`.)
- [x] MEDIUM: prefers-reduced-motion ignored by smooth scrolling. (Fixed.)
- [x] MEDIUM: Report/error/loading regions not announced. (Fixed: role/aria-live + focus.)
- [x] MEDIUM: Primary button white-on-accent was ~3.68:1. (Fixed: dedicated `accent-strong` filled-button token passes AA.)
- [x] LOW: Comparison tables lacked caption/scope. (Fixed.)
- [x] LOW: Theme toggle missing from report.html. (Fixed.)
- [x] LOW: Light `trust-medium` ~4.48:1 on badge. (Fixed: darkened to #9A4A07.)
- [x] LOW: Print stylesheet did not force light tokens on the dark default. (Fixed.)

## SEO / Content

- [x] MEDIUM: No share image (twitter card was blank-large). (Fixed: generated `og.png`, wired og:image/twitter:image, restored summary_large_image.)
- [x] LOW: Homepage had visible FAQ but no FAQPage JSON-LD. (Fixed.)
- [x] LOW: WebSite SearchAction advertised a search the deep link did not run. (Fixed: removed.)
- [x] LOW: Static guide trust scores not flagged as editorial. (Fixed: visible note on each guide.)
- [ ] LOW (needs domain): Canonical, OG, and sitemap use the placeholder `https://truerank.io`. Replace with the real production domain on deploy.

## Production reliability

- [x] MEDIUM: Tailwind loaded from the Play CDN. (Fixed: prebuilt `public/css/tailwind.css` via the standalone CLI, no runtime CDN. Verified in a real browser across static pages and a full dynamic report.)
- [x] LOW: Unused vendored htmx shipped publicly. (Fixed: removed; docs updated.)
- [ ] LOW (deploy step): Guide click logging needs migration `002_guide_clicks.sql` run. Logging is best-effort, so redirects work regardless.

## Code Quality

- [x] LOW: `escapeHtml()` duplicated. (Fixed: shared `js/render.js`.)
- [x] LOW: D1 source/product inserts were sequential. (Fixed: concurrent via Promise.all.)
