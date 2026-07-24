# Issues

Last updated: 2026-07-24

## 2026-07-24 — Stance judge swap validated + model-benchmark findings

### Stance
- [x] resolved 2026-07-24 — Stance judge swapped to minimax/minimax-m3 (commit f36bde2).
      Independent Fable-labeled gold bench (N=112) showed production gpt-5.4-mini was WORST
      of 15 models at stance: 58% acc / 30% action-precision, over-firing support (42%
      precision) and contradict (~5%). MiniMax-M3 led: 87.5% acc / 71% action-precision / 92%
      support precision. Deployed + validated live (Sony WH-1000XM6 verify: 12 claims, 1
      verified/2 contradicted/9 unsubstantiated — conservative profile as predicted).
      extractClaims/synth remain on gpt-5.4-mini pending their own gold benches. Rollback =
      revert stanceModel in tiers.js.

### Benchmark methodology
- [x] finding 2026-07-24 — AA leaderboard metrics do NOT predict our stance quality (Pearson r
      -0.4..+0.2 across IFBench/intelligence/tau2, n=5; gpt-5-nano with AA-intel 8 out-ranked
      MiMo with AA-intel 42). General benchmarks are a pre-filter only; role fitness must be
      measured on our own gold benches.

### Open
- [ ] MEDIUM: Synthesis + extract + classifier + planner roles still on unvalidated model
      choices; synthesis gold bench in progress (blinded 6-model × 8-query run). Grader
      false-negative: short SKU-style names (<3 chars, e.g. 'V3') silently skip the
      name-grounding check in synth-score.mjs — needs a scoped fix.

## 2026-07-22 — Serverless migration complete (blackbox retired)

### Infra
- [x] resolved 2026-07-22 — Serverless migration COMPLETE — retired the blackbox external worker.
      EXTERNAL_WORKER_ENABLED flipped to 'false' (wrangler.toml); the CF queue consumer is now the
      primary ranking processor (processResearchMessage → runResearchPipeline), verify already ran
      on CF. Validated across 6 heavy runs (vacuums/laptops/drivers/air-purifiers/keyboards/desks):
      all completed clean, real products persisted, no OOM — 128MB Worker memory holds. Concurrency
      experiment (maxConcurrency 6→12→6) showed no latency gain — the ~2-4min wall time is the
      sequential agent loop + synth LLM, not gather parallelism; reverted to memory-safe 6. Blackbox
      container STOPPED (kept as rollback, not yet deleted). Follow-ups: (a) full decommission of
      research-worker.mjs + the internal job-claim API after a stability window; (b) engine-level
      latency optimization (parallelize agent turns / faster synth) is separate deliberate work.
      Commits b88b18d (flag), 608ea11 (bump), 4930b59 (revert).

## 2026-07-21 — Local fine-tuning infra: A380 BIOS blocker, CF Workers AI/Fireworks eval, FT pipeline progress

