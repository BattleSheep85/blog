# Issues

Last updated: 2026-06-09

## Security

- [x] CRITICAL: Stored XSS. `escapeHtml()` did not escape quotes and `source.url` was injected into an `href` with no scheme allowlist. (Fixed: attribute-safe `escapeHtml` + `safeHref` http(s) allowlist in render.js.)
- [ ] LOW: No Content-Security-Policy header. Defense-in-depth; add `default-src 'self'` plus cdn.tailwindcss.com and fonts.
- [ ] LOW: CORS is wildcard (*) on all API endpoints. Acceptable for a public tool, but monitor for abuse.
- [ ] LOW: LLM prompt injection surface via user queries. Inherent to LLM-based systems.

## Bugs

- [x] CRITICAL: Live-report affiliate CTAs pointed at `/api/go/` with an empty product id and 404'd. (Fixed: orchestrator stamps a stable `product.id` into report_json + render.js falls back to `/api/go/search`.)
- [x] HIGH: Missing paths returned 500 instead of 404 because `env.ASSETS` was undefined. (Fixed: added `binding = "ASSETS"` to wrangler.toml `[assets]`.)
- [x] LOW: Cached-report response omitted sourceCount/filteredCount (stats line vanished on cache hits). (Fixed in research.js.)
- [x] LOW: Report permalink heading used `report.query`, which was never in report_json. (Fixed: orchestrator stamps `query`.)
- [x] LOW: report.js dereferenced `[data-loading-status]` with no null guard. (Fixed.)

## UX / Accessibility

- [x] HIGH: Opacity modifiers (/60, /40, /25) on var-based colors compiled to nothing (broke focus rings, hover tints, shimmer). (Fixed: color-mix color functions in tailwind-config.js.)
- [x] HIGH: `text-ink-3` failed WCAG AA for body text. (Fixed: darkened in both themes.)
- [x] HIGH: Light-theme trust-high/trust-low failed AA on their badges. (Fixed: darkened.)
- [x] HIGH: Source-citation popover was hover-only. (Fixed: added focus-within reveal + `title` for touch/SR.)
- [x] MEDIUM: prefers-reduced-motion ignored by `scrollIntoView({behavior:'smooth'})`. (Fixed: gated in app.js.)
- [x] MEDIUM: Report/error/loading regions were not announced. (Fixed: role=alert / role=region+focus / role=status.)
- [x] LOW: Comparison tables lacked `<caption>` and `th scope`. (Fixed in render.js + guide generator.)
- [x] LOW: Theme toggle missing from report.html. (Fixed.)
- [x] LOW: Print stylesheet did not force light tokens on the dark default theme. (Fixed.)
- [ ] MEDIUM: White text on the primary `bg-accent` button is ~3.68:1 in dark theme (below AA). A single accent token cannot satisfy both white-on-button and accent-as-text-on-dark; fix needs a dedicated darker filled-button token (e.g. `accent-strong`) swapped into the CTA buttons.
- [ ] LOW: Light-theme `trust-medium` on its badge is ~4.48:1 (just under AA). Nudge darker.

## SEO / Content

- [x] LOW: Homepage had visible FAQ but no FAQPage JSON-LD. (Fixed.)
- [x] LOW: WebSite SearchAction advertised a search the deep link did not run. (Fixed: removed the SearchAction; `?q=` still prefills.)
- [ ] MEDIUM: No share image. `twitter:card` was downgraded to `summary` to avoid a blank large-image card. Create a 1200x630 `public/og.png`, add `og:image`/`twitter:image`, and restore `summary_large_image`.
- [ ] LOW: Canonical, Open Graph, and sitemap.xml use the placeholder domain `https://truerank.io`. Update to the real production domain on deploy.
- [ ] LOW: Static guide trust scores are editorial judgement, not pipeline-derived. By design; consider a visible note for transparency.

## Production reliability

- [ ] MEDIUM: Tailwind is loaded from the Play CDN with a runtime config. The whole design system depends on it. For production, generate a static stylesheet with the standalone Tailwind CLI binary (no package manager needed) and vendor it. Note: routes, JSON-LD, and the affiliate redirect were verified via local `wrangler dev`; a full browser visual render of the CDN + color-mix tokens is still recommended.
- [ ] LOW: Guide affiliate-click logging depends on migration `002_guide_clicks.sql`. Logging is best-effort (try/catch), so redirects still work if the table is missing (confirmed locally).
- [ ] LOW: `public/vendor/htmx.min.js` is vendored but no page loads it. Kept as documented in the stack; delete if htmx will not be adopted.

## Code Quality

- [x] LOW: `escapeHtml()` duplicated in app.js and report.js. (Fixed: extracted to shared `js/render.js`.)
- [ ] LOW: D1 source/product inserts in orchestrator are sequential, not batched.
