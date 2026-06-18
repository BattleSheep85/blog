# Issues

Last updated: 2026-06-18

## 2026-06-18 — Test coverage to ~100% on the pure-logic layer (godmode R3)

User: "keep looping and try to get 100% coverage." Zero-npm project → used Node's
built-in V8 coverage (no package manager). Test files aren't bundled into the worker,
so this round ships nothing to prod (no deploy).
- [x] Coverage harness: scripts/coverage.test.mjs (node:test wrapper over the suites) +
      scripts/coverage.sh (threshold gate, exits non-zero on regression). Documented in
      CLAUDE.md.
- [x] New suites: utils.test.js (33), affiliate-links.test.js (32), lib-pure.test.js (37:
      status/guides/tiers/ads/html), credibility-extra.test.js (8). Extended validate +
      product-search + reviews-render suites. Total 272 assertions, all green.
- [x] Result — pure-logic layer LINE coverage: brand-quality, foss-leaders, product-search,
      utils, credibility, status, guides, tiers, ads, html, validate, reviews.js all 100%;
      affiliate-links 98.4% (one UNREACHABLE defensive catch — URL is pre-validated by
      isValidHttpsUrl, so the inner new URL() can't throw). 99.85% line overall on the set.
- [x] Boundary documented: I/O modules (db, classifier, search providers, resolvers,
      handlers, engine LLM, index.js, full SSR research-page) need the CF runtime and are
      integration code — out of the unit-coverage target. Full coverage there needs a
      Workers test harness (Miniflair/wrangler) — a separate, larger effort.

## 2026-06-18 — Faceted search R2 + audit of the four "improve every aspect" areas

User picked all four godmode directions. Audit found the existing card infra already
covers most of them; added the one genuine gap + hardened tests.
- [x] DISCOVERABILITY/UX: custom price min/max inputs in the Price facet (presets are
      coarse across $0.25–$30k). product-search.js parses pmin/pmax (clamp, drop $0 floor
      + pmax<pmin), buildProductWhere applies the range (band takes precedence), isNarrowed
      + reviewsHref + active-chip (clears all 3 price keys) updated. +11 unit tests.
- [x] HARDENING: added a render smoke test (worker/pages/reviews.test.js, mock D1, async
      suite) that drives renderReviewsPage across base/category/multi-facet/custom-range —
      would have caught the valueOf 500 pre-deploy. 16 assertions.
- [x] CONVERSION: audited — the new search grid ALREADY click-tracks (cards reuse
      resolveProductCtas with id+slug → /api/go/:id → affiliate_clicks). No gap.
- [x] SPEED: audited — product images already loading="lazy" via the edge-cached /api/img
      proxy (no Referer, hotlink-proof). No gap.
- [x] SEO: facet combos noindex+canonical, rel=nofollow (shipped R1). No gap.
- Quality-watch items (thin-page floor, denylist/allowlist growth) remain open below.

## 2026-06-18 — Newegg-style faceted product search (godmode R1)

User ask: "for the already reviewed products, let's give it a Newegg-style organized
search tool." Catalog is 1,097 reviewed products / 192 categories / 570 brands /
$0.25–$30k — genuinely warrants faceting. Upgraded /reviews in place (not a duplicate
surface).
- [x] FEATURE: faceted search engine `worker/lib/product-search.js` (pure, testable):
      parseProductFilters (validate/clamp), buildProductWhere (parameterized WHERE with
      facet "exclude-self", LIKE-escaped keyword), price bands, rating options, sort map,
      reviewsHref serializer, isNarrowed. 37 unit tests.
- [x] FEATURE: /reviews (`worker/pages/reviews.js`) rebuilt as a left-rail faceted UI —
      keyword search + Category/Brand/Price/Rating facets with live counts (computed
      exclude-self), active-filter chips, sort row, result count, responsive (sidebar
      stacks on mobile). SSR + no-JS (GET form + plain links). Reuses the review cards +
      ItemList JSON-LD.
- [x] SEO: only the base + single-category listings are indexable; every further facet
      combo is noindex,follow (new `meta.noindex` in html.js layout) + canonicals up to the
      nearest indexable parent; all facet links rel=nofollow — standard defense against
      faceted-nav index bloat (else millions of thin URLs). D1 NULLS LAST + CASE-GROUP-BY
      verified against prod.
- [x] HIGH (regression caught + fixed pre-stay-live): first deploy 500'd every /reviews
      request — facetGroup destructured an option named `valueOf`, which collides with
      Object.prototype.valueOf so the destructuring default never applied and calling it
      threw. Renamed valueOf→keyOf; captured as a javascript learning. Verified live: base
      200 + 1,097 count + all facets; facet combos 200 + noindex + canonical to base.

## 2026-06-18 — Quality: marketplace-churn ("knockoff") brands ranked high

User report: a linen-shirt search surfaced legit ~$200 shirts but ALSO Amazon-native
junk (no-name "Chinese rip-off dump" sellers). Root-caused from prod D1: the
"best men's shirts for hot humid weather" run ranked **Coofandy ★2.5 at #3** (above
Abercrombie). The synth prompt was richly tuned for SOURCE credibility (who reviewed)
but had NO guidance on PRODUCT/BRAND quality, and nothing stopped a sub-3/5 editorial
score from ranking high.
- [x] HIGH: synth prompt now has a PRODUCT/BRAND QUALITY block — distrust
      marketplace-churn / rebadged-generic / dropship brands (no independent brand
      identity, no hands-on/expert coverage, promotional-only sources), never rank them
      above established brands, give them a low editorial rating (don't inherit gamed
      marketplace stars), and explicitly: cheapness is NOT the disqualifier (Uniqlo/
      Amazon Basics/Anker/Old Navy are fine). Plus a "RANK MUST TRACK QUALITY" rule.
      (worker/engine/prompts.js)