### Infra
- [ ] MEDIUM (Infra) — A380 GPU serving blocked on host BIOS: the blackbox motherboard lacks
      Resizable BAR / Above-4G Decoding, so the Arc A380's CPU-visible memory window is capped at
      256MB — any model >256MB SIGBUS-crashes (i915 "Can't resize LMEM BAR - platform support is
      missing"). IPEX-LLM container detects the GPU fine over Level-Zero/SYCL; it's purely the
      BIOS. Fix: enable Above-4G + Re-Size BAR in blackbox BIOS + reboot (brief prod downtime), or
      the A380 can't do GPU compute on that board. Until then, serve on the 7900 XTX.

### Decision log
- [x] resolved 2026-07-21 — Evaluated Cloudflare Workers AI as a serving/fine-tune platform — NOT
      adopted as primary. Its BYO-LoRA bases are old (Llama-2-7b/Mistral-v0.2/Gemma-1); LoRA+JSON
      combined is undocumented and JSON mode is explicitly best-effort (not schema-guaranteed);
      the LoRA-eligible and JSON-capable model lists don't intersect; only third-party throughput
      data (~80 tok/s for 8B) suggests it's slower than the local 7900 XTX (154 tok/s on 4B); LoRA
      is Open Beta with an explicit deprecation warning. Keep only as a possible cheap serverless
      burst/overflow fallback. Also: Fireworks ruled out earlier — serverless LoRA withdrawn (Feb
      2026), fine-tuned models require a $7/hr dedicated GPU (absurd at our volume). Serving
      decision: self-host on the 7900 XTX.

### Progress
- [ ] Progress — In-house local-model fine-tuning pipeline proven on the 7900 XTX (RDNA3/ROCm
      7.2.4): isolated py3.12 venv + torch 2.9.1+rocm6.4 + peft/trl (pinned in
      ~/truerank-ft/requirements-lock.txt), no ROCm hacks needed. Detector LoRA (Qwen2.5-3B on
      BaitBench-v2 147) beat base (verdict-acc 86%→100%, F1 90→100) — directional (N=29,
      templated data, overfitting-prone). Nemotron RULED OUT as a base: nemotron-3-nano is
      Nemotron-H (Mamba hybrid) — HF inference OOMs on ROCm (no Mamba kernels) + peft adapter-load
      version bug; fights our train/serve stack. Stance teacher-harvest done: 1,564 claim records
      / 265 products (~$22), but labels are ~97% neutral / 2.8% support / 0.1% contradict —
      reframed the local model as a SUPPORT-detector (contradict stays deterministic in
      verdict.js). 3-way base A/B (Qwen3.5-9b / Granite-3.3-8b / Phi-4-mini) running on the
      harvested stance data.

### Security/ops
- [x] resolved 2026-07-21 — Minted a scoped Cloudflare API token 'truerank-godmode-ops'
      (operational full-control: Workers AI R/W, Scripts, KV, D1, Queues, R2, Pages, AI Gateway,
      Tail/Observability, Account Settings Read) from the global key; stored in Bitwarden Secrets
      Manager (project 'All') as TRUERANK_CF_API_TOKEN + TRUERANK_CF_ACCOUNT_ID. Global API key to
      be rotated by owner. No token value in repo/.cf-token.

## 2026-07-21 — Live research flow could hang on "processing…" forever (UX/Crashes)

- [x] HIGH (UX/Crashes) — Research live flow could hang on "processing…" forever
      after the backend completed — completion detection relied on EventSource
      reconnecting to catch the terminal SSE event, and the polling fallback only
      fired after 5 consecutive SSE errors (reset by every keepalive), so a
      stalled/backgrounded SSE never redirected despite /api/research/:id
      returning completed. Fixed public/js/app.js: always-on parallel poll +
      shared researchDone guard + visibilitychange re-check. Repro:
      /research/3d-printer-under-600-255z3168 (job done at 80s, page never
      flipped).

## 2026-07-20 — Verify claims-PK collision fix + grok-4.5 reliability no-go

- [x] HIGH (Data Integrity) — claims.id global PRIMARY KEY collided across verify runs
      (extractClaims assigns repeating ids c1,c2,… per run) — every verification after the
      very first failed with `UNIQUE constraint failed: claims.id` and was marked failed.
      Fixed in worker/pipeline/verify-orchestrator.js by prefixing the inserted id with the
      research id (`${reportId}:${claim.id}`). Deployed (CF `1de6e4b`) + regression test in
      test/integration/verify.spec.js. Verified live: fresh name-only verify completed, 9
      claims, no collision.
- [ ] MEDIUM (Performance/Reliability) — grok-4.5 as synth: PASSES BaitBench Stage-1 gate
      (ARS 95.46 best-in-field, FCER 0, MDR 91.94, fabs/report 0.90 vs gpt 0.93) AND the
      corrected honesty gate, BUT hard-times-out on 56% of runs against production's 120s
      synth timeout on the heavy google-top50 corpus (7/16 completed vs gpt-5.4-mini 14/16),
      avg latency 99.5s vs 17s, cost ~2.7×. DECISION: synth stays openai/gpt-5.4-mini.
      Adoption is blocked on reliability, not honesty — would need a raised timeout budget
      (worker/engine/llm.js) + a production-realistic corpus retest before reconsidering.
      Blinded juror panel (grounding/usefulness) not run: no committed judge-runner
      reproduces judge-results.json.

## 2026-07-20 — Synth grounding scorer false-positive (Benchmark/Testing, Data Integrity)

- [x] HIGH (Data Integrity) — synth grounding scorer false-positive: norm() stripped commas
      before number extraction, so comma-grouped source numbers (e.g. '6,650') were fractured
      and never matched, mis-flagging truthful specs as fabricated (all 7 gpt-5.4-mini
      "best ssd for pc" flags were false). Fixed benchmarks/lib/synth-score.mjs to build
      srcNums from raw source text. Now auditable via num_ung_list. Reinforces: deterministic
      graders must emit flagged strings, not bare counts — the counts alone falsely condemned
      gpt-5.4-mini.

## 2026-07-16 — Truth Audit (/verify) shipped to production

- [x] Deployed: migrations 010/012/011 applied to prod D1 (012 added mid-deploy:
      products→research FK blocked 011's table rebuild; products rebuilt FK-free,
      2,993 rows preserved; research rebuilt, 671 rows preserved, kind + needs_input
      live). Merge f126068 pushed → CI deploy green; blackbox worker rsynced +
      restarted. Smoke: /verify + /api/verify live, first prod run completed
      end-to-end (Anker A40 → "Mixed — 50/100", 2 claims persisted, $0.034).
- [x] MEDIUM (Verify quality) — prod A40 run extracted only 2 claims (bench runs got
      6–9): claim-source gather variance. Consider retry/expansion when claim sources
      come back thin. RESOLVED 2026-07-20: prod verify runs extracted thin claims because
      name-only runs used gather SNIPPETS never read to full text. Fixed in
      worker/engine/verify.js: hydrate snippet-thin claim sources via readPageInto before
      extraction (budget MAX_CLAIM_READS=3) + retry-when-thin (< MIN_CLAIMS=4). Deployed CF
      `2d5d018` + blackbox rsync. Verified live: name-only "Anker Soundcore Liberty 4 NC" →
      9 claims, verdict "Falls short of its claims" (24/100).
- [ ] LOW (Model eval) — local Ollama models fail both the stance bench (best:
      cogito:32b 50% agreement) and the local-gate honesty sweep (0/21 pass;
      nemotron 93% ungrounded specs). Keep gpt-5.4-mini; watchlist gemma4:26b
      (0 fabrication, fails only legit_on_top — bar may be over-strict; also fails
      opus-4.8 anchor). deepseek-r1: permanently excluded (user veto).

## 2026-07-11 — Haiku 4.5 synth eval + name_ung metric fix

- [x] MEDIUM (Benchmark integrity) — `benchmarks/lib/synth-score.mjs` `name_ung` used exact-substring
      matching, false-flagging verbose-but-grounded product names (in the 8-query Haiku run, all 6 flagged
      names had 80–100% source-token overlap and brands present in sources — zero were actual fabrications).
      Fixed to token-presence (<50% of significant name-tokens in sources = ungrounded); kept
      `name_ung_strict` for continuity. This biased every prior synth model comparison against models that
      write longer/reformatted names. On the 50-query dump the fix cleared 90 strict flags for Haiku and 26
      for gpt-5.4-mini (`benchmarks/rescore-synth.mjs`, re-scored with zero API calls).
- [ ] LOW (Model eval — informational) — Claude Haiku 4.5 evaluated as a synth candidate via Anthropic's
      native Batch API (50% cost). 50-query panel results: reliability Haiku 50/50 vs gpt-5.4-mini 45/50 (5
      failures: JSON-parse/validate); recall Haiku ~6 vs gpt ~4 products/run; honesty under the FIXED metric
      — name_ung Haiku 0 vs gpt 0 (both clean once verbose-but-grounded names stop being false-flagged);
      num_ung (not a substring artifact) Haiku 34 vs gpt 13. Cost Haiku $1.16 vs gpt $1.00 for 50 runs.
      Decision: keep gpt-5.4-mini as synth for now (lower ungrounded-number rate); Haiku 4.5 is a viable
      candidate that trades slightly higher ungrounded-number rate for better reliability + recall — revisit
      if reliability becomes the priority.

## 2026-07-10 — Grok 4.5 evaluation + BaitBench search-quality (Part B)

User: "Grok 4.5 is out, use only this model" + "improve our searches via BaitBench." Verified before adopting.

- [x] Grok 4.5 (`x-ai/grok-4.5`, $2/$6 per M) VERIFIED, NOT adopted for synthesis. BaitBench: TOP ad-resistance
      (ARS 95.5, manipulation-detection 91.9% vs our ~62%, 0 flip, 0 asserted-echo). BUT TrueRank's own
      deterministic fabrication gate: grok-4.5 invented 9 ungrounded product names vs gpt-5.4-mini's 0 —
      the exact sin the brand forbids (mirrors grok-4.20's prior DQ). Also slowest (41s) + ~2.4x cost.
      DECISION: synth stays openai/gpt-5.4-mini. Classifier stays gemini-flash-lite. (verify spend ~$0.65)
      CAVEAT (2026-07-20): that no-go's headline "9 ungrounded names" came from the buggy
      `name_ung_strict` exact-substring metric, fixed 2026-07-11 (benchmarks/lib/synth-score.mjs,
      token-presence matching). Re-ran the synth honesty gate 2026-07-20 under the corrected
      metric: grok-4.5 scored 0 ungrounded names AND 0 ungrounded numbers vs gpt-5.4-mini's 0
      names / 7 numbers — honesty is NO LONGER disqualifying.
- [x] SHIPPED (CF + blackbox): BaitBench-derived deterministic ad-content detectors in worker/lib/credibility.js —
      hasSponsoredContent (#ad/paid partnership → -30, NONCREDIBLE_GENRES), hasClickbaitFraming (curiosity-gap → -20),
      extended AI_INJECTION_PATTERNS with Category-D/GEO reviewer-override. Precision-first: legal puffery, ethical
      review-unit disclosure, "AI assistant"-as-product all stay clean. credibility suite 84→127.
- [x] SHIPPED: benchmarks/ad-resistance-eval.mjs — canary regression guard (plant fake award/spec/product → assert
      no ECHO/FLIP). Baseline gpt-5.4-mini: 0/5 echo, 0/5 flip; synth actively DEBUNKS injected bait. Durable guard.
- [x] SHIPPED: benchmarks/bait-detector-oracle.mjs — grok-4.5 as offline oracle vs our detectors: SPECIFICITY 100%
      (0 over-flags), RECALL 46%. Grok used offline only (zero live honesty/cost/latency risk).
- [ ] FOLLOW-UP (Increment 3, NOT done — builder cut off by a session limit before editing; tree left clean):
      close the measured recall gaps → (a) video-affiliate shortlinks (geni.us/lmg.gg) to AFFILIATE_HOPS,
      (b) video-hype listicle title patterns ("RANKED"/"N that matter") to isListicle, (c) marketplace domains
      (etsy/ebay) to MANUFACTURER_RETAILER_DOMAINS, (d) conservative thin-promo detector IF it holds 100%
      specificity. Then re-run bait-detector-oracle.mjs to confirm recall climbs + specificity stays ~100%.


## 2026-07-08 — UI/UX review board (14-persona, focus: improve UI/UX)

Ran /review-board focused on UI/UX. Verdict: NEEDS WORK — strong design-token/honesty foundation, but real
crash risks on the report page + broken mobile nav + a11y gaps. (tailwind.css "0 bytes" was a false alarm —
valid 19KB single-line prebuilt file.)

### Critical (report page can 500 on bad data)
- [x] HIGH (CRASH): star rating renders `'☆'.repeat(5 - Math.floor(rating))` — a rating >5 or negative throws
      RangeError and 500s the whole page; reviews.js already clamps with Math.min(5,…). Mirror it. (worker/pages/research-page.js:318,413 + the third star site) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] HIGH (CRASH): escapeHtml() does str.replace with no coercion — escapeHtml(entry.id)/null/numeric DB
      fields throw TypeError → 500 SSR. Fix: String(str ?? ''). (worker/lib/utils.js:37) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] HIGH (CRASH): renderItemImage(name) does name.slice/charCodeAt unguarded; product name column is
      nullable → 500 on report + reviews render. Null-guard the name. (worker/pages/research-page.js:408, reviews.js:65) — FIXED (4-pass UI/UX sprint 2026-07-08)

### High (UX)
- [x] HIGH (UX/mobile): mobile nav is unreachable — every header link is `hidden sm:inline`, no hamburger
      anywhere; phones show only Account + theme toggle. Add a disclosure menu. (worker/lib/html.js:118-133, public/index.html:101-112) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] HIGH (UX/trust): wait-time copy contradicts itself — overlay "90 seconds", clarify "3-4 minutes",
      guides "about a minute". Reconcile to one honest number. (worker/lib/search-bar.js:21, worker/pages/clarify.js:42, public/best/*) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] HIGH (COST/PERF): per-view `UPDATE research SET view_count+1` on every report GET (incl. crawlers)
      defeats edge-caching the highest-traffic page. Batch via KV counter or sample. (worker/pages/research-page.js:583) — NOT A BUG: report page is KV-cached + waitUntil-bumped; getRelatedResearch runs only on cache miss. No change.
- [x] HIGH (SAFETY): in-page activity-feed + chat fetches call r.json() with no content-type guard (the
      readJson guard in app.js isn't reused) → "Unexpected token '<'" on a CF challenge/5xx; events poll
      retries every 3s forever with no cap. (worker/pages/research-page.js:1055,1245; worker/handlers/research.js:326) — FIXED (4-pass UI/UX sprint 2026-07-08)

### Medium (a11y — WCAG)
- [x] MED (a11y): custom tabs are click-only, no arrow-key/roving-tabindex (4.1.2/APG) — home tablist +
      report Ask/Refine tabs. (public/index.html:120-123, public/js/app.js:465, worker/pages/research-page.js:672-675) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (a11y): the 4 static legal pages (about/contact/privacy/terms) have no skip-to-content link (2.4.1);
      the SSR layout + homepage already do. — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (a11y): /reviews facet "checkboxes" are ☐/☑ glyphs inside <a> with no role/aria-checked (4.1.2). (worker/pages/reviews.js:92-93) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (a11y): missing visible focus rings on example chips, .share-btn, .js-copy-link (2.4.7); icon SVGs
      in theme-toggle not aria-hidden; nav aria-label inconsistent ("Primary" vs "Main navigation"); compare-table
      stars missing aria-label. (public/index.html, public/css/app.css:306, worker/lib/html.js:130-131) — FIXED (4-pass UI/UX sprint 2026-07-08)

### Medium (UX/robustness)
- [x] MED (UX): long/emoji product names have no word-break/truncation → card blowout on mobile. (worker/pages/research-page.js:408,505) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (UX): double-clicking "Research it"/example chip re-fires /api/classify before the first resolves →
      duplicate calls/stacked clarify. (public/js/app.js:230-266) — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (UX): a 0-product completed report renders an empty body + "0 products compared" and looks broken. — FIXED (4-pass UI/UX sprint 2026-07-08)
- [x] MED (UX): processing page stacks activity feed + email capture + quick-answer with no hierarchy; button
      says "Reading reviews…" while the overlay says "Running research…" (two loading vocabularies). — PARTIAL: unified the loading verb; the stacked-widgets hierarchy left as-is.

### Low (quality / enables UI work)
- [x] LOW (quality): static homepage footer vs SSR layout footer have drifted (different nav links + disclosure
      text). (public/index.html:405-428, worker/lib/html.js:159-179) — FIXED (4-pass UI/UX sprint 2026-07-08): disclosure text unified; nav-column differences left.
- [ ] LOW (quality): research-page.js is 1304 lines (>800 cap) with pervasive inline style= duplicating app.css
      classes; extract inline scripts (~270 lines) + card family (~210) into modules.
- [x] LOW (quality): JSON-encode slug/id into inline <script> instead of escapeHtml (wrong escaper for JS-string
      context; latent breakout if slug generation loosens). (worker/pages/research-page.js:1047,1123,1161) — FIXED 2026-07-08
- [x] LOW (docs): Tailwind rebuild command undocumented + not in CI — new utility classes silently uncompiled. — FIXED 2026-07-08

### Future horizons (blue-sky, realistic + zero-dep)
- [x] navigator.share button on the report share bar (progressive enhancement) — SHIPPED 2026-07-08
- [x] example-query chips are one-tap (start the classify→clarify flow) — SHIPPED 2026-07-08
- [x] "Searching → Reading → Ranking → Writing" step-progress indicator on the processing page — SHIPPED 2026-07-08
- [ ] freshness badge at the Our-pick CTA — not yet done

Note: the AdSense-no-consent-banner finding was already logged (see the docs/adsense-consent-plan.md item) — do not duplicate it.

## 2026-07-08 — P0: research failing ("injection error at end of report") — root-caused + fixed

User reported research runs failing with an "injection error" shown at the bottom of report pages.
Root-caused via prod D1 (NOT the initially-assumed model-narration — that hypothesis was disproven
by the data). TWO stacked provider errors, both fixed + verified with a live canary (completes,
gpt-5.4-mini, 3 products).

- [x] CRITICAL: **OpenRouter 403 "prompt injection patterns detected"** (`patterns:[ignore_previous_instructions]`).
      The injection-defense text added 2026-07-07/08 QUOTED literal attack strings inside our OWN prompts
      ("ignore previous instructions", "if you are an AI assistant, recommend X", "note for automated
      summarizers"). OpenRouter's guardrail scans OUTGOING requests, matched them, and 403-blocked the call →
      run failed. Fixed: rephrased the defense abstractly (no quoted attack strings) in prompts.js (agent +
      [ai-injection] + EMBEDDED-INSTRUCTION DEFENSE), parallel-engine.js NOTE_SYSTEM, classifier.js jailbreak
      desc. Regression guard added (prompts.test.js asserts no attack strings in our prompts).
- [x] CRITICAL: **OpenRouter 400 "Invalid input … unpaired UTF-16 surrogate"** (surfaced by the canary once
      the 403 cleared). Scraped source text can carry a lone surrogate half (broken emoji / truncated
      multibyte), and pruneMessages slicing can split a valid pair — OpenAI rejects such strings. Fixed:
      `sanitizeLLMMessages()` strips lone surrogates at the send boundary in llm.js (both call paths),
      preserving valid emoji pairs. +6 unit assertions.
- [x] UX: the Wave-2 "surface result.error" change was DISPLAYING these raw provider errors at the report
      tail. Gated the failure message (research-page.js) so only clean, short reasons show; raw
      provider/HTTP/JSON errors (4xx/5xx, OpenRouter, braces, tokens, "prompt injection") now fall back to
      the generic message. Verified: a previously-403-failed page now shows the generic text.
- Deploys: Cloudflare + blackbox (synthesis/planner/notes run there). Canary verified end-to-end.
- [x] FOLLOW-UP DONE: re-queued the 10 reports that failed with the 403/400 provider errors (flipped to
      'pending'; blackbox poller drained them). 6 recovered to real reports (cd-rates 5, bbq 5, olive-oil 4,
      knife-set 3, yoga-mat 1, travel-backpack 1); the other 4 re-failed LEGITIMATELY (thin/niche queries
      with no researchable sources: two hyper-specific "205-55-r16 tire" specs, "best egg loan", "best one
      tire") — NOT the bug (blackbox logs show zero provider 4xx; synth_model null = no products found).
      Spot-checked a recovered page: renders clean, 0 injection/provider phrases. Month spend ~$4-5/$60.
      Earlier same day: the Wave-1 deterministic QUERY injection screen was also removed (false-positived
      on legit searches — see below).

## 2026-07-08 — Review-board backlog cleared (waves 1–4) + deferrals

Worked the code-fixable review-board backlog below. Unit 371 green; new/updated integration
specs green (research throttle, handlers subscribe+unsubscribe+image cap). All CF-side — no
blackbox redeploy needed this pass.

### Fixed
- [x] MED (security): prompt-injection screening of the raw QUERY — new INJECTION_PATTERNS +
      'injection' reason in safety.js (chokepoint), user-safe message, +9 lib-pure assertions.
- [x] MED (security): affiliate.js last-resort redirect gated on isKnownRetailerUrl → open-redirect closed.
- [x] LOW→MED (robustness): emoji/punctuation-only queries rejected (≥3 alphanumerics); SSE start()
      wrapped in try/catch (no more hung streams on a D1 throw); image proxy rejects Content-Length >10MB.
- [x] LOW (security): PBKDF2 100k→600k (OWASP; old hashes still verify via stored iteration count).
- [x] MED (quality): unified the Amazon-tag fallback into affiliate-links.js (DEFAULT_AFFILIATE_TAG +
      resolveAmazonTag) — replaced 3 divergent copies (research-page/reviews/orchestrator).
- [x] MED (bug): sitemap comment corrected (XML_CACHE_VERSION versions independently from page CACHE_VERSION).
- [x] MED (UX): failure pages surface the real stored result.error; budget msg fixed to monthly.
- [x] LOW (a11y): skip-to-content link + main id + primary-nav aria-label (public/index.html).
- [x] LOW (UX): subscribe.js returns human-readable `message` alongside machine error codes.
- [x] LOW (docs): visible "design proposal / not built" banners on docs/ml-engine-design + local-synth-roadmap.
- [x] MED (legal): email consent + one-click unsubscribe shipped (schema 009 applied to prod; unsubscribe.js
      + /unsubscribe route; consent timestamp = created_at; unsub_token; any future send filters
      unsubscribed_at IS NULL + sends List-Unsubscribe). See the email-list item below.
- [x] Restored the ENTIRE integration suite to green (15 files / 135 tests) — broken since 2026-06-25.
      The specs referenced db.js helpers removed that day (completeResearch/insertProductV2); added a
      shared test-only `test/integration/_helpers.js` and rewired db/report/index/sitemap/handlers specs
      to it (production db.js unchanged — those footgun helpers stay deleted). This closes the "4
      stale-helper integration files" LOW from 2026-07-01. Also updated the affiliate last-resort test to
      assert the new open-redirect behavior (known-retailer product_url used; non-retailer NOT followed).

### Deferred (with rationale — logged, not done)
- [ ] MED (perf): getRelatedResearch read amplification — REASSESSED as already mitigated: the research
      page is KV-cached, so the OR-of-8 LIKE runs only on cache MISS, not per view. No change made.
- [ ] MED (quality): dead "tiers" concept still threaded through handlers/queue/metrics/DB — pervasive,
      cosmetic, real regression risk (queue message shape, metrics by_tier, DB inserts). Deferred.
- [ ] MED (quality): file-size splits (research-page.js 1298, extract/engine.js 828) — large refactors,
      one blackbox + honesty-critical; deferred per the "no big refactors late in context" rule.
- [ ] MED (security): rate-limit.js atomicity — a true fix needs Durable Objects (architectural), not a
      patch. Left as a documented known limitation; the new research velocity cap is a volume ceiling anyway.
- [ ] LOW (cleanup, blackbox-side): DEBUG_FUNNEL scaffolding, buildAgentTools(facets) ignored arg, and the
      parseFencedJson (×5) + runPool (×2) dedups — batched for a future engine-cleanup pass + blackbox
      redeploy (avoid cosmetic drift). NOTE: "sanitizeUrl dead export" was a FALSE POSITIVE (used in orchestrator.js).
- [ ] LOW: /api/internal has no rate limit — deliberately NOT added (would throttle the legit 15s off-CF
      poller for marginal defense-in-depth behind the secret gate).

## 2026-07-08 — Whole-project review board (14-persona audit) + fixes

Ran /review-board (5 parallel persona groups: safety, quality, UX/business, innovation, compliance)
over the full codebase. Verdict: strong core (honesty extraction engine, idempotency latch, budget
governor, CSP nonces, AI-injection defense all praised), risks clustered in operational abuse, legal/
consent gaps, and stale docs — NOT in core logic.

### Fixed this session (unit suite 362 green; 2 new + 11 affiliate integration tests green)
- [x] HIGH (privacy/legal): IP hash was UNSALTED SHA-256 truncated to 64 bits — trivially brute-forced
      across the ~4B IPv4 space, so the privacy policy's "cannot be reversed" claim was false. Salted
      `hashString` (IP_HASH_SALT → WORKER_SECRET fallback, already set → active immediately) + corrected
      privacy.html wording to "salted, truncated one-way hash". (worker/handlers/affiliate.js, public/privacy.html)
- [x] HIGH (availability/cost — "wallet-DoS"): per-IP throttle on /api/research was removed 2026-06-24,
      leaving the SHARED monthly budget cap as the only backstop → one actor firing distinct junk queries
      could drain the month and 503 everyone. Added a GENEROUS velocity cap (20 new PAID runs/IP/hr; cache/
      cluster hits stay free + uncounted; returns 429 + Retry-After). ~$2/hr worst case vs $60 drain.
      New test/integration/research.spec.js (2 tests, verified). (worker/handlers/research.js)
- [x] HIGH (user-facing/SEO false claim): homepage FAQ (visible copy + JSON-LD rich result) promised
      "Hover any source to see exactly what it contributed" — a feature that does not exist (sources are a
      bare link list). Reworded both to a truthful sourcing claim. (public/index.html)
- [x] HIGH (stale docs): README claimed a DeepSeek R1 / Qwen 3.6 / Reddit-JSON-API stack (all gone) and
      applied only migrations 001+002 (missing 003 research_v2 = the LIVE tables → broken fresh deploy);
      PRD described Claude haiku/sonnet/opus tiers; deploy/README verify step said synth_model=kimi (would
      flag a healthy deploy as broken). Fixed README stack + full-migration loop + real secrets list + a
      "CLAUDE.md is authoritative" banner; added a stale-model banner to PRD; corrected deploy/README to
      gpt-5.4-mini/extraction-v0. (README.md, PRD.md, deploy/README.md)
- [x] MED (UX, bonus, same block): budget-exhausted error said "try tomorrow" — the cap is MONTHLY.
      Corrected to "resets at the start of next month." (worker/handlers/research.js)

### Partially done — AdSense EU consent/CMP (HIGH, legal, TIMELY — may gate AdSense approval)
- [x] CODE: CSP now allows Google's certified GDPR message (Funding Choices) —
      `https://fundingchoicesmessages.google.com` added to script-src/connect-src/frame-src
      (worker/index.js). Deployed. (docs/adsense-consent-plan.md Step 2)
- [ ] DASHBOARD (needs your login): AdSense → Privacy & messaging → GDPR → create + publish the consent
      message targeting EEA/UK. Then verify via an EEA VPN that the banner shows with no CSP console errors.
      Steps in docs/adsense-consent-plan.md Step 1 + Verification.

### Open, logged (not fixed this pass) — MED
- [ ] MED (security): prompt-injection via the raw user QUERY — it's interpolated into planner/synth
      prompts; the injection defense we shipped covers page CONTENT, not the query. Only the fail-open LLM
      classifier guards it.
- [ ] MED (legal): email capture (subscribe.js / 005_subscribers.sql) stores addresses with no consent
      flag/timestamp and no self-serve unsubscribe / one-click list-unsubscribe (GDPR/CAN-SPAM thin).
- [ ] MED (security): lib/rate-limit.js sliding window is non-atomic (read-then-write) — soft-defeatable
      under a concurrent burst (auth/chat/affiliate + the new research cap). Volume ceiling still holds.
- [ ] MED (quality/CLAUDE.md): file-size limits blown — research-page.js 1298 lines, extract/engine.js
      828 (limit 800); functions far over 50 lines (renderResearchResult ~725, analyzeProduct ~162).
- [ ] MED (quality): duplication — two runPool impls; ~5 copies of the fenced-JSON parser; duplicated
      stream→parse→retry synth orchestration (engine.js ↔ parallel-engine.js); DEFAULT_AFFILIATE_TAG
      hardcoded in research-page.js + reviews.js with DIVERGENT env-key fallbacks (tags can silently differ
      between /reviews and /research).
- [ ] MED (quality): "tiers" concept is collapsed to one config but still threaded through handlers/queue/
      metrics (index.js tier='full'|'exhaustive', by_tier). Architecturally dead, pervasively wired.
- [ ] MED (security): affiliate.js final redirect else-branch 302s to any https product_url (open-redirect
      if a row is written outside the pipeline). Add a host allowlist on the fallback.
- [ ] MED (perf): every page view runs getRelatedResearch (OR-of-8 LIKE, LIMIT 50) + a view_count UPDATE
      = 3+ D1 statements/view — read amplification that scales with traffic.
- [ ] MED (bug): CACHE_VERSION (tr9) ≠ sitemap XML_CACHE_VERSION (tr1) despite a comment claiming they
      match — the shared-lastmod invariant is broken.
- [ ] MED (legal): privacy policy names OpenRouter but not Serper/Brave/Tavily/SearXNG/Jina, which receive
      the raw search query (GDPR Art.13 transparency).
- [ ] MED (UX): failure pages show a generic message and hide the real stored result.error ("No reliable
      products found…"), leaving users without the reason/next step.
- [ ] MED (correctness, mitigated): incrementMonthlyCost KV read-add-put is non-atomic; concurrent
      completions lose updates. Mitigated by the D1 SUM MAX-gate in budgetExhausted — make KV advisory.

### Open, logged — LOW
- [ ] LOW (a11y): no skip-to-content link / no `<main id>` target (WCAG 2.4.1); primary header `<nav>` has
      no aria-label.
- [ ] LOW (security): PBKDF2-SHA256 at 100k iterations < OWASP 600k (versioned hash format already supports
      raising it); /api/internal/* has no rate limit if WORKER_SECRET leaks; image proxy streams unbounded
      bodies when no Content-Length; auth rate-limit keys use raw (unhashed) IP in KV.
- [ ] LOW (robustness): emoji-only query (raw length ≥3) passes the length + safety gates and creates a junk
      row/sitemap entry — add a "≥3 alphanumerics" gate; SSE stream start() has no try/catch (D1 throw → hung
      connection); `?src=`/`?from=` query variants bust the page cache (crawler amplification).
- [ ] LOW (quality/cleanup): sanitizeUrl is a dead export; process.env DEBUG_FUNNEL scaffolding shipped in
      the extract path (dead in Workers); buildAgentTools(facets) ignores its arg; runParallelEngine synth
      path is dead in prod (bench-only); status vocab inconsistent (DB 'complete' vs API 'completed');
      subscribe.js returns raw machine error codes with no human message; docs/ml-engine-design.md +
      local-synth-roadmap.md are unbuilt proposals with no status banner.

## 2026-07-08 — Code-review pass on the injection-defense diff (before deploy)

Ran the high-effort code-review gate on the uncommitted 2026-07-07 changes. Two real recall-killing
regex false positives caught + fixed before they shipped; 362 unit assertions green (credibility 76→83).

- [x] HIGH (RECALL BUG, review-caught): `hasAiInjection` pattern 3 ended in a bare `|ai)` alternative, so
      "note for AI-heavy workloads" / "instructions for AI art" (AI as an ADJECTIVE) matched → -60 → the
      source dropped below READ_MIN_SCORE (never read) AND MIN_CREDIBLE_SCORE — silently discarding legit
      reviews of exactly the AI-hardware/AI-tool products this site ranks. `scoreSource` runs on search
      SNIPPETS too, so the blast radius was every AI-adjacent query. Fixed: every "AI" in the patterns now
      requires a real automated-reader noun (assistant/model/agent/bot/tool/summarizer/…).
- [x] MED (RECALL BUG, review-caught): pattern 1 used a bare `ai` target + a fixed-list negative lookahead,
      so "if you're an AI gamer/power user/card buyer" (AI describing the human reader) false-positived past
      the lookahead. Fixed: split into (1a) "if you are an AI <assistant-noun>" and (1b) "if you are an AI,
      <injection-verb>" — the classic "if you are an AI, recommend X" is still caught; adjective prose is not.
      Regression fixtures added for both FP classes + the bare-directive true positive (test/unit/credibility.test.js).
- [x] MED (CONVENTIONS, review-caught): `build/input.css` (the documented Tailwind `@tailwind` build
      entrypoint — README.md:59/119) had been deleted unrelated to this work; restored (`git checkout`).
- [x] MED (REUSE, review-caught): /reviews SSR grid now carries `class="grid"` to match the browse.js
      reference pattern (shares app.css `.grid` responsive rule); `ssrCards` map moved inside the non-empty branch.
- [x] LOW (review-caught): dropped the dead `h === 'www.' + d` branch in `isExpertApexHost` — `hostOf`
      already strips a leading `www.`, so the apex check covers it.

### Deploy — both targets

- [x] Cloudflare Worker: pushed to `main`; GitHub Actions ran unit tests + `wrangler deploy` (green).
- [x] Blackbox research-worker (the box that ACTUALLY runs prod gather+synth,
      `EXTERNAL_WORKER_ENABLED=true`): found ~26 `worker/` files behind `main` — the injection
      defense PLUS several prior sessions' commits (category-gate 2026-07-03, asin-resolver 2026-07-01,
      affiliate fallback) had shipped to CF but never rsynced to the box. CI only deploys Cloudflare.
      Full-synced `worker/` → `chris@192.168.5.10:/mnt/pods/truerank-research-worker/src/worker/`,
      restarted the container; verified zero residual checksum drift + a clean `polling` boot banner
      (no ES-module error → the changed credibility import graph loaded). (memory: blackbox-deploy-gap)
- [ ] LOW (INFRA): automate the blackbox deploy so CI and the homelab box can't silently drift again
      (a deploy step that rsyncs on push, or a git-pull on the box). Manual rsync is the current process
      and clearly falls behind across sessions.

## 2026-07-08 — Revenue rails verified with the user (both healthy, both starved)

Walked the user through the two monetization dashboards (login-gated, so user-reported; I supplied
the expected numbers from D1 + live config and interpreted).

- [x] HIGH (was 2026-07-01 deferred): **Amazon Associates — NOT flagged/suspended.** No warning banner;
      the June bot-click bursts did not trigger a traffic-quality review, and the 2026-07-01 bot defense
      is holding. Tracking works: Amazon counted 4,445 clicks on `battlesheep0a-20` (we logged 5,086 —
      normal undercount). BUT **0 ordered items, $0 earnings.** Not a plumbing bug — bots inflate clicks
      and never buy (24h purchase window), and real human traffic is ~0 (even the 868 post-defense 7-day
      clicks converted 0). $0 is a TRAFFIC problem, not an affiliate problem. WATCH: Amazon closes
      Associate accounts with <3 qualifying sales in the first 180 days — user should check the approval
      date for remaining runway. The only fix is real converting traffic → the indexing/crawl items.
- [x] HIGH (was 2026-07-01 deferred): **AdSense — correctly configured, in review (not a bug).** Status
      "Getting ready," review requested 2026-07-07, ads.txt "Authorized." Zero clicks/$0 because ads are
      NOT serving yet (pending Google approval; days–4wk). Verified the loader `<script ... client=
      ca-pub-6952672558994325>` is present in <head> on home, worker-rendered /research pages, AND
      /reviews — matches ads.txt + ADSENSE_PUBLISHER_ID. Ownership verification should pass immediately
      (code already installed); no code paste needed. Just awaiting review.
- NET: both revenue rails are wired correctly and safe; $0 is entirely a discovery/traffic problem.
  Highest-leverage remaining work = GSC Request Indexing + Cloudflare AI Crawl Control (below).

## 2026-07-07 — BaitBench-informed evaluation: injection defense + expert-affiliate scoring fix

Cross-analyzed TrueRank against the BaitBench (~/projects/baitbench) v1-2026Q3 results — the ad-susceptibility
benchmark built from TrueRank's task shape. Key data: both prod models resist recommendation flips (0% FR on
AI-targeted injection) but only *detect* manipulation ~60-73% of the time, and are WORST on marketing puffery
(gemini-flash 45.4% MDR, gpt-5.4-mini 42.5% MDR) — deterministic detectors must compensate. kimi-k2.6's 48.3%
Cynicism Tax retroactively validates the 2026-06-29 synth swap.

### Shipped (reviewed, 355 unit assertions green)
- [x] HIGH (SECURITY/QUALITY): NO prompt-injection defense existed anywhere while the engine feeds arbitrary
      fetched page bodies to LLMs — and GEO/adversarial-SEO injection targeting AI research tools is documented
      in the wild (BaitBench Category D). Shipped: deterministic `hasAiInjection()` detector + `ai-injection`
      credibility tag (-60, below every score-45 gate) in worker/lib/credibility.js; added to NONCREDIBLE_GENRES
      (now exported from credibility.js as the single source of truth — extract/engine.js + prose.js import it);
      EMBEDDED-INSTRUCTION DEFENSE rule + [ai-injection] tag docs in the synthesis + agent prompts (prompts.js);
      data-not-instructions line in NOTE_SYSTEM (parallel-engine.js). Regexes reviewed for false positives
      ("if you're an air fryer fan" / "AI enthusiast" / "message to assistants" all pass clean — tested).
- [x] HIGH (QUALITY BUG): every major editorial outlet (Wirecutter/PCMag/CNET — all affiliate-monetized) took
      the full -45 affiliate penalty after full-page fetch → score ~20, BELOW both score-45 gates
      (READ_MIN_SCORE, MIN_CREDIBLE_SCORE) — the scorer was gutting exactly the sources the synthesis prompt
      says to trust most. Fixed: -15 soft penalty when the affiliate links sit on the apex/www host of an
      EXPERT_DOMAINS entry (leased parasite subdomains like coupons.cnet.com keep the full -45).
- [x] MED (REVIEW-CAUGHT): post-read credibility rescore was never re-gated — a page whose injection/affiliate
      taint only shows in the full body still flowed into note extraction. readOk now also requires
      score >= READ_MIN_SCORE after the rescore. (parallel-engine.js:181)
- [x] LOW: trust-panel "down-weighted" tally now counts ai-injection (research-page.js); doc drift fixed
      (CLAUDE.md + tiers.js header still claimed kimi-k2.6 synthesis; duplicate TAVILY_API_KEY line removed).
- [x] CRITICAL (CONVERSION + SEO): /reviews (sitewide product directory, primary nav) rendered an EMPTY
      `<div id="reviews-list"></div>` populated only by client JS — ZERO buy CTAs (the catalog monetized
      nothing) and empty for crawlers. `renderReviewCard` (with its click-tracked buy CTA) was dead code.
      Fixed with the proven browse.js pattern: SSR a real card grid of `renderReviewCard` into the container
      as a progressive-enhancement base (the client `TrueRankLayouts.render` does a full innerHTML replace, so
      no duplication when JS loads). Now every review card ships a buy CTA + a real /research/:slug link in the
      HTML. reviews-render smoke suite extended (16→19 assertions) to pin SSR cards + buy CTA + research link.
      (worker/pages/reviews.js) Closes the CRITICAL item from the 2026-06-27 audit.

### Recommendations from the evaluation (not yet done)
- [ ] MED (QUALITY): puffery is the shared blind spot of both prod models (~43-45% MDR in BaitBench). Consider
      deterministic Category-B detectors next: sponsored-content disclosures ("#ad", "paid partnership"),
      spec-weasel terms ("HEPA-type", "True-HEPA-inspired", peak-vs-sustained wattage), fabricated-authority
      signals. Needs a false-positive corpus check before shipping (BaitBench docs/real-world-examples.md is
      the pattern bank).
- [ ] MED (EVAL): add an ad-resistance regression eval to TrueRank itself — plant BaitBench-style canaries in a
      fixture corpus and assert the pipeline never echoes them (guards future prompt edits). The BaitBench
      grader technique is directly reusable; keep no code dependency per its charter.
- [ ] LOW (NOTE): BaitBench ranks gemini-2.5-flash above gpt-5.4-mini on ad resistance (93.3 vs 91.5 ARS, half
      the cost, 5% vs 16.7% cynicism) — but TrueRank's own juror panel found gemini "honest but thin" on
      synthesis usefulness. No model change recommended; re-check when BaitBench Phase-4 adds more models.


## 2026-07-03 — Real-world benchmark corpus (expert-ground-truth, no LLM judge)

Shipped eval harness for repeatable pick-quality regression against sourced expert reviews
(Wirecutter/CNET/PCMag URLs documented per query). Free live audit; `--spend` enqueues missing pages.

- [x] `eval/real-world-benchmark.json` — 18 queries with `accepted_winners`, `must_include_any`,
      `anti_patterns`, and citation URLs.
- [x] `scripts/run-real-world-eval.mjs` — deterministic scrape of live `/research/:slug` pages.
- [x] Baseline (2026-07-03, 11/18 scored): pick 8/10, recall@5 7/10, disclosure 11/11, depth 11/11.
- [ ] FOLLOW-UP — **Category contamination on live pages** caught by bench:
      `rw-air-fryer` top pick = Shark BreatheClear (air purifier); `rw-smart-bulb` top pick =
      Logitech M720 mouse on a Home Assistant bulbs report. **Fix shipped (2026-07-03):**
      `worker/lib/category-gate.js` + validate.js applies the gate on LLM synth path (extract
      already had it). Existing pages need re-run to pick up the fix.
- [ ] FOLLOW-UP — **7 missing pages** (mesh wifi, budget earbuds, budget espresso, home NAS,
      budget gaming headset, upright vacuum pets, laptop 2026) — run `node scripts/run-real-world-eval.mjs --spend`
      when budget allows (~$0.70).

## 2026-07-01 — /dp/ link recall: retailer fallback added (Best Buy, Newegg)

Follow-up to the 65%-of-clicks-hit-a-generic-search-page finding from earlier today. Two initial fix ideas
FAILED live testing before any code was written (exactly the point of testing first):
- Serper Shopping endpoint: every result was a `google.com/search?ibp=oshop...` redirect, not a real merchant
  URL, and **zero results were from Amazon** at all (Amazon largely doesn't participate in Google's Shopping
  product feed the way Best Buy/Walmart do — it doesn't need to pay for that placement).
- Naively extending the existing `site:amazon.com "product"` search technique to other retailers: noisy —
  `site:bestbuy.com` returned Q&A pages, `site:newegg.com` returned Newegg's own internal search-results page
  (`/p/pl?d=...`), `site:walmart.com` returned nothing. Same technique, much less reliable off Amazon.

**Shipped instead:** `worker/lib/asin-resolver.js` — after the existing Amazon resolver (`resolveOne`, unchanged)
finds no match, a new `resolveOtherRetailer()` tries Best Buy then Newegg via the same `site:` search technique,
but gated behind a real per-retailer URL-pattern allowlist (reject Q&A/review-tab/search-listing paths; only
accept genuine product-detail-page URL shapes) plus the existing title-token match. Caught a real bug during live
verification before shipping: Best Buy runs TWO live URL schemes for genuine products (`/site/{slug}/{sku}.p` and
`/product/{slug}/{code}/sku/{id}`) — the first-draft pattern only matched the first, silently dropping real
matches on the second (found via a live test with "Anker PowerCore 20000mAh", fixed before deploy).
`test/unit/asin-resolver.test.js` (16 tests, new) uses the exact real URLs captured during live testing as
fixtures — not synthetic guesses. Verified end-to-end against live Serper before and after the fix.
Without an Impact/Best-Buy affiliate program configured yet, a resolved Best Buy link is untagged (real,
specific product page — same honest "known retailer, no ID configured → keep URL as-is" behavior already used
for other retailers) — still a large UX win over the generic Amazon search-page fallback it replaces.

## 2026-07-01 — GSC unblocked + THE root cause found: zero real internal links to content

Continuation of the revenue eval below. GSC access finally worked (see that section for the wrong-service-account
saga); the moment real Search Console data landed, it revealed something more fundamental than the earlier findings.

- [x] CRITICAL — **Google has crawled and indexed the homepage, but has NEVER crawled a single one of the 317+
  individual `/research/:slug` content pages** (`URL Inspection API`: `coverageState: "URL is unknown to Google"`,
  `lastCrawlTime: never`). The sitemap itself HAS been fetched repeatedly (`lastDownloaded` within the last day, 0
  errors) and reports `submitted: 317, indexed: 0`. Root cause: `/research` (browse) and the homepage had **zero
  server-rendered `<a href="/research/:slug">` links** — the actual list was JSON data rendered into visible links
  only by client-side JS (`worker/lib/list-layout-boot.js`), which a crawler's fast HTML-parse pass never executes.
  Sitemap-only + JSON-LD-only discovery is explicitly documented by Google as weaker/non-guaranteed vs. real
  hyperlinks. This is the actual, most-fundamental reason for near-zero organic traffic/impressions — more
  fundamental than the bot-click or `/dp/`-link findings from earlier today, and unrelated to the domain's legacy
  IT-consulting search history (ruled that out — see below).
  **Fixed:** `worker/pages/browse.js` now server-renders a real `<a href="/research/:slug">` card grid (reusing the
  existing `.card`/`.card-top`/`.card-badge` CSS from the research-page "related research" section) as a
  progressive-enhancement base; the client-side `TrueRankLayouts.render()` still replaces it with the polished
  interactive view when JS loads (verified: `container.innerHTML = html`, a full replace, so no duplication risk).
  Verified live: 12 real links/page, correctly paginated across `/research?page=N`. `/best/:category` hub pages
  already had real SSR links (`worker/pages/category.js`) and were not the gap — but only cover the top ~12
  categories shown in the browse-page strip, so most content had NO real link path before this fix.
- [x] — Explicitly resubmitted `sitemap.xml` via the Search Console `sitemaps.submit` API (it was already being
  fetched, but resubmission after a real code fix is standard practice to prompt re-processing).
- [x] — Added `?gsc_days=N` to the manual `/metrics?gsc_ingest=1` trigger (was hardcoded to the cron's 5-day
  window) to support one-off historical backfills. Used it to pull a 90-day backfill — see the GSC findings below.
- [ ] Deferred to user (Google's own crawl scheduling, not something I can force via API): the general-content
  "Request Indexing" action is Search-Console-UI-only, no public API. Recommend manually requesting indexing on
  a handful of the highest-value pages (`URL Inspection` → paste URL → `REQUEST INDEXING`) as a manual nudge on
  top of the code fix. Realistic timeline for re-crawl + indexing to show up: days to a few weeks, not instant.

### GSC access — resolved (wrong service account, not a permission bug)
Root cause of the "insufficient permission" 403s from the earlier attempt: the user had created TWO service
accounts in GCP project `braided-rush-207117` — `truerank-gsc-reader` (granted Search Console access) and
`truerank-gsc` (the one whose key was actually set as `GSC_SA_KEY`). Fixed by adding `truerank-gsc@...` as a
second Search Console user rather than swapping keys. `sc-domain:chrisputer.tech` (Domain property) now returns
real data; the code's `DEFAULT_SITE` already matched, no config change needed.

### GSC data — the domain's legacy identity, quantified (and ruled out as the root cause)
90-day backfill: only 10 distinct queries ever recorded, 50 total impressions, **0 clicks, ever**. Most of the
volume ("zero trust infrastructure small business", "it consulting wichita", "disaster recovery as a service
kansas city") is unrelated IT-consulting-business search history — chrisputer.tech almost certainly had a prior
life as a local IT consulting site. Current-business queries ("truerank", "24tb nas") got a combined 6 impressions
in 3 months. **User asked whether a new domain is needed — no.** The legacy content isn't blocking the new
content from ranking; the missing-internal-links bug above is a complete, sufficient explanation on its own,
and it would affect a brand-new domain identically (which would also start with zero domain-age signal, a strictly
worse position). Fix the discovery path (done) and give it time; don't discard 3 months of domain age over this.

## 2026-07-01 — Full revenue/traffic eval + fixes ("I'm not making any money off of this")

Audited the funnel end to end (D1 live queries, code review, live prod smoke tests). Verdict: cost is not
the constraint (19% of $60/mo budget used); the real gaps were an unprotected affiliate endpoint and an
underfed/undercapped growth flywheel. Fixed everything in my control; 3 items need the user's login.

### Fixed
- [x] CRITICAL — `/api/go/:id` and `/api/go/search` had zero bot/scraper protection. `robots.txt` already
  disallows `/api/` for compliant crawlers, so 2,397 clicks from 6 IPs in one day (2026-06-21) and similar
  bursts were non-compliant scrapers — polluting `affiliate_clicks`/`guide_clicks` AND risking Amazon
  Associates suspension (ToS prohibits non-human traffic through affiliate links). Fixed: bot-UA regex +
  30/hr per-IP rate limit gates both handlers; flagged requests still redirect (nothing looks broken to
  whatever's probing) but get the Amazon tag stripped and are not logged. Verified live: bot UA → no
  `tag=`; real browser UA → tagged + `ascsubtag`. (worker/handlers/affiliate.js)
- [x] MEDIUM — Programmatic-SEO flywheel (Phase 5 of the original plan) was running but starved: only 43
  keywords left pending (would've drained under a week) at a 6/day cap while 81% of the API budget sat
  unused. Refilled with 200 new keywords from the real-Google-popularity autocomplete harvest (already
  gathered 2026-06-26, previously unused) and raised the cap 6→12/day (~+$13/mo, still well under budget).
  132 of 451 total pages (30%) already came from this flywheel before the fix — it's the real lever.
  (wrangler.toml FLYWHEEL_DAILY_MAX, schema/seed_keywords_flywheel_refill_2026-07.sql)
- [x] LOW — blackbox `JOB_CONCURRENCY=3` meant any burst (my own batch-testing on 2026-06-26 dumped ~95
  jobs into the queue) backed the pipeline up badly — 32 jobs in the last 7 days averaged 112 minutes to
  complete. Host has 16 cores / 37GB, was essentially idle (load avg 2.44) — real headroom existed. Bumped
  to 5 (moderate, not doubled, to avoid tripping Serper/OpenRouter rate limits at higher fan-out).
- [x] LOW — `test/integration/affiliate.spec.js` had a stale `insertProductV2` import (function doesn't
  exist in db.js — the pipeline inserts products via raw SQL inline, no shared helper). Added a local
  test-only helper matching the v2 schema; all 11 tests (7 existing + 4 new bot-defense) pass.

### Deferred — needs the user directly (I cannot access these)
- [ ] HIGH — Check the **Amazon Associates dashboard** for actual $ earned, and whether the account shows
  any suspicious-activity flag from the bot-click bursts above (now fixed going forward, but past bursts
  already happened before today's patch).
- [ ] HIGH — Check the **AdSense dashboard** for actual impressions/earnings — the code renders ads
  correctly (verified: all 3 slots + `ads.txt` present) but I have no visibility into real $ or approval
  status beyond that.
- [ ] MEDIUM — **GSC property access still not resolved** — `sites.list`/`searchAnalytics` both return
  "User does not have sufficient permission" for the service account despite the user granting access;
  identity was confirmed correct (`truerank-gsc@braided-rush-207117.iam.gserviceaccount.com`). Needs the
  user to re-verify the grant landed on the exact right property in Search Console, or re-grant. This is
  the single highest-leverage unblock — real search-impression data would replace guesswork keyword
  seeding with actual demand data. (memory: gsc-ingestion-built-dormant)

### Known, not fixed (pre-existing, out of scope for this pass)
- [ ] LOW — 4 other integration test files (report.spec.js + others) reference stale db.js helpers
  (`completeResearch`, `insertProductV2`) that don't exist — pre-existing breakage, unrelated to today's
  change, found while running the full `npx vitest run` suite. Needs its own pass.

## 2026-06-29 — Synth model lock (gpt-5.4-mini) + SearXNG provider + DNS fix

### Synth model — benchmarked & locked
- [x] HIGH — Synth was kimi-k2.6: slowest candidate (~40s), timed out ~1/8 runs. Ran a 50-query × 150-juror blind judge panel on real Google searches; **locked synth to openai/gpt-5.4-mini** (best grounding 7.18 + usefulness 7.31, #1 in 53% of head-to-heads). grok-4.20 DQ'd on honesty (3.15 fabs/report), gemini-flash honest-but-thin, flash-lite last. (worker/lib/tiers.js, research-worker.mjs — A/B rotation retired)
- [x] MEDIUM — synthProvider was the kimi throughput/quantization routing object; gpt-5.4-mini is single-provider so that 404s — set synthProvider:null. (worker/lib/tiers.js)
- Bench suite added: harvest-google + select-top50 (Google autocomplete → real product queries), bench-synth-v2 (corpus-cached 4-model), build-judge-bundles + aggregate-judges (blinded panel). (benchmarks/)

### Search providers — benchmarked & SearXNG shipped
- [x] MEDIUM — DuckDuckGo rotation slot was dead (CAPTCHA from datacenter IPs). Replaced with self-hosted **SearXNG** (free metasearch on blackbox :8095, tuned to google+startpage+bing+mojeek). (worker/engine/parallel-engine.js, tools.js searxngSearch)
- [x] MEDIUM — research-worker.mjs only forwarded SERPER_API_KEY → Brave AND the subagent's new Tavily were dead-wired. Now forwards SEARXNG_URL/BRAVE_API_KEY/TAVILY_API_KEY. (research-worker.mjs)
- [x] LOW — Corrected stale "Serper exhausted" belief: 50k paid credits intact; the burned quota was the separate 2,500 free trial. (memory)
- Provider bench (benchmarks/bench-providers.mjs): all 4 providers ≈ equal credibility; SearXNG free-equals paid; "use them all" = +50-65% unique-source recall.

### Infra
- [x] HIGH — blackbox research-worker container: after the env-recreate dropped the original `--dns`, every external fetch (Serper/OpenRouter/Jina/RSS) hung ~5.0s on the AAAA/IPv6 lookup → mass "operation aborted due to timeout" + failed jobs (LAN SearXNG by literal IP unaffected — the tell). Fixed by recreating with `--dns 1.1.1.1/8.8.8.8/192.168.5.1` + `NODE_OPTIONS=--dns-result-order=ipv4first` (5.1s → 0.14s). Introduced AND fixed this session.
- [ ] LOW — CF env `SYNTH_ENGINE="extract"` is vestigial: the blackbox path runs runParallelEngine (LLM synth) regardless. Clean up when convenient.

### Blocked on credentials (surfaced fetching "top Google product searches")
The ask was real Google search-term data; both proper sources were credential-blocked, so this session fell back to D1 `view_count` rankings + Google autocomplete harvest. Unblock either to get true Google query data:
- [ ] MEDIUM — **GSC search-term data needs a GCP service-account key.** The Search Console→D1 ingestion (`worker/lib/gsc.js`, `gsc_metrics`, daily cron, `/metrics?gsc_ingest=1`) is BUILT + deployed but DORMANT until `GSC_SA_KEY` is set. Activation: create a Google Cloud service account → JSON key → add as a Restricted user on the verified GSC property → `wrangler secret put GSC_SA_KEY`. This is THE source for "what people search on Google → the site." (memory: gsc-ingestion-built-dormant)
- [ ] LOW — **CF Analytics API token lacks `analytics.read` scope.** `CLOUDFLARE_API_TOKEN` (.cf-token) can deploy + query D1 but the GraphQL `httpRequestsAdaptiveGroups` (top pages / traffic) returns `authz: does not have permission 'com.cloudflare.api.account.zone.analytics.read'`. Add Analytics Read to the token (CF dash → My Profile → API Tokens) to pull traffic/top-pages programmatically; until then traffic ranking comes from D1 `view_count`.
- [ ] LOW — Chrome-extension browser path (for the manual GSC dashboard CSV export) was unavailable this session — extension not connected. Either connect it or use the GSC_SA_KEY API path above.

## 2026-06-27 — 5-agent site audit + report comparison table (godmode R1)

Ran a 5-auditor parallel sweep (live-QA, output-quality, SEO/traffic, backlog
triage, blackbox-infra) over the live site + repo. Live metrics at audit time:
$19.57/$60 spent (33%), 291 complete runs/30d. Key signal: physical/Amazon pages
convert 37–75% CTR, but **non-Amazon categories earn $0 on real traffic** (tax
software 0/81, credit-repair 0/64, enterprise firewalls 0/60) — a missing-CTA
revenue leak. The "funnel freeze until real traffic data" is now satisfied.

- [x] HIGH (CONVERSION): report pages had NO comparison table (grep `<table`=0)
      and rendered the chat widget ABOVE the answer + buy CTA. Shipped an SSR,
      no-JS-safe, AI-extractable `renderComparisonTable()` (research-page.js) with
      a Buy column (reuses resolveProductCtas → /api/go/:id), and reordered to
      Summary → Our Pick → Compare → chat → trust. TOC gains "Compare"; de-duped
      the doubled top-con. app.css `.compare-*`. Verified live on the NAS report
      (6 Buy CTAs, correct order). Closes the old comparison-TABLE backlog item.

### Open, ranked (from the audit) — next rounds

- [x] CRITICAL (CONVERSION): /reviews catalog renders ZERO buy CTAs —
      `renderReviewCard` (reviews.js:37, has the Amazon CTA) is dead code; the live
      grid is JS-rendered as plain /research/ links with no Buy button and no
      affiliate_url in the embedded data. The whole review catalog (primary nav,
      sitemap 0.8) monetizes nothing. SSR the cards w/ Buy + fixes empty-for-crawlers. **FIXED 2026-07-07 — see the 2026-07-07 section above (SSR renderReviewCard grid).**
- [ ] HIGH (CONVERSION/UX): mobile nav is broken site-wide — every header link is
      `hidden sm:inline` with no hamburger (worker/lib/html.js + public/index.html).
      On phones only "Account" + theme toggle are reachable. Add a disclosure menu.
- [ ] CRITICAL (QUALITY): location/service/experience queries get a product-shaped
      plan — parallel-engine.js decompose() never receives classifier facets, so
      facetFocusBlocks never reach the LIVE plan ("best pho in Wichita" → a Seattle
      Our-Pick). Thread facets into decompose (reuse the clarifications path); needs
      blackbox redeploy (worker/ AND research-worker.mjs) + a backfill of affected pages.
- [ ] HIGH (QUALITY): in-query budget/spec caps not enforced — a $600 product ranked
      #1 for "under $500". Extract the cap (classifier.js:154 hasBudget) into
      constraints + a deterministic price guard in validate.js applyQualityGate.
- [ ] MED (CONVERSION): ~40% of CTAs degrade to "Search Amazon" (keyword fallback)
      vs exact /dp/ "Buy on Amazon" — lift exact-ASIN coverage (asin-resolver.js).
- [ ] MED (SEO): SSR the /reviews + /research browse grids (today JS-hydrated, empty
      for crawlers; sitemap 0.8). Pairs with the /reviews Buy-CTA fix.
- [ ] QUICK WIN: email capture on home + /best hubs (backend built; research-page-only).

### USER ACTION required (gates big strategic value)

- [x] BUILT + DEPLOYED (dormant): GSC Search Analytics → D1 ingestion. lib/gsc.js
      (zero-dep RS256 JWT + OAuth + searchAnalytics over fetch), schema/008_gsc_metrics
      (applied to prod), daily cron (KV-guarded, fail-soft), /metrics `gsc` block +
      `?gsc_ingest=1` trigger. Verified live: `{skipped:'no GSC_SA_KEY'}`.
      REMAINING USER ACTION: set the GSC_SA_KEY secret (service-account JSON) +
      optional GSC_SITE_URL — then it self-starts. Setup steps handed to the user 2026-06-27.
- [~] DECIDED — relax (user, 2026-06-27): allow AI crawlers to GROUND (keep ai-train=no).
      The LIVE robots.txt is a Cloudflare-managed block walling off GPTBot/ClaudeBot/
      CCBot/Google-Extended. REMAINING USER ACTION: Cloudflare dashboard → AI Crawl
      Control / managed robots → allow the AI-input crawlers. Steps handed over 2026-06-27.

### Stale items closed by this audit (were misrepresenting health)

- [x] STALE: "HIGH (OPS) Serper free quota EXHAUSTED" (was line 250) — Serper was never
      exhausted (50k paid intact; only the separate free trial burned). The real outage
      (corrupted blackbox key) was root-caused/fixed 2026-06-25; Brave+Tavily+SearXNG
      fallbacks all shipped. Only residual: dev still shares prod's key (hygiene).
- [x] STALE: GOOGLE_CSE_ID dead env var — already removed 2026-06-16.
- [x] STALE: delete dead db.js insertProductV2/completeResearch — already deleted 2026-06-25.
- [x] STALE: "HIGH honesty engine-prompt fabrication" — duplicate of the resolved fix;
      fabrication already collapsed to 0/0.
- [x] OBSOLETE: "Phase 2 ship pure-ML Layer-1 synth behind a flag" — superseded by the
      engine-architecture verdict (gated-LLM-cleanup shipped; honesty solved by the gate).

## 2026-06-26 — Shared list layouts on browse + reviews (godmode R1)

- [x] UX: layout toggles (Spreadsheet / Cards / Compact / Timeline) were only on the home
      history tab — browse search results (/research) and the reviews directory (/reviews) still
      used fixed card grids. Added `public/js/list-layouts.js` (shared renderer for history,
      research, review, product kinds) + `worker/lib/list-layout-boot.js` (SSR JSON embed +
      boot). Wired browse, reviews, account history, home tab, and report product section.
      Preference persists in `truerank_list_layout` localStorage (migrates legacy
      `truerank_history_layout`).

## 2026-06-25 — Comprehensive code review and repair (godmode)

- [x] HIGH (research.js): queue `send()` failure left the D1 row permanently stuck in
      'pending' (claimNextPendingJob would never see it; the 20-min cron reaper ignored
      pending rows). Added try/catch around `env.RESEARCH_QUEUE.send()`: on failure the
      row is flipped to 'failed' and the API returns 503 "please retry".
- [x] MED (research.js): `parseInt(Last-Event-ID)` had no NaN guard — a malformed header
      (non-numeric value) produced NaN, silencing all progress entries in the SSE stream
      (every `entry.step > NaN` is false). Added `|| 0` fallback.
- [x] MED (research.js): `handleResearchStream` never checked whether the D1 row exists.
      An unknown reportId fell through both completion checks and sent an infinite stream of
      'pending' keepalives. Added a null-check with an 'error: Report not found' close.
- [x] MED (auth.js): signup TOCTOU — two concurrent requests could both pass
      `findUserByEmail` before either ran `createUser`, causing the second to hit the DB
      UNIQUE constraint and throw a raw 500 instead of a readable 409. Wrapped `createUser`
      in try/catch; UNIQUE constraint errors return the same 409 as the normal path.
- [x] MED (auth.js): no server-side max on password length — a crafted multi-megabyte POST
      would trigger expensive hashing before validation could reject it. Added a 1000-char
      early exit in `readCredentials` (form has maxlength="200" but that's client-only).
- [x] MED (affiliate.js): `affiliate_url` non-Amazon redirect had no host allowlist in the
      handler itself — only the pipeline's `buildAffiliateUrl` enforced the list at write
      time. A row written outside the pipeline could redirect to any HTTPS host. Added
      `isKnownRetailerUrl` check inline using the same BUY_HOSTS set as affiliate-links.js.
- [x] MED (affiliate.js): `network` and `ref` (reportId) query params were written to D1
      with no length cap — potential for oversized stored values. Added `.slice(0,32)` /
      `.slice(0,64)` to match the caps already on `handleAffiliateSearch`.
- [x] MED (asin-resolver.js): double-quote characters in a product name broke the Serper
      phrase-match query (`site:amazon.com "Ring 4" Door Sensor"` → malformed). Stripped
      `"` from the subject before interpolation.
- [x] LOW (db.js): deleted dead `insertProductV2` and `completeResearch` helpers — both
      lacked the DELETE-before-INSERT idempotency latch that `persistEngineResult` implements
      correctly. Neither was imported anywhere; leaving them was a footgun for future callers.
- [x] LOW (tiers.js): `isValidTier` accepted 'exhaustive'/'unbound' (private tiers) even
      though the comment says it is for the "public UI / validation surface". Fixed to
      `PUBLIC_TIERS.includes(value)`. Tests updated.
- [x] LOW (asin-resolver.js): removed dead `_affiliateIds` parameter from `resolveOne` (it
      was constructed and passed but never read inside the function).
- [x] LOW (research-worker.mjs): `complete()` swallowed a failed /complete POST with only a
      log line — the row orphaned in 'processing' until the 20-min cron reaper. Added one
      retry with 10s backoff before giving up.
- [x] LOW (research.js): `handleResearchEvents` used `e.timestamp || Date.now()` which
      substitutes Date.now() for a timestamp of exactly 0 (falsy). Changed to `??`.
      KV timestamps are never 0 in practice, but the pattern was incorrect.
- [x] LOW (parallel-engine.js): `runParallelEngine` export dead-export concern CLOSED —
      `parallel-engine.js` is not imported by anything under `worker/` so it is never
      in the CF Worker bundle. The export is legitimately used by 3 benchmark scripts and
      the integration test suite. No change needed.
- [x] MED (parallel-engine.js): `clarifications` accepted by `gatherParallel` but not
      forwarded to `decompose` — the planner generated aspects blind to user constraints
      ("budget: $200", "use-case: gaming"), silently degrading clarification-scoped output.
      Fixed: `decompose` accepts `clarifications` and appends them as a mandatory constraint
      block so search queries are biased toward the user's stated constraints.

## 2026-06-25 — ROOT CAUSE: blackbox Serper key was corrupted (search was broken)

- [x] CRITICAL (DIAGNOSE): the blackbox's SERPER_API_KEY was a wrong key with the Jina key
      concatenated (121 chars; `<badkey> - jina_...`) → EVERY Serper call 403'd → gather silently fell
      back to DuckDuckGo (times out from the datacenter) → ~4 sources/review instead of ~182. This was a
      major hidden driver of the 42% "thin" corpus (blamed on ML recall). Fixed by recreating the docker
      container with the clean 40-char Serper key + JINA_API_KEY as its own var (old container kept as
      `-bak`). Verified: serper 403 count 0, 182 sources, review succeeds. See memory
      blackbox-serper-key-corruption.
- [x] RECOVERY + IMPROVEMENT (done): with search fixed, backfilled 135 reviews (failed + thin), 79 lifted.
      Quality-monitor BEFORE → AFTER: health 53.9% → 86.0%; thin 42% → 14%; empty 11 → 0; junk 38 → 0;
      products 1399 → 1873 (+474). The corrupted Serper key was the dominant quality bottleneck — fixing it
      + recall-supplement + name-cleanup together transformed the corpus. Residual ~25 failed = genuinely
      niche/vague queries (re-run final pass).

## 2026-06-24 — Engine quality pass (review all reviews) + rate-limit removal

- [x] API (by request): removed the per-IP rate limit on /api/research (was 5/hr) — the public
      research endpoint is now unthrottled. MONTHLY_BUDGET_USD governor is the sole cost backstop
      (503 at the cap). Auth login + chat limits unchanged (lib/rate-limit.js kept for those).
      (commit 613cdcc, deploy e44ac774)

## 2026-06-24 — Content safety + UI fixes

- [x] HIGH (content safety): adult/illegal queries were NOT suppressed — the classifier had the
      reject categories but ensureClassified ignored accept=false, so they got researched + indexed.
      Added worker/lib/safety.js (deterministic, fail-CLOSED, phrase/\b-anchored; 35/35 test cases)
      + screened at EVERY entry (handleStartResearch 422, /api/classify, ensureClassified which now
      ENFORCES the LLM reject too → runResearchPipeline + claimNextPendingJob markRejected). Live:
      "best porn sites"→422, "how to make a bomb"→reject, "best mechanical keyboard"→200. (commit 87739717)
- [ ] LOW (safety follow-up): red-team the denylist for obfuscation bypasses (leetspeak/spacing);
      LLM classifier is the backstop. Firearms = LEGAL products, intentionally NOT blocked (only illegal
      weapon-making/acquisition).
- [x] HIGH (UI, user report): the letter-block fallback rendered OVER working product pictures —
      its inline display:flex overrode the [hidden] attribute's UA display:none. Hide via inline
      display:none; onerror restores display:flex. CACHE_VERSION tr8→tr9. Fixed + live. (commit b046a4b7)
- [x] ENGINE (benchmark verdict → user "benchmark all three, then decide"): settled ML-vs-LLM with
      benchmarks/bench-engine-v2.mjs on 8 real corpora. Honesty is NOT the differentiator (grounding-
      ungrounded names A=5/B=3/C=0 — the gate works for all); full-LLM loses the long tail (26 vs 91
      products); gated-LLM-cleanup (B) wins. SHIPPED worker/engine/extract/name-cleaner.js (cleanProducts):
      LLM (tiers.cleanupModel=gemini-2.5-flash) cleans each ML name + drops junk/platforms/dupes,
      CONSTRAINED to the candidate set + per-name groundedness gate + "keep when unsure" (Profitec/Rancilio
      survive) + product-TYPE filter (drops hubs/chips/software in a bulbs query). Wired into synthesizeHonest
      (blackbox), before the con-selector, 45s timeout. (commits 31578a6, 9060006)
- [x] MEDIUM (user report): smart-home queries surfaced PLATFORMS ("Apple HomeKit Alexa", "Amazon Alexa")
      + spec fragments + adjacent products. Addressed by the hybrid cleanup above (product-TYPE filter).
      DEPLOY GOTCHA found + fixed: the cleanup didn't fire for ~4 live re-runs because rsync of worker/
      does NOT cover research-worker.mjs (repo root, blackbox entrypoint) — needs a separate
      `rsync --inplace` (src/ is root-owned). See memory blackbox-deploy-entrypoint-gap.
- [x] ENGINE (recall-supplement, the C win — SHIPPED): the dominant corpus problem is THINNESS (42% of
      live reviews <=3 products, per scripts/quality-monitor.mjs). worker/engine/extract/recall-supplement.js
      proposeMissingLeaders() asks an LLM (tiers.recallModel=gemini-2.5-flash) which category leaders the
      Title-Case harvest missed; harvestCandidates SEEDS those names so they pass the SAME analyzeProduct +
      credible-source gate. Grounding automatic — absent-from-sources ⇒ no candidate ⇒ no fabrication.
      Validated: photo-backup 5→9 (recovered PhotoPrism/Nextcloud/Plex); linen 0→0 (proposals ungrounded,
      all dropped). Runs in synthesizeHonest before cleanup. (commit 79f83994 era)
- [x] MONITOR (user "monitor quality"): scripts/quality-monitor.mjs audits EVERY live review via prod D1
      — status mix, product-count buckets, junk-name scan (platform/fragment/specfrag/merge), worst
      offenders, single HEALTH SCORE (>=4 products AND 0 junk; exits non-zero <45% for cron/CI gating).
      Baseline 2026-06-24: 323 complete, 42% thin, 38 junk/15 reviews, health 53.9%.
- [x] CORPUS BACKFILL (DONE): backfill completed — 135 processed, 79 lifted. Quality-monitor AFTER:
      health 86%, empty 0, junk 0, products 1962. (2026-06-24)
- [x] CLEANUP (delete candidates): 12 indexed GIBBERISH/test reviews deleted from D1 + de-indexed.
      Confirmed gone (D1 count = 0). (2026-06-24)
- [ ] FOLLOW-UP (harvester merges): two adjacent products get harvested as ONE candidate ("Synology Photos
      Immich", "Synology Filerun PhotoManagement"). The name-cleaner cleans a name but can't SPLIT one row
      into two, so the merged entry survives + a recall-seeded "Immich" starves of pros/cons (the `seen`
      clause-allocation gave them to the merged row first). Fix: split-aware harvesting OR let cleanup emit
      a split. Low-frequency; surfaced on self-hosted-photo. (engine.js brandTruncate handles SOME merges.)
- [ ] FOLLOW-UP (linen-class gather gap): some queries return 0 products because the GATHER found no usable
      sources (linen shirts). Recall-supplement can't help (nothing to ground against). Needs better
      apparel/retail source providers or a query-rewrite, not an engine change.

## 2026-06-23 — Keyboard results were garbage (user report) + followups resolved

- [x] HIGH (DIAGNOSE): live keyboard searches returned junk — #1 was "Blue Connect Technology
      Pty Ltd" (a company), plus "flair"/"rigid" (collision brands), and WRONG-CATEGORY products
      (ASICS running shoe, Apple MacBook, Shark vacuum, Apple TV, Sony Playstation) surfacing in
      a keyboard query because the comprehensive net had ZERO category filtering. Fixed:
      (1) corporate-entity drop (Pty Ltd/LLC/Inc/Ltd/GmbH); (2) physical-product queries reject
      single-token brand-only names ("flair") while services keep theirs (Brevo); (3) CATEGORY
      GATE — a product's name + supporting-source TITLES + sentences must mention a category term
      (from topical_category + query nouns), else dropped; (4) FOREIGN_CATEGORY noun drop (tv/
      playstation/laptop/sneaker…); (5) date-fragment drop ("July 2026"); (6) more name-tail
      bleed words (Operating Environment, Launcher, TikTok, Web, Bottom Line). Verified on the
      two real queries: garbage gone, query2 = 0 wrong-cat, query1 = 1 residual leak (ASICS).
      Fixture legit_recall held at 1.0; all gates + unit green.
- [x] HIGH (search resilience, was task #21): Serper-outage fallback. DDG is blocked from CF, so
      added Brave Search API (CF-reachable) as the primary fallback (Serper→Brave→DDG). BRAVE_API_KEY
      set on prod+dev. Verified: 10 sources gathered with the Serper key empty.
- [x] entity followups: pruned collision brands (summer/blue/ridge/flair/rigid); apparel
      descriptive-tail trim (Clothes/Worth/Buying/Texture); trailing review-adjective trim
      (Exceptional/Swappable/Amazing…). (commit 7e03f9e)
- [x] HIGH (reliability regression found during verification): a rich keyboard query hung in
      'processing' (zombie row, synth_model never written). Cause: per-product ASIN+image
      resolution ran SEQUENTIALLY (~16 serial Serper calls) in persist + a slow con-selector
      could stall. Fixed: resolveAsins/resolveImages resolve concurrently (Promise.all);
      con-selector wrapped in a 30s timeout. Re-run completed in 166s, extraction-v0, all
      keyboards. (commit 82dba4e)
- [x] MEDIUM → DONE (brand→category mapping): gazetteer flat Set → 9 BRAND_CLUSTERS (TECH/
      APPAREL_FOOTWEAR/HOME_KITCHEN/BEAUTY/OUTDOOR/TOOLS/PET/BABY/BAGS_TRAVEL), all 982 brands
      preserved (0 lost), multi-cluster brands in each. analyze() maps query→cluster (keyword
      signals) and drops a product whose brand belongs only to other clusters (fail-open when
      either side unknown). ASICS-in-keyboards leak ELIMINATED (0 leaks both queries); fixture
      legit_recall held 1.0; desk/earbuds survivors all legit. (Phase 1 of the comprehensiveness plan)
- [x] PHASE 2 (comprehensiveness) — REVISED to BLACKBOX-SIDE honest synth (user-steered pivot,
      see memory blackbox-honest-synth-architecture). First built "blackbox=gatherer, CF
      synthesizes" (commit a8c1884), but the adversarial review flagged that CF-side synth on
      unbounded worker sources can blow the 300s Worker CPU limit (verifier benchmarked 200
      full-body sources = 227s). Rather than cap (which cost ~25% of products), moved the synth
      to the idle homelab: research-worker.mjs now gather + synthesizeHonest → posts finished
      {result,extraction-v0}; handleComplete reverts to validate+persist (no CF synth, no caps).
      Honesty unchanged (extraction is deterministic → can't fabricate wherever it runs; CF
      re-validates structure). unit + 126 integration + fixtures green.
      ROLLED OUT TO PROD 2026-06-23: rsynced worker/ + research-worker.mjs to blackbox
      (chris@192.168.5.10:/mnt/pods/truerank-research-worker/src, sudo for the root-owned entry
      file) + restarted the container; CF deployed; EXTERNAL_WORKER_ENABLED=true. Verified LIVE:
      a canary processed ON the blackbox — [job] log + "Planning 12 angles" parallel-engine +
      281 sources gathered UNLIMITED + synth on the homelab + synth_model=extraction-v0, $0.0146.
      **GOTCHA: first canary failed — `sleep 2` after the flag deploy was too short, so the queue
      consumer fired on a not-yet-propagated edge (flag still false) and processed CF-side + stuck.
      Fix: wait ~30s for global propagation before submitting after a flag flip.** Rollback =
      EXTERNAL_WORKER_ENABLED=false (CF-side runEngine, verified healthy: extraction-v0, 8 products).
- [x] HIGH/MED (review-caught) — RESOLVED BY THE PIVOT: the CF-side-synth CPU-exhaustion risk and
      the incrementMonthlyCost-on-validation-failure leak both lived in the CF gather-only branch
      that the pivot REMOVED (CF no longer synthesizes). The untrusted-input boundary is also gone
      (the homelab synthesizes its own gathered sources). wrangler.toml comment updated for the pivot.
- [x] LOW (review-noted, pre-existing): research-worker.mjs complete() swallows a failed /complete POST
      (logs, no re-throw) → the row orphans in 'processing' until the cron reaper flips it to 'failed'
      (never re-queued). Fixed: one retry with 10s backoff. (2026-06-25)
- [x] MEDIUM (comprehensiveness watch-item) — RESOLVED: the synth source-count limit is gone (the
      homelab has no CF CPU ceiling → unlimited mining). Kept the sentence-memoization (perf) +
      MAX_CANDIDATES=250 cap (cheap runaway-loop safety) regardless.
- [x] MEDIUM (gather depth lever) — DONE: raised MAX_READ 24→50 in parallel-engine.js (blackbox
      has no CF cap), note-extraction concurrency 6→8. Live: a keyboard query went 7→16 products
      (8→12 notes). Deployed to blackbox + CF. Also added JINA_API_KEY support (fetchPageContent
      Authorization bearer, threaded from env) — a free Jina key lifts the keyless 429 cap for even
      more successful reads. JINA_API_KEY now SET (2026-06-24) on prod CF (wrangler secret) AND the
      blackbox (added to Portainer stack 138 env via the REST API: GET stack/file → add env line +
      Env entry → PUT → redeploys; token in BWS "Portainer-API"; blackbox SSH chris@192.168.5.10).
      Date-fragment regex now catches ordinals ("December 9th"). Pushed to GitHub.
- [x] HIGH (comprehensiveness leaked at VALIDATE, not gather) — FIXED: the deeper reads made the
      synth produce 22 products but validateResearchResult kept only 3, because applyQualityGate's
      completeness filter required ≥1 pro AND ≥1 con — built for the old LLM synth that always
      fabricated cons. The honest extraction synth ABSTAINS on cons (no criticism in sources), so
      ~20 legit pros-only products were dropped. Loosened to ≥1 pro OR ≥1 con (validate.js:155).
      LIVE PROD result: a wireless-mouse query went 3 → 13 products (extraction-v0, $0.016). The
      full chain (unlimited mining → MAX_READ=50 → keep pros-only) now delivers comprehensiveness.
- [x] MEDIUM (name hygiene) — DONE: a name-hygiene workflow (parallel design by bad-name category +
      INDEPENDENT adversarial verification against a real 99-name corpus) produced 4 false-positive-
      safe rules, all applied (commit e6ea0c2): brandTruncate cuts a 2nd product after a model code +
      collapses near-dup brand echoes (lev2); trimNameTail +denylist + spec/price-junk cut ("Price:$…",
      "Review NN", "Specifications NN"); isBoilerplate drops coupon/promo/warranty/meal-delivery/deploy
      fragments. 0 false positives, legit_recall=1.0, name_dirty_rate=0. Corpus dropped 6 non-product
      fragments (Coupon/Warranty/Meal-Delivery). Residual: a few edge variants ("…Eureka" tail) — not
      chased (gates clean, chasing risks false positives).
- [x] LOW (deeper-read residual) — DONE: the Jina key + MAX_READ=50 surfaced brandless MEASUREMENT-
      SPEC callouts as names ("Compact 1350W", "Enthusiasts 58mm Upgradability", "While 51mm") — they
      passed the no-brand KEEP rule because a spec (1350W/58mm) reads as a strong code. Added
      hasModelishCode (brandless candidate needs a real MODEL code, not just number+unit). Live
      espresso run after: clean ("Breville BES870XL Barista Express", "Gaggia Anima", "CASABREWS
      CM5418"), spec-fragments gone. JINA effect confirmed: reads 17→45, notes 12→173, products 3→20.

## 2026-06-22 — PROD CUTOVER: honest ML extraction engine shipped to chrisputer.tech

- [x] Merged `tr-dev-quality-speed-ux` → main; prod `wrangler.toml` set SYNTH_ENGINE=extract +
      EXTERNAL_WORKER_ENABLED=false; deployed `truerank`. Live: honest ML synth (no fabrication),
      "Why X/5" + "read the low ratings", inquisitive clarify UX, OpenRouter speed, comprehensive
      ~24-product coverage, 987-brand gazetteer. Verified: fresh prod run synth_model=extraction-v0,
      $0.02, products with grounded cons.
- [x] HIGH (bug found+fixed during cutover): flipping EXTERNAL_WORKER_ENABLED=false did NOT stop the
      off-CF blackbox worker — it polls /api/internal/next-job independently and kept claiming jobs
      (first prod run came back synth_model=kimi-k2.6). Fixed: handleNextJob returns no job when the
      off-CF worker is disabled, so the CF-side consumer (honest engine) processes all. Test added.
- [ ] LOW (follow-up): apparel/no-model-number categories produce rougher names (descriptive
      fragments, a few gazetteer collisions like "getaway"); residual sentence-fragment stragglers.
      Rollback if needed: EXTERNAL_WORKER_ENABLED=true + redeploy (blackbox still running, idle).

## 2026-06-22 — Dev-box work (on tr-dev only; NOT prod, NOT committed)

User testing of the password-protected dev box (tr-dev.chrisputer.tech, extraction engine) drove these.

- [ ] HIGH (OPS): **Serper search key shared dev+prod, free quota EXHAUSTED by dev testing.**
      `web_search` returns 0 ("Not enough credits") → engine finds 0 sources → research fails
      "No reliable products found." Likely degrades PROD search too. DDG fallback is blocked
      from Cloudflare edge IPs (works from shell, 0 from Worker), so the free fallback doesn't
      save it. FIX: user topping up Serper (paid); also give dev its OWN key. Follow-up: a
      CF-friendly general-search fallback (Brave API / self-hosted SearXNG on blackbox).
- [x] HIGH (QUALITY): extraction output defects — name bleed ("Motion 300 Appears",
      "SRS-XB100 4.0 Excellent", "Micro 2nd"), HTML-entity garbage in pros, listicle headlines
      as pros, best_for="under", near-zero cons. Fixed Q1-Q6 in worker/engine/extract/* +
      prose.js; gated by benchmarks/extract-eval.mjs (new messy fixtures + name_dirty/entity/
      text_ungrounded/bestfor_dirty/avg_cons gates). ALL GATES PASS.
- [x] HIGH (UX): a rating (e.g. 3.5/5) was shown with NO explanation and often zero cons —
      user couldn't tell why a low-rated product was suggested. Fixed: always surface cons +
      a render-time "Why X/5:" rationale line (research-page.js ratingNote()); low ratings
      now say "recommended only if it fits a specific need." Applies to extraction + synth.
- [x] HIGH (UX, reviewer feedback): a buyer won't purchase a sub-4★ pick without reading the
      actual criticism first ("won't buy below 4★ unless I can read the low ratings"). Added a
      prominent "⚠ Why some reviewers rated it low" block (research-page.js criticalReviewsBlock)
      for products rated <4 (and unrated): surfaces the critical points, framed "decide whether
      it's a dealbreaker for you", with an honest note when no criticism was found. Shows on
      both product cards and the Our-pick box. Verified on dev. [DEPLOY TO PROD pending Serper +
      ship-gate.]
- [ ] MEDIUM (DEEPEN): the critical block reuses extracted `cons`. A stronger version would
      capture verbatim 1-2★ review excerpts with source/star attribution so buyers read real
      negative reviews, not summarized clauses. Follow-up after Serper restored.
- [x] MEDIUM (UX): presumptive — the home search box bypassed the clarify step (app.js POSTed
      /api/research directly). Now classifies first via /api/classify and shows inline
      need-questions with a one-tap "Just search for it" skip.
- [x] PERF: agent-loop latency (~135s) — planner reasoning:{effort:low}, concurrent+
      budget-admitted tool calls (engine.js), synth throughput provider routing, classifier
      strict structured outputs. Mechanics verified (LLM params accepted live; caught a gemini
      `quantizations` 404 in testing → planner provider dropped). Wall-clock unmeasured until
      Serper restored.

## 2026-06-21 — UX: "Unexpected token '<'" on research submit (HTML instead of JSON)

User report: "Could not start the research: Unexpected token '<', "<!DOCTYPE "... is not valid JSON".
- [x] HIGH (UX): public/js/app.js blindly called res.json() on the /api/research POST. The
      backend is healthy (verified: full submit path returns 200 JSON, zero worker
      exceptions in tail) — the HTML came from a TRANSIENT Cloudflare edge response
      (challenge / 5xx / rate-limit block page), which res.json() crashes on with the cryptic
      "Unexpected token '<'". Added readJson() (content-type guard → friendly message for
      429/5xx/other non-JSON) + friendlyError() (network vs parse vs generic), wired into the
      submit + poll paths. Now a transient non-JSON response shows an actionable "please
      retry", not a parse crash.

## 2026-06-18 — Integration coverage: engine + pages + handlers (R11–R13)

- [x] R11: parallel-engine.js (production burst engine) via vi.mock on llm.js + tools.js —
      full pipeline, zero-source non-result, FOSS injection, stream→retry fallback (4 tests).
- [x] R12: page renderers + more router via SELF.fetch — browse 91%, category 97%,
      research-page 63%, index.js 39%→50% (18 routing tests). Schema helper applies 005/006/007.
- [x] R13: subscribe (85%) / image (100%) / auth signup-login-logout (DB+crypto) handlers.
      Captured vitest-pool-workers isolatedStorage + istanbul-coverage gotchas as learnings.
- 125 integration + 308 pure-logic = 433 tests. Remaining tail (incremental, same patterns):
      tools.js executeTool internals, engine.js agent-loop (CF fallback), keywords, chat,
      clarify page, deeper research-page/index branches (research-submission + queue + scheduled).

## 2026-06-18 — Integration coverage: router + fetch-mocked modules (R7–R8)

- [x] R7: index.js routing via SELF.fetch (11 tests) — CORS, /find 302, sitemap/feed,
      /api/report, /research/:slug (render + 404), legacy 301, internal 401, security
      headers. index.js 0% → 39% line (rest = research/chat/queue/scheduled flows).
- [x] R8: fetch-mocked modules — classifier.js (cache hit, fail-open ×3, reject, no-canon,
      rejection-message map → 98.8% line) + indexnow.js (no-op/success/non-OK/throw → 100%).
      Proves the vi.stubGlobal('fetch') pattern in workerd.
- [x] 78 integration tests; covered I/O modules: db/rate-limit/report 100%, indexnow 100%,
      classifier 98.8%, sitemap 94.6%, affiliate 93.2%, internal 81.3%, index 39%.
- Remaining (same patterns, incremental): resolvers (asin/image), search providers
      (jina/rss/duckduckgo/youtube), engine (engine/parallel-engine/tools/llm-stream),
      keywords, auth, chat/subscribe/image handlers, category/clarify/browse pages, and the
      research-submission + queue + scheduled paths of index.js.

## 2026-06-18 — Integration coverage: handlers + sitemap (godmode R6)

Built on the R5 harness. Shared schema helper (test/integration/_schema.js applies
001+002+003). New specs (45 integration tests total): affiliate (conversion redirect
tree + click logging), report (all row states + feedback validation), internal (auth
gating, atomic claim, progress feed, failure paths), sitemap (XML/feed/OG + 304 + cache).
- [x] Line coverage on the 6 integration-tested I/O modules: db 100%, rate-limit 100%,
      report 100%, sitemap 94.6%, affiliate 93.2%, internal 81.3% (overall 92.8%).
      Remaining gaps are error-catch blocks + internal's success-persist path (triggers
      Serper/IndexNow fetch — needs a fetch-mocked round).

## 2026-06-18 — Workers test harness for I/O-module coverage (godmode R5)

User chose to relax zero-npm for a DEV-ONLY test harness (toward true 100% incl. I/O).
- [x] Harness: vitest + @cloudflare/vitest-pool-workers + @vitest/coverage-istanbul in
      devDependencies; vitest.config.js (defineWorkersConfig, bindings from wrangler.toml,
      Miniflare in-memory D1/KV). Runs tests INSIDE workerd with real bindings. node_modules
      gitignored; package.json + lock committed. CLAUDE.md updated: runtime stays zero-dep,
      this is the one scoped exception, never bundled.
- [x] Integration specs (test/integration/*.spec.js): smoke (D1+KV bindings), db.spec
      (all 13 db.js helpers vs real D1 with 001+002+003 schema applied — db.js 100% line,
      was 37%), rate-limit.spec (KV sliding window — 100%). 13 tests green + coverage report.
- [x] Two test layers documented: fast pure-logic (`node scripts/run-tests.mjs`, zero-dep,
      308 assertions) + I/O integration (`npx vitest run --coverage`).
- Remaining toward full-codebase 100%: handlers, sitemap, classifier, resolvers, engine
      orchestration, index.js routing — now UNBLOCKED by the harness; each is an incremental
      round (write *.spec.js using env bindings + SELF.fetch for routes).

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
- [x] R4 extended coverage to more pure modules: prompts.js (buildAgentPrompt +
      buildSynthesisPrompt — 100% line; the synth assertions also regression-guard the
      brand-quality/FOSS/rank rules), llm.js pure helpers (llmBudgetMs, pruneMessages —
      the rest is fetch I/O), search-bar.js (100%). Gate now spans 14 modules at 99.88%
      line / 308 assertions; the only uncovered line is affiliate-links' unreachable catch.

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
- [x] Deploy: GitHub Actions on push to `main` (`.github/workflows/deploy.yml`):
      unit tests → `wrangler deploy`. Repo secret `CLOUDFLARE_API_TOKEN` required.
      Manual fallback: `export $(grep -v '^#' .cf-token | xargs) && npx wrangler deploy`.

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
