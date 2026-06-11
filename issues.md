# Issues

Last updated: 2026-06-11

## Phase 1: SSR/SEO port + code review (2026-06-11)

Server-rendered /research/:slug pages replaced the client-rendered 24h /report flow
(commit 6b43022). A 7-angle code review confirmed 10 bugs; all fixed and
regression-verified on a local dev server.

### Security
- [x] CRITICAL: Stored HTML injection via JSON-LD — JSON.stringify output interpolated into `<script type="application/ld+json">` without escaping `<`, allowing `</script>` breakout from user queries. (Fixed: `jsonLdScript()` helper in worker/lib/html.js escapes `<` → `<`; used for all LD blocks in research-page.js and browse.js. Verified with a seeded `</script><b>` probe row.)
- [x] HIGH: GET /research/new was state-changing (D1 insert + paid queue job + rate-limit burn) and linked via plain `<a>` tags → prefetch abuse. (Fixed: action links are POST forms; Sec-Purpose/Purpose prefetch headers get 204 with no side effects.)
- [x] MEDIUM: /sitemap.xml, /feed.xml, og.svg, and 404 responses lacked security headers. (Fixed: wrapped in withSecurityHeaders.)

### Bugs
- [x] HIGH: Canonical clustering matched zero-product "complete" rows, trapping equivalent queries on an empty page for 14 days. (Fixed: EXISTS(products) predicate in findResearchByCanonicalQuery.)
- [x] HIGH: "Re-run fresh" buttons dropped fresh=1 → dead button. (Fixed: fresh forwarded; handleStartResearch skips cluster lookup when fresh.)
- [x] HIGH: Queue retry duplicated product rows. (Fixed: DELETE FROM products WHERE research_id=? before insert.)
- [x] HIGH: Product verdicts never persisted (insertProductV2 mapping omitted verdict) → no card verdicts, no Review JSON-LD. (Fixed.)
- [x] HIGH: SSE "complete" gated on KV propagation; keepalives reset the client error counter → possible endless wait. (Fixed: complete emitted from D1 status.)
- [x] MEDIUM: Browse LIKE search used escaped wildcards without an ESCAPE clause → %/_ queries matched nothing. (Fixed: ESCAPE '\'.)
- [x] MEDIUM: View counts only incremented on page-cache miss (~1/hour). (Fixed: ctx.waitUntil increment on cache hits; verified count rises on cached requests.)
- [x] MEDIUM: handleAffiliateSearch read only the AMAZON_ASSOCIATE_TAG secret (revenue loss if unset). (Fixed: falls back to AMAZON_AFFILIATE_TAG var.)
- [x] MEDIUM: layout() referenced 5 nonexistent assets (/about, /favicon.svg, /manifest.webmanifest, /opensearch.xml, default og-image.svg). (Fixed: assets created; default og:image is /og.png.)
- [x] MEDIUM: Suggest endpoint skipped publicResearchFilter → thin/test rows in autocomplete. (Fixed.)

### Cleanup (done)
- [x] searchBar() duplicated across both pages → extracted to worker/lib/search-bar.js; tier radio removed until tiers exist (Phase 2).
- [x] Dead legacy client renderer (~550 lines: render.js, report.js, report.html) deleted; app.js always navigates to /research/:slug.
- [x] Duplicate canonical tag; double JSON.parse of product columns; sequential D1 queries on render path (now Promise.all); orchestrator progress KV read-modify-write (now in-memory append); sitemap/feed query-before-304 (now early 304 + KV-cached XML); dead affiliate_url search links no longer persisted.
- [x] Notify-me email box removed (discarded input); /api/subscribe stub removed — returns in Phase 4 with a real subscribers table.

## Phases 4-6: Monetization, flywheel, metrics (2026-06-11)

All verified end-to-end on local dev (build green, 10/10 checks).

- [x] Phase 4: every SSR product CTA routes through /api/go/:id (affiliate_clicks ip-hash logging; 302 to tagged /dp/ when stored, tagged search fallback otherwise; clean-link renders stay direct+untagged). AdSense top/mid/bottom slots confirmed (mid gated to >=5 products by design). Real email capture: subscribers table + POST /api/subscribe + notify box on processing pages + footer form on completed pages.
- [x] Phase 5 (gated): keyword_queue + 122 seeded high-intent keywords; scheduled() flywheel tick claims 1 keyword/run, max FLYWHEEL_DAILY_MAX=6/day, refuses to run without SERPER_API_KEY and stops at the monthly budget cap. Category hub pages at /best/:category (static guides win via ASSETS-first probe); hubs linked from browse + sitemap.
- [x] Phase 6: token-gated GET /metrics (503 unconfigured / 401 bad bearer): spend vs budget, runs by status/tier, top pages, per-product affiliate clicks, guide clicks, subscribers, keyword queue. Set METRICS_TOKEN via wrangler secret put.
- [x] HIGH: DuckDuckGo fallback repaired (was anti-bot blocked): browser-like headers + parser rewrite, verified against live responses. Engine has free web search again even before SERPER_API_KEY arrives.
- [ ] LOW: /metrics emits snake_case keys (top_pages, affiliate_clicks) — consumers should use those names.
- [ ] OPEN (user action): SERPER_API_KEY still wanted for Google-quality search + flywheel unlock; CLOUDFLARE_API_TOKEN or `wrangler login` needed for Phase 3 migration/cutover.

## Phase 2: Research engine port (2026-06-11)

Engine stack ported from Exhaustive (agent loop, Serper/HN/DDG/RSS providers, credibility
scoring + ASIN extraction, classifier, tiers, budget governor, cron reaper). Build green,
55/55 credibility tests pass, prompt fidelity audited, budget governor and tier gating
verified live. One real instant-tier run executed (cost $0.0102, correctly recorded).

- [ ] HIGH (BLOCKER for quality): Real runs produce 0 products without SERPER_API_KEY.
      DuckDuckGo's html.duckduckgo.com endpoint returns 0 parseable results (anti-bot /
      markup change, confirmed via live curl), so without Serper only RSS+HN work
      (~1 source) and synthesis honestly fails the run. NEEDS: the user's Serper.dev API
      key (2500 free searches) added to .dev.vars locally and `wrangler secret put
      SERPER_API_KEY` for deploys. Captured as HIGH learning in search-providers domain.