- [x] HIGH: deterministic backstop in validate.js `applyQualityGate` — two layers +
      renumber: (1) UNCONDITIONAL hard-drop of known churn brands via
      worker/lib/brand-quality.js `isChurnBrand` (denylist seeded with Coofandy +
      curated Amazon/SHEIN-family fast-fashion; apparel-focused so legit short-name
      electronics brands aren't false-positived; their gamed star ratings dodge the
      floor, hence unconditional); (2) editorial-rating floor raised 3.0 → 3.5 ("go
      aggressive" directive), dropping sub-floor picks while ≥3 stronger remain; null
      ratings + price never trigger a drop. Renumbers ranks WITHOUT re-sorting
      (preserves the synth's holistic intent-fit ordering). 20 unit tests in
      worker/engine/validate.test.js (wired into run-tests.mjs), all green.
- Verify post-deploy: re-run the apparel query, confirm no ★<3.5 / no-name pick survives.
- [x] HIGH: recall gap — photo-backup queries never surfaced Immich (THE leading
      self-hosted FOSS photo backup). Root cause: search COVERAGE — Immich was in 0/69
      sources; the planner never searched self-hosted/FOSS angles, and commercial "best
      app" listicles don't list community projects. Three-part fix, all deployed +
      verified (Immich now ranks #3 ★4 for "best photo backup software for android",
      was absent before):
      (1) parallel-engine.js DECOMPOSE_SYSTEM — planner must add a self-hosted/FOSS
          aspect for self-hostable categories;
      (2) prompts.js synth — include open-source/self-hosted options on merit despite
          no affiliate/retailer link (brand=project, productUrl=GitHub/official, price=
          0/null, note self-hosting in cons);
      (3) worker/lib/foss-leaders.js — curated category→leading-FOSS allowlist (inverse
          of the churn denylist); parallel-engine appends a deterministic by-name aspect
          ("Immich review self-hosted", …) so their evidence is actually fetched. This
          was the decisive lever — prompt-only got self-hosted angles searched but didn't
          reliably reach one specific project.
- [ ] LOW: knockoff floor (3.5) + synth variance can yield thin pages (a verification run
      collapsed to 1 product — engine produced 1 pre-gate, so NOT over-filtering, but
      watch for thin results; dial floor back to 3.0 if they become common).
- [ ] LOW: GOOGLE_CSE_ID env var (wrangler.toml) is dead since the /find CSE removal — drop
      on next wrangler.toml edit.

## 2026-06-17 — DIRECTION: pure-ML extraction synthesis engine (no LLM) — design done

User pivot: replace the generative-LLM synth with a purpose-built ML/EXTRACTION
engine ("pure ML, faster everything"). Rationale: extraction CANNOT fabricate (it
only emits spans that exist in sources) → "tell no lies" becomes a STRUCTURAL
property, not a behavior we police. Full design: `docs/ml-engine-design.md` (6-area
research workflow). Also corrected: the 7900 XTX idle power is SUNK (already on 24/7),
so cost was over-stated — AND the GPU isn't even needed in the path (CPU wins for
small encoder batches; reserve it only for an optional Layer-2 booster).

- [x] Phase 0 BUILT + PROVEN (~$0, local only, NOT deployed). New modules
      worker/engine/extract/{lexicon,gazetteer,engine,prose,index}.js +
      benchmarks/phase0-extract-bench.mjs. Result on all 6 trap fixtures:
      **trap leaks 0/6, ungrounded price/spec 0/0 (fabrication impossible by
      construction), 0-14ms** (vs ~40s LLM), legit-recall 1.0 on 5/6, legit #1 on
      5/6 (the 6th is a harness name-match artifact: "ConvertKit" vs gold "Kit
      (ConvertKit)"). Human read = genuinely honest, on-brand ("ignore hype words…
      they appeared only in affiliate sources"). THESIS CONFIRMED. Real remaining
      gaps are quality/attribution, NOT fabrication (see Phase 1). Not prod-ready.
- [ ] Phase 1 (the real quality work the proof surfaced — all "wrong-not-fabricated"):
      (1) [x] FIXED **aspect→product mis-attribution** [#1 risk, observed live]: a multi-
      product sentence ("V1 and Air75 are best… RK84 is great value") attaches as a
      pro to ALL three — fix: prefer single-product sentences, dedup a shared
      sentence to one product, abstain on comparative constructions. (2) rating
      calibration (two 5/5s; tune shrinkage/scale so thin evidence can't hit 5).
      (3) pro/con crispness + depth (clause-level not whole-sentence; expand VADER
      lexicon from data). (4) BUILD the eval harness: triple-level (entity,slot,
      value) Precision/Recall/F1 + nDCG/recall@K + ~30-50 hand-labeled REAL pages;
      gates price-attach ≥0.95, legit recall@5 ≥0.9, trap=1.0. Groundedness alone
      is now useless (0 by construction).
- [ ] Phase 1: NEW eval harness — groundedness alone is now useless (0 by
      construction). The REAL risks are WRONG-not-fabricated: aspect→product
      mis-attribution (#1), wrong-merge (RK84≠RK87 — hiding a product IS a lie),
      polarity flips, price mis-parse ("$50 off"→$50), mis-rank, cherry-pick/
      omission. Add triple-level (entity,slot,value) Precision/Recall/F1 + nDCG/
      recall@K + ~30-50 hand-labeled REAL pages. Gates: price-attach precision ≥0.95,
      legit recall@5 ≥0.9, trap-suppression =1.0. "Wrong-but-auditable beats
      confidently-fabricated" — every error traces to a source quote + a weight.
- [x] R1-R4 (godmode, local only): eval gate built (benchmarks/extract-eval.mjs) +
      attribution fixed (clause-level, single_attribution 0.46→0.94, dup 0.43→0) +
      rating calibrated (evidence cap, pct_rating5 0.26→0.05) + rank-by-rating. ALL
      7 gates green on fixtures (trap 0, ungrounded 0, recall 0.944, precision 0.944).
      REMAINING before prod: (a) con/pro DEPTH polish (avg_cons 0.36 — empty con
      sections; validate.js floor keeps products so not a dropper, but thin); (b)
      the REAL acceptance gate = ~30-50 hand-labeled REAL pages (synthetic fixtures
      overstate precision per the design) + gold "best-pick" labels for nDCG rank
      quality. Nothing deployed.
- [x] REAL-PAGE GATE RUN (benchmarks/real-page-bench.mjs, live gather x3, ~$0.13).
      VERDICT: extraction honesty is STRUCTURAL + holds on real data (ext_ungrounded
      0/0 on 55-96 real sources) — BUT hand-rolled candidate detection is NOT
      production-viable on real markdown even after R5 hardening: concatenated names
      ("Sony WH-1000XM4 Wireless Samsung"), spec/heading fragments as products
      ("Bluetooth 6", "Yes Weight 52g"), off-topic leakage; name-overlap with the
      LLM's clean picks only 3/10, 5/6, 2/10. This is the NER problem — regex is
      whack-a-mole. The fact/pro-con/ranking machinery is solid; CANDIDATE DETECTION
      needs ML (the design's Layer-2 GLiNER ONNX). KEY REFRAME: the prompt-fixed kimi
      ALSO scored 0 fabrication on real data with clean products — so honesty (the
      original driver) is ALREADY SOLVED by R1's prompt fix (shipped). Pure-ML is now
      a speed/cost/ownership choice, not a honesty necessity. AWAITING user fork:
      (A) build the GLiNER ML-NER candidate layer; (B) shelve pure-ML (LLM is honest
      enough now, synth ~$3/mo); (C) hybrid (extraction facts + ML/LLM for names only).
- [ ] Phase 2: ship Layer-1 as production synth behind a flag (A/B vs kimi; cut kimi
      to fallback). Phase 3 (cond.): fastText classifier replacing gemini-flash-lite.
      Phase 4 (cond., only if measured ABSA gap): GLiNER+DeBERTa ONNX booster on
      blackbox CPU, silent-degrade to Layer 1 — never a hard dependency.
- [ ] HONEST losses (accepted): prose fluency (mitigate via verbatim-quote framing
      → "actual quotes, not marketing" = brand asset); novel cross-source synthesis
      (which was ALSO the fabrication surface). Net positive for an honesty brand.

## 2026-06-17 — Honesty-benchmark audit (godmode: "tell no lies") + fixes

6-lens adversarial audit of the synth honesty bench (is it valid + sufficient to
GUARANTEE no-lies output?). Verdict: **sound-with-gaps** — the diagnosis is gold
(prompt mandates fabrication, confirmed across ALL models incl. opus), but the
honesty *ranking* isn't yet a trustworthy regression gate (judge scores unpersisted,
faithfulness contaminated by the mandate, schemaScore REWARDS fabrication, n=6 with
judge-spread ≈ the inter-model gap). The glm>kimi swap is directionally right (6/6,
prompt-INDEPENDENT signals: kimi drops legit products + fakes citations + mis-attached
the trap's affiliate URL + 2.6× slower) but NOT proven until a re-bench under the
fixed prompt. Keep the swap gated.

- [x] #1 HIGH (the core no-lies fix): synth prompt MANDATED fabrication — rating
      "(inferred if not explicit)", price "(best estimate, never null)", freshness
      on undated sources. Even opus fabricated a rating on 18/18 products. Fixed
      `worker/engine/prompts.js`: price now source-or-null; rating = honest editorial
      score (no false precision, null if thin); added NO-FABRICATION + CITATION-
      INTEGRITY + DATE-HONESTY rules. Downstream-safe (validate.js:92-93 + UI
      `!= null` guards + nullable D1 cols already handle it). [godmode R1]
- [x] #2 added a deterministic groundedness auto-metric to glm52-synth-bench.mjs
      (flag prices/specs numbers not in sources; null=grounded; tolerance for
      rounding) — a free, judge-independent regression gate. [R2]
- [x] #3 fixed bench `schemaScore` so it stops REWARDING fabrication (drop the
      "rating is a number" credit; reward honest null). [R2]
- [x] #4 RE-BENCHED under the fixed prompt (deterministic groundedness gate, no
      judges). RESULT — REVERSES THE SWAP. Fabrication collapsed for all models
      (opus ungrounded price/spec 0.69/0.57→0/0; kimi 0.64/0.81→0/0.29) — R1 works.
      BUT glm-5.2 STILL invents prices 53% of the time under "NEVER invent a price"
      (spot-checked: $299.99/$199.99/$249.99 on SSDs with no source prices). kimi
      obeys (0% ungrounded prices). **Decision: DO NOT swap — KEEP kimi-k2.6** (more
      honest on the clearest lie-metric under the corrected prompt, + cheaper; kimi's
      "2.6× slower" was variance — 25s here). opus is the honesty ceiling (0/0) at 8×
      cost. [godmode R3] — Full n≥20/≥5-judge re-bench still optional for the other
      axes (citations/omissions), but the numeric-fabrication signal is decisive. [R3]
- [ ] #5 add legit_recall (catches kimi dropping legit picks) + link_correctness
      (catches the trap-URL-on-legit-product mis-citation) auto-metrics. [deferred]
- [ ] #6 fixtures for untested lie-surfaces: comparative "X vs Y", discontinued/
      recalled product, location-with-no-address. [deferred]
- [ ] RESIDUAL (live no-lies monitoring): orchestrator.js:180 drops source `content`
      on persist → live pages can't be audited against sources. Persist
      content.slice(0,200) per source + add a groundedness check to run-eval.mjs so
      PRODUCTION (not just the bench) is monitored for fabrication. [deferred — HIGH]
- [ ] DOC cleanup: glm52-synth-bench-2026-06.md has contradictory judge counts
      (54 vs 24) + two consensus tables; persist judge scores to results/. [R2]
- [x] INSIGHT (model selection): honesty here is NOT predicted by raw intelligence
      (AA Index) OR generic instruction-following (AA IFBench — Claude clusters LOW
      ~55% there yet opus fabricated 0%). It IS predicted by FACTS-Grounding +
      hallucination/abstention (Vectara HHEM). Screen future synth models (and the
      local model) on grounding/abstention, not size/IFBench. [user hypothesis,
      refined + confirmed against our groundedness data: opus<kimi<glm by fabrication]
- [ ] ROADMAP (self-host synth on 7900 XTX to cut spend): `docs/local-synth-roadmap.md`.
      HONEST verdict: hardware GREEN, wiring GREEN (~15 lines, fallback exists), COST
      RED (synth is only ~$3/mo; idle GPU power ~$10/mo would cost MORE than it saves —
      never breaks even on cost). Real justification = ownership / no-rug-pull on the
      honesty-critical component, or 10× scale. Recommended model: Qwen3-30B-A3B (MoE,
      fits 24GB, fast) or Qwen3-14B (best distill base); avoid Phi-4 (refuses 19%),
      Llama-70B (won't fit). **Phase 0 (~$0): run a stock local model through the
      EXISTING groundedness gate — make-or-break before any training.** [deferred]

## 2026-06-17 — GLM-5.2 synth bench (empirical, real-task honesty)

Z.ai's GLM-5.2 (open-weights, AA Intelligence Index 51 vs kimi 43 — but coding-
weighted) benched against the real synthesis honesty harness. Full writeup:
`benchmarks/glm52-synth-bench-2026-06.md`. Spend ~$0.31 (24 honesty judges free).

- [x] DECISION (synth model swap): **REVERSED → KEEP kimi-k2.6, do NOT swap.** The
      2-scenario/6-scenario "glm wins" result ran under the fabrication-MANDATING
      prompt + same-family judges (scoring "who fabricates less flagrantly"). The
      re-bench under the FIXED prompt with a deterministic groundedness gate (see
      audit #4) shows glm-5.2 is the WORST at obeying "don't fabricate" (53% ungrounded
      prices vs kimi 0%). kimi's apparent latency/honesty disadvantages were prompt-
      and variance-artifacts. The real win was the prompt fix (R1), not a model swap.
- [ ] HIGH (honesty — engine prompt, higher-leverage than the model swap): the
      6-scenario bench's strict faithfulness judge found ALL synth models (incl.
      opus, 0.67) fabricate data the sources don't contain — **synthetic per-product
      numeric ratings** (4.x, rendered as authoritative stars), **invented prices**
      ("$179.95"), and **invented freshness/date metadata** ("within 12-month
      window") — because the synthesis schema MANDATES those fields. Fix the
      synthesis prompt (`worker/engine/prompts.js`): forbid invented prices,
      forbid fabricated numeric ratings (or mark them editorial-estimate, not
      measured), and forbid freshness assertions when sources are undated. Lifts
      EVERY config. (kimi additionally drops legit source-backed options — e.g.
      omitted NuPhy Air75 twice despite hands-on+community backing; glm kept it.)
- [x] Planner: glm-5.2 OFF matches gemini-2.5-flash's perfect BS-detection but at
      3× cost + 8× latency → KEEP gemini-2.5-flash. Reasoning ON face-plants (0.2
      acc, starved JSON) — confirms GLM must run reasoning-off for structured tasks.
- [x] Captured the GLM-5.2 reasoning gotcha (same class as kimi) + AA-index-is-
      coding-weighted caveat in the bench doc.

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
- [x] HIGH: /metrics never joins views↔affiliate clicks → no per-page CTR, the
      exact signal the re-research flywheel keys on (metrics.js:105-153).
- [x] MED(verified REAL): Static assets serve `cache-control: max-age=0,
      must-revalidate` (css/js/og.png) — add `public/_headers` with
      `max-age=31536000, immutable`. Repeat-visit speed + cost.
- [x] HIGH(constraint-protect, verified REAL): Budget governor split-brain —
      intake gates trust the racy KV `cost:` counter (research.js:109, chat.js:120)
      while the real ceiling uses D1 SUM; a burst can overspend MONTHLY_BUDGET_USD.
      Add a `budgetExhausted(env)=max(D1 spend, KV)` gate helper. Pair: move the
      failure-path incrementMonthlyCost INSIDE the idempotency latch (internal.js:106).

### QUICK WINS (S)
- [x] MED: Unify brand (TrueRank vs Chrisputer Labs) across titles/og:site_name/
      Organization schema — flagged by BOTH seo + ux agents (html.js:62,67 vs
      static "TrueRank"). Consistent entity = brand consolidation + trust.
- [x] MED: Add year token to dynamic research <title> ("(2026)") like static guides
      already do — CTR lift (research-page.js:1051).
- [x] MED: IndexNow-ping /best/ hubs (not just /research/) — plumbing exists
      (orchestrator.js:209, indexnow.js accepts arrays).
- [x] MED: "Price as of <date>, check current price" caption near CTAs — honesty +
      click-trust, reuses lastModifiedTs (research-page.js:357). Fits the ethos.
- [ ] MED: Email capture on home/hubs (backend fully built; research-page-only today).
- [x] MED: Amazon `ascsubtag` (slug+rank) on /api/go redirects → free EPC/earnings
      attribution per page via Associates report (affiliate.js:56-86).
- [x] HIGH: Raise engine READ_MIN_SCORE so hands-on expert reviews scoring 45
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
- [x] HIGH/M: Log unservable demand (surface-only) (failed/thin/zero-match queries) → content roadmap.
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
