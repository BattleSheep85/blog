# Changelog

## [1.1.0] - 2026-06-09

### Added
- High-end editorial design system: Newsreader serif headlines, Inter UI, JetBrains Mono numerals, CSS-variable theming (one `.dark` class flips every token), warm-paper light mode
- Redesigned landing page and report page (verdict block with animated radial trust ring, comparison table, sourced citation chips with hover popovers, shimmer loading states)
- Evergreen affiliate buying guides under `/best/` (NAS, mechanical keyboards, wireless earbuds, Synology vs QNAP) plus a guides hub
- SEO: canonical tags, Open Graph/Twitter cards, JSON-LD (WebSite, BreadcrumbList, ItemList, FAQPage), `robots.txt`, `sitemap.xml`
- `GET /api/go/search` affiliate redirect for static guides (server-side associate tag, best-effort click logging via new `guide_clicks` table, migration 002)
- `?q=` deep-link prefill on the homepage search (guides link into a live report)
- Prebuilt Tailwind CSS (`public/css/tailwind.css` via the standalone CLI, `tailwind.config.cjs`), replacing the runtime Play CDN
- Open Graph share image (`public/og.png`, 1200x630)
- Security headers via `public/_headers` (Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy)
- Dedicated `accent-strong` token so primary buttons pass WCAG AA

### Security
- Fixed a stored XSS: attribute-safe `escapeHtml` plus an http(s) `href` scheme allowlist for source URLs
- Fixed missing-path 500s (declared the `ASSETS` binding); added the CSP above as defense-in-depth
- Removed the unused vendored htmx (supply-chain hygiene)

### Accessibility
- WCAG AA contrast fixes (ink-3, trust tiers, primary button), focus-reachable source citations, reduced-motion scrolling, aria-live status regions, table caption/scope

### Changed
- Repository renamed `blog` to `truerank`
- Extracted all report rendering into a single shared module (`js/render.js`), removing the duplication between `app.js` and `report.js`
- Accent color moved from emerald to editorial blue
- `prefers-reduced-motion` is respected globally

### Fixed
- Theme toggle now present on the report permalink page
- `escapeHtml()` no longer duplicated across frontend scripts

## [1.0.0] - 2026-04-07

### Added
- Product research pipeline: search, analyze, synthesize, enrich
- Fake review detection using DeepSeek R1 via OpenRouter (free)
- Report synthesis using Qwen 3.6 Plus via OpenRouter (free)
- Multi-source search: Reddit JSON API, HN Algolia, Serper.dev Google search
- Cloudflare Workers API with D1 database and KV cache
- Queue-based background processing for research jobs
- SSE streaming for live research progress
- Report caching (24h) to reduce API calls
- Rate limiting (5 requests/hour per IP)
- Amazon Associates affiliate link integration with click tracking
- Dark/light theme toggle
- Mobile-responsive design
- Permalink report pages
- User feedback collection on reports
- Affiliate disclosure in footer and reports