- [x] Engine port verified: idempotent queue claim, processing-row reaper cron, KV cost
      counter + 503 budget stop, tier validation (PUBLIC_TIERS), old pipeline deleted.

### Deferred (tracked, not bugs)
- [ ] LOW: Status-vocabulary translation (complete/completed, failed/error) spread across research.js apiStatus(), report.js literals, and inline page JS — consolidate into one map module during Phase 2 rewire.
- [ ] LOW: Canonical-dedup ROW_NUMBER CTE repeated across suggest/browse/sitemap — extract SQL-fragment helper.
- [ ] LOW: maybe304() duplicated between index.js and sitemap.js — unify when next touching either.
- [ ] LOW: Static guide URLs hardcoded in sitemap.js + GUIDES_LASTMOD in index.js — derive from a guides manifest.
- [ ] LOW: research.result JSON shape is an implicit contract across orchestrator/report.js/research-page.js — Phase 2 engine swap defines the canonical shape.
- [ ] LOW: Filtered/fake source evidence no longer persisted (only kept source URLs) — Phase 2 credibility layer stores tags+scores per source.

---

# Pre-rewrite issues (historical)

Last updated: 2026-06-09

All code-resolvable issues are fixed. The remaining open items need either your
production domain, your Cloudflare credentials, or are intentional design choices.

## Security

- [x] CRITICAL: Stored XSS via unescaped quotes + no URL-scheme allowlist. (Fixed: attribute-safe `escapeHtml` + `safeHref` in render.js.)
- [x] LOW: No Content-Security-Policy. (Fixed: the Worker injects a per-request nonce into HTML and sets a `nonce + strict-dynamic` CSP plus X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy. Matches the production policy. Verified scripts run under it via headless chromium.)
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
- [x] LOW: Canonical, OG, and sitemap domain. (Fixed: set to `https://chrisputer.tech`.)
- [x] MEDIUM: Production parity. (Fixed: re-added Google AdSense auto-ads and the nonce-based CSP that the live site has, so deploying this repo does not regress them. Cloudflare Web Analytics + managed challenge are zone-level and unaffected by deploys.)

## Production reliability

- [x] MEDIUM: Tailwind loaded from the Play CDN. (Fixed: prebuilt `public/css/tailwind.css` via the standalone CLI, no runtime CDN. Verified in a real browser across static pages and a full dynamic report.)
- [x] LOW: Unused vendored htmx shipped publicly. (Fixed: removed; docs updated.)
- [ ] LOW (deploy step): Guide click logging needs migration `002_guide_clicks.sql` run. Logging is best-effort, so redirects work regardless.

## Code Quality

- [x] LOW: `escapeHtml()` duplicated. (Fixed: shared `js/render.js`.)
- [x] LOW: D1 source/product inserts were sequential. (Fixed: concurrent via Promise.all.)
