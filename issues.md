# Issues

Last updated: 2026-06-16

## 2026-06-16 — Google audit (godmode: "search, profit") — ads.txt + AdSense CSP

Audited every Google-facing surface (AdSense, structured data, sitemap, robots,
IndexNow, /find). State is mature; the two real defects (both monetization):

- [x] HIGH (profit): `ads.txt` was MISSING. AdSense flags this as "Earnings at
      risk — your ads.txt file doesn't contain your publisher ID" and can throttle
      or stop serving ads. Added `public/ads.txt` (served at /ads.txt by the
      [assets] binding) declaring `google.com, pub-6952672558994325, DIRECT,
      f08c47fec0942fa0`. Pub ID matches wrangler.toml ADSENSE_PUBLISHER_ID and the
      loader hardcoded in public/*.html. [godmode R1] — DEPLOYED + verified live (HTTP 200).
- [x] HIGH (profit): CSP would block AdSense ad rendering + measurement. Ad units
      are placed (research top/mid/bottom, reviews top/bottom) and the loader is
      allowed, but `frame-src` lacked the SafeFrame creative host and `connect-src`
      blocked ALL ad beacons — so once traffic arrives, creatives/measurement fail
      → ~zero revenue despite ads.txt. Per Google (answer/16283098, which only
      "supports strict CSP") + two field sources, widened:
      frame-src += tpc.googlesyndication.com, www.google.com;
      connect-src += pagead2.googlesyndication.com, googleads.g.doubleclick.net,
      tpc.googlesyndication.com, ep1/ep2.adtrafficquality.google, www.google.com.
      script-src already nonce+strict-dynamic (Google's recommendation); img-src
      already https:. No wildcards, no 'unsafe-eval'. [godmode R2]
- [x] LOW (SEO crawl hygiene): added `Disallow: /find` to robots.txt — /find is an
      exact-path 302→Google redirect, no crawl value (longest-match beats Allow: /).
      Left /login + /account crawlable on purpose (noindex,follow needs crawl to be
      honored); /feed.xml deliberately not in robots (Sitemap directive is the standard). [godmode R3]
- [x] LOW (cleanup): removed dead GOOGLE_CSE_ID from wrangler.toml (no code reads
      env.GOOGLE_CSE_ID; the /find CSE widget was retired for a plain redirect). [godmode R3]
- [ ] WATCH: if AdSense console shows an 'unsafe-eval' or fenced-frame CSP error
      under real traffic, add `'unsafe-eval'` to script-src and/or a
      `fenced-frame-src` directive. Deferred (security cost; add only on real error).
- [ ] DECISION (Google AI visibility): the LIVE /robots.txt is NOT just our static
      file — Cloudflare prepends a MANAGED block (zone-level "Content Signals" /
      AI Crawl Control) that sets `Content-Signal: search=yes,ai-train=no` and
      `Disallow: /` for GPTBot, ClaudeBot, CCBot, Bytespider, Amazonbot,
      Applebot-Extended, meta-externalagent AND **Google-Extended**. Effects:
      • Google SEARCH indexing is unaffected (Google-Extended only governs Gemini/
        AI-training; Googlebot ignores Content-Signal). Our /find Disallow + Sitemap
        still apply (Googlebot merges the two `User-agent: *` groups).
      • But content is walled off from AI-answer grounding (incl. Google AI
        Overviews via Google-Extended) — a strategic call for an affiliate site
        chasing traffic. NOT auto-changed: this is a genuine fork. To allow AI
        referral surfaces, disable/relax the managed policy in the Cloudflare
        dashboard (AI Crawl Control / robots.txt). Left to user.

Verified (NOT issues): static + server-rendered AdSense loaders use the same pub
ID with no double-injection; per-product Review.reviewRating already makes pages
review-snippet eligible (no fake aggregateRating — correct for the honesty ethos);
`reviewRating.worstRating: 0` is VALID per Google's spec and correctly describes
the 0–5 inference scale (validate.js clamps rating to 0–5) — changing it to 1
would misrepresent the scale and drop any sub-1.0 rating, so left as-is; sitemap
excludes thin pages; IndexNow pings Bing/Yandex (Google relies on the sitemap +
crawl, by design — Google doesn't consume IndexNow).

## 2026-06-16 — Opportunity audit (8-dimension multi-agent sweep, ranked backlog)

47 findings across SEO/traffic, conversion, content-quality, UX, perf, growth,
reliability, measurement; grounded in file:line evidence + live site. Verify pass
was cut short by an API session limit (8/47 verified before reset) — verdicts that
landed: budget-governor + cache-headers = REAL; brotli/tailwind-prebuilt =
ALREADY DONE; font preload/de-block + image-CLS attrs = NOT WORTH (fragile/
CSP-blocked/no traffic signal). Strategic frame: traffic + measurement first
(funnel-freeze unblock), conversion polish later.

### DO NEXT (high impact / low effort)
- [x] HIGH: Per-page OG images are SVG (`/research/:slug/og.svg`, html.js:55
      og:image:type=image/svg+xml) — SVG OG cards render BLANK on FB/X/LinkedIn/
      Discord/Slack/iMessage → all social shares dead. Quick fix: point per-page
      og:image at the static PNG `/og.png` (generic but working). Better: vendor a
      resvg/satori wasm to render per-page PNG (no package mgr → vendored wasm OK).
- [x] HIGH: No FAQPage schema on the 163 research pages — emit it from existing
      buyersGuide (howToChoose/pitfalls/marketingToIgnore) for rich-results + AI
      citation (research-page.js:797-801). Homepage already has the FAQPage pattern.
- [x] HIGH: Thin single-guide /best hubs are sitemapped + indexable (doorway/thin
      content risk). Gate `rows.length < 2|3` → noindex,follow + exclude from
      sitemap hub loop (category.js:51, sitemap.js:108-115; ~153 hubs live).
- [x] HIGH: Homepage has NO link to the /research archive — first-timers can't see
      existing rankings without spending a query (~$0.04 + wait). Add a Browse/
      category strip (listCategories exists, used by browse.js:48-59).
- [ ] HIGH: /metrics never joins views↔affiliate clicks → no per-page CTR, the
      exact signal the re-research flywheel keys on (metrics.js:105-153).
- [x] MED(verified REAL): Static assets serve `cache-control: max-age=0,
      must-revalidate` (css/js/og.png) — add `public/_headers` with
      `max-age=31536000, immutable`. Repeat-visit speed + cost.
- [ ] HIGH(constraint-protect, verified REAL): Budget governor split-brain —
      intake gates trust the racy KV `cost:` counter (research.js:109, chat.js:120)
      while the real ceiling uses D1 SUM; a burst can overspend MONTHLY_BUDGET_USD.
      Add a `budgetExhausted(env)=max(D1 spend, KV)` gate helper. Pair: move the
      failure-path incrementMonthlyCost INSIDE the idempotency latch (internal.js:106).

### QUICK WINS (S)
- [ ] MED: Unify brand (TrueRank vs Chrisputer Labs) across titles/og:site_name/
      Organization schema — flagged by BOTH seo + ux agents (html.js:62,67 vs
      static "TrueRank"). Consistent entity = brand consolidation + trust.
- [ ] MED: Add year token to dynamic research <title> ("(2026)") like static guides
      already do — CTR lift (research-page.js:1051).
- [ ] MED: IndexNow-ping /best/ hubs (not just /research/) — plumbing exists
      (orchestrator.js:209, indexnow.js accepts arrays).
- [ ] MED: "Price as of <date>, check current price" caption near CTAs — honesty +
      click-trust, reuses lastModifiedTs (research-page.js:357). Fits the ethos.
- [ ] MED: Email capture on home/hubs (backend fully built; research-page-only today).
- [ ] MED: Amazon `ascsubtag` (slug+rank) on /api/go redirects → free EPC/earnings
      attribution per page via Associates report (affiliate.js:56-86).
- [ ] HIGH: Raise engine READ_MIN_SCORE so hands-on expert reviews scoring 45
      (50 base +hands-on +expert −45 affiliate-conflict) aren't dropped from
      full-text READ (parallel-engine.js:21). Still discount their verdicts in synth
      — read them, don't blindly trust. Direct moat lift.
- [ ] MED: Add non-product (service/local/experience) queries to golden-query eval —
      it's 10/10 buyable products today, blind to the facets most likely broken.
- [ ] LOW: Recompress og.png 210KB→~60KB (hygiene); delete dead db.js legacy helpers
      (insertProductV2/completeResearch lack the idempotency latch = footgun);
      log when the decompose fallback fires (silent quality degradation).

### STRATEGIC BETS (M/L, high impact)
- [ ] HIGH/L: Ingest GSC Search Analytics → D1 via cron (the literal funnel-freeze
      unblock metric; zero GSC code in repo). Needs a Google service-account/OAuth
      cred (USER ACTION). This is the measurement that ends the freeze.
- [ ] HIGH/M: Side-by-side comparison TABLE on research pages (highest-converting
      "best X" unit; none exists — grep '<table' = 0). Also adds scannable content + SEO.
- [ ] HIGH/M: Wire facet-specific research (prompts.js facetFocusBlocks) into the
      LIVE parallel engine — today service/local/experience queries get a
      product-shaped plan (parallel-engine.js decompose never receives facets).
- [ ] MED/M: Internal-linking + topic-cluster — home/hubs → dynamic hubs + research;
      add category breadcrumb level (Home>Research>Category>title) hub↔spoke.
- [ ] HIGH/M: Log unservable demand (failed/thin/zero-match queries) → content roadmap.
- [ ] MED/M: Route homepage search into the rich server-rendered processing page
      (two different loading UIs today; homepage is a bare text log at peak abandonment).
- [ ] MED/M: Atomic-ish KV rate limiter (concurrent burst bypasses limit);
      pre-claim dedup so cron fallback + off-CF worker don't both run a paid engine.

### USER-ACTION-GATED (not code-only)
- [ ] Non-Amazon retailer CTAs: code fully supports Walmart/Target/BestBuy/Newegg/
      B&H (affiliate-links.js) but needs Impact program IDs in wrangler.toml —
      requires signing up for Impact + each retailer program.
- [ ] AI-crawler block: tracked DECISION (above) — relax in Cloudflare dashboard to
      allow Perplexity/ChatGPT/Google-AI-Overviews referral traffic.

### SKIP / ALREADY DONE (don't chase)
- Tailwind is prebuilt (not CDN) + Brotli is live — compression/CDN-blocking myths.
- Font preload / print-swap de-blocking — fragile + the onload trick is CSP-blocked
  (no unsafe-inline); image width/height — aspect-ratio already set, no CWV signal.
- Product/Review JSON-LD, sitemap thin-page exclusion, ASIN /dp/ resolver,
  clarifying questions, IndexNow(research), staleness re-research — already shipped.

## 2026-06-16 — /find redirect fix + deferred-backlog burndown

User-reported bug + the tracked LOW backlog, all handled this round:
- [x] HIGH (user-reported): /find "search on Google" links errored instead of searching.
      The page embedded a Google Programmable Search (CSE) widget for AdSense-for-Search,
      but AFS isn't available to this post-2022 AdSense account, so the widget earned $0 and
      errored client-side. Rewrote worker/pages/find.js to always 302-redirect to a real
      https://www.google.com/search?q=… (guide_click logging preserved, rate-limited).
- [x] LOW: CSP carried dead cse.google.com / www.google.com / clients1.google.com grants
      (script/style/connect/frame) only the removed CSE widget used — dropped them (tighter
      CSP); fixed the stale CSP comment, research-page.js CTA comments, and the privacy.html
      /find description (now "redirects you to a Google search").
- [x] LOW: off-CF worker runs surfaced NO live progress (onEvent was a no-op) — added
      POST /api/internal/progress (X-Worker-Secret auth, same progress:{id}/progress_log:{id}
      KV shape, capped at 50) + research-worker.mjs posts a per-job monotonic beat per engine
      event (best-effort, fire-and-forget). Processing page now animates for off-CF runs.
- [x] LOW (telemetry): persistEngineResult now logs `persist-duplicate` when the idempotency
      latch loses a race (off-CF worker + CF cron fallback both synthesized the same job) so
      wasted double-synthesis is observable in logs.
- [x] LOW (×3 from the Deferred list below): status-vocab → lib/status.js; maybe304 dup →
      lib/utils.js isNotModified; static guide URLs/lastmod → lib/guides.js manifest.

Gate: node --check (12 files) + import-graph/helper smoke tests + `node scripts/run-tests.mjs`
(55/55) all green. Deferred B4 (canonical-dedup CTE) left open with rationale.

## 2026-06-16 — Engine consolidation, benchmark, off-Cloudflare parallel worker

Large multi-part round, all verified live in production:
- [x] LLM-stack benchmark: every engine role benchmarked via real OpenRouter calls
      (benchmarks/engine-llm-bench-2026-06.md). The planner's reputed "15% BS-detection"
      did NOT reproduce; the literature's top replacement (qwen3.5-397b) failed
      empirically. Supersedes the comment-only BullshitBench numbers.
- [x] OpenRouter consolidated to one dedicated capped key (TrueRank-Prod).
- [x] Tiers collapsed to ONE config (tiers.js ENGINE_CONFIG): synth moonshotai/kimi-k2.6
      (matched opus honesty at ~1/9 cost), planner gemini-2.5-flash, classifier
      gemini-2.5-flash-lite, ~50-search deep research. Live, ~$0.03-0.04/run.
- [x] Kimi reasoning gotcha fixed: kimi-k2.6 reasons by default → empty synth on large
      prompts; synth now passes reasoning:{enabled:false} + max_tokens 16000 (llm.js).
- [x] Parallel engine v2 (parallel-engine.js): decompose-with-queries → parallel search →
      parallel read → batched note-extraction → synth. ~43s, 145+ sources (was 81-137s).
- [x] Off-Cloudflare research worker DEPLOYED on blackbox (Portainer, Approach B: worker
      computes, CF persists via /api/internal/{next-job,complete}). Phase B cutover ACTIVE
      (EXTERNAL_WORKER_ENABLED=true) — all research off-CF, uncapped; cron fallback covers
      worker-down. Worker runs JOB_CONCURRENCY=3 jobs at once.
- [x] Deploy: push-to-main does NOT deploy the Worker (no CI); deploy via
      `CLOUDFLARE_API_TOKEN=$(.cf-token) npx wrangler deploy`.

Reconciled stale opens: SERPER "0 products" HIGH, "no /dp/ links" MEDIUM, CF-token
user-action, and the Phase-2 result-shape / source-evidence LOWs are now resolved (below).
Funnel-freeze NOTE: GSC is now verified; still awaiting impressions before new funnel work.

### Code review of the new engine code (godmode R2, adversarial workflow)

7 files reviewed in parallel + findings adversarially verified (1 HIGH, 7 MEDIUM, refuted 1). Fixed:
- [x] HIGH: off-CF /api/internal/complete had no idempotency latch — a replayed POST
      double-counted the monthly budget + re-ran paid Serper resolvers + could clobber a
      complete row. Added `AND status='processing'` guards to all terminal writes and gated
      cost/KV/IndexNow on the row actually transitioning.
- [x] MEDIUM: failed runs never recorded LLM spend — engine attaches accrued totalCostUsd to
      thrown errors; worker forwards it; internal.js + orchestrator catch increment on failure.
- [x] MEDIUM: KV cost counter races + off-CF claim skipped the cap — added monthlySpendUsd
      (D1 SUM(cost_usd), no lost-update) + budget gate in claimNextPendingJob + cron fallback.
- [x] MEDIUM: /complete persisted worker payload without validateResearchResult — now
      re-validates on the CF trust boundary (20-product cap, image-URL allowlist).
- [x] MEDIUM: WORKER_SECRET compared non-constant-time — SHA-256 timingSafeEqual.
- [x] LOW: zero-source burst could synthesize hallucinated products — short-circuit to an
      honest non-result; worker poll-loop sleep-timer churn cleared; cron fallback → ctx.waitUntil + 6-min cap.
- [ ] LOW (deferred): metrics.js token compare non-constant-time (read-only); synthesis can
      double-charge on malformed-but-successful streamed JSON (add cost telemetry / JSON-repair).

## Debate-verdict remediation (2026-06-12, adversarial debate: 64/100 on-track)

Source: 5-stance repo-grounded debate + judge. Full prescription executed same day.

- [x] HIGH: Docs claimed unbuilt "fake review detection" (PRD §3, README:134, chat
      prompt, home/about copy) — rewrote all surfaces to describe the shipped
      source-genre credibility engine; fake-review detection scoped as future (PRD §3b);
      accounts non-goal amended (graduated 2026-06-12).
- [x] HIGH: Re-research loop was conversion-keyed only (converting-but-wrong pages
      invisible) — added staleness trigger: oldest complete page > STALE_REFRESH_DAYS
      (default 120) refreshes at full tier when no zero-click candidate exists
      (worker/lib/keywords.js).
- [x] MEDIUM: Credibility test suite was dead code (header referenced a route that
      never existed) — now runs via `node scripts/run-tests.mjs`, 55/55 green.
- [x] MEDIUM: No output-level honesty measurement — golden-query eval shipped
      (eval/golden-queries.json + scripts/run-eval.mjs): pick correctness, disclosure
      presence, depth, freshness against the live site. First run: 4/5 picks correct
      (5th was a label gap, fixed), 5/5 disclosure.
- [x] MEDIUM: Scaled-content risk — thin-page gate in publicResearchFilter
      (≥3 products, ≥2 for comparative) now excludes thin pages from sitemap/browse/
      hubs/suggest, and research pages < threshold render noindex.
- [ ] LOW: BullshitBench numbers (opus-4.8 94%, planner 15%) exist only as code
      comments — harness was external (petergpt.github.io); not reproducible from this
      repo. Accept as provenance-noted, or rebuild a local trap-question eval later.
- [ ] NOTE: Funnel-feature freeze in effect until first real traffic data (judge
      recommendation): no new accounts-tier features, /find iterations, or chat
      expansion before GSC shows impressions.

## Engine quality round (2026-06-12)

Verified end-to-end locally (full-tier webcam run: 3/4 products with direct tagged /dp/
links, video sources ingested, $0.081/run) and deployed to production.

- [x] MEDIUM: Direct /dp/ ASIN links — post-synthesis resolver (worker/lib/asin-resolver.js):
      one Serper site:amazon.com query per linkless product (cap 5), title sanity-match,
      tagged via buildAffiliateUrl. Unmatched products keep the tagged-search fallback.
- [x] Video provider restored: Serper /videos + ported worker/lib/youtube.js description
      scrape (affiliate-conflict detection on video descriptions works again).
- [x] Clarifying-questions interstitial restored (worker/pages/clarify.js): full-tier
      underspecified queries ask up to 3 chip-answer questions before spending; answers
      thread into canonical clustering + synthesis constraints; skip path preserved.
- [x] Model upgrade per BullshitBench v2 (3-judge consensus, 100 trap questions):
      exhaustive/unbound synth → anthropic/claude-opus-4.8 NO reasoning (94% BS detection
      vs 76% for opus-4.7; no-reasoning beats xhigh). Sonnet-4.6 stays on full (84%).
      Planner gemini-2.5-flash scores 15% (77% fooled) — mitigated with a synthesis-prompt
      guard: note sentiment is untrusted, deterministic credibility tags outrank it.
- [x] Full tier depth: maxFetches 3→6, maxSearches 12→14.
- [x] Metrics-driven re-research sweep in the flywheel tick: pages with ≥25 views, zero
      affiliate clicks in 30d, >30d old → re-run at exhaustive tier IN PLACE (same row/slug,
      SEO equity kept), max 2/day (RERESEARCH_DAILY_MAX), budget-gated.
- [x] Jina resilience: direct-fetch + tag-stripping readability fallback on 429/5xx/timeout.

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
- [x] SERPER_API_KEY provided 2026-06-11, validated live, in .dev.vars (gitignored). Full-tier verification run: 6 products with verdicts/prices/ratings sourced from Tom's Hardware/Wirecutter/RTINGS/Reddit, credibility tags on sources (hands-on/expert-domain/community), 6 Review JSON-LD blocks, 6 click-tracked CTAs, cost $0.108 (matches the $0.099 bench estimate). REMAINING: `wrangler secret put SERPER_API_KEY` at first deploy (needs CF auth).
- [x] MEDIUM (RESOLVED via worker/lib/asin-resolver.js): No direct /dp/ ASIN links yet — expert review pages link Amazon through affiliate redirects the extractor strips, so products fall back to tagged search links (still earn commission via /api/go). Improvement idea for a later round: post-synthesis ASIN resolution via one Serper `site:amazon.com` query per top product.
- [x] RESOLVED (.cf-token deploys + sets secrets): CLOUDFLARE_API_TOKEN or `wrangler login` needed for Phase 3 (D1 migration + chrisputer.tech cutover) and for pushing secrets.

## Phase 2: Research engine port (2026-06-11)

Engine stack ported from Exhaustive (agent loop, Serper/HN/DDG/RSS providers, credibility
scoring + ASIN extraction, classifier, tiers, budget governor, cron reaper). Build green,
55/55 credibility tests pass, prompt fidelity audited, budget governor and tier gating
verified live. One real instant-tier run executed (cost $0.0102, correctly recorded).

- [x] HIGH (RESOLVED): Real runs produce 0 products without SERPER_API_KEY.
      DuckDuckGo's html.duckduckgo.com endpoint returns 0 parseable results (anti-bot /
      markup change, confirmed via live curl), so without Serper only RSS+HN work
      (~1 source) and synthesis honestly fails the run. NEEDS: the user's Serper.dev API
      key (2500 free searches) added to .dev.vars locally and `wrangler secret put
      SERPER_API_KEY` for deploys. Captured as HIGH learning in search-providers domain.
- [x] Engine port verified: idempotent queue claim, processing-row reaper cron, KV cost
      counter + 503 budget stop, tier validation (PUBLIC_TIERS), old pipeline deleted.

### Deferred (tracked, not bugs)
- [x] LOW: Status-vocabulary translation (complete/completed, failed/error) — consolidated into worker/lib/status.js (apiStatus); research.js + report.js import it (2026-06-16).
- [ ] LOW: Canonical-dedup ROW_NUMBER CTE repeated across suggest/browse/sitemap — extract SQL-fragment helper. (Still deferred — the four call sites differ in table alias, ORDER BY, and selected columns, so a clean shared fragment isn't safely factorable without a dev server to verify; low value vs. regression risk.)
- [x] LOW: maybe304() duplicated between index.js and sitemap.js — unified via isNotModified() in worker/lib/utils.js; both call sites import it (2026-06-16).
- [x] LOW: Static guide URLs hardcoded in sitemap.js + GUIDES_LASTMOD in index.js — derived from worker/lib/guides.js manifest (STATIC_GUIDES/STATIC_GUIDE_SLUGS/GUIDES_LASTMOD); add a guide in one place (2026-06-16).
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
