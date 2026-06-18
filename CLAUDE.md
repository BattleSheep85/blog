# TrueRank — Honest Product Research Tool

## Overview
Product research web app that scrapes real reviews, filters out fakes/affiliate garbage,
and produces honest comparison reports. Monetized via affiliate links (Amazon Associates, etc.).

## Stack (ZERO package managers)
- **Frontend**: Static HTML/CSS/JS, Tailwind via CDN (no runtime JS dependencies)
- **API**: Cloudflare Workers (plain JS, no npm)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Background jobs**: Cloudflare Queues (consumer + cron `scheduled` reaper)
- **AI** (bench-derived paid stack via OpenRouter, all over `fetch()`):
  - **Classifier**: `google/gemini-2.5-flash-lite` (facets + topical category + reject)
  - **Planner / agent loop**: `google/gemini-2.5-flash`
  - **Synthesis**: `moonshotai/kimi-k2.6` (single stack — matched opus-4.8's perfect honesty at ~1/9 the cost in the June-2026 benchmark)
  - **Tiers collapsed to ONE config (2026-06-16):** one model set + ~50-search deep research for every run (no more instant/full/exhaustive). `worker/lib/tiers.js` exposes a single `ENGINE_CONFIG`; all tier keys resolve to it. Rationale + data: `benchmarks/engine-llm-bench-2026-06.md`.
- **Search**: Serper.dev Google Search (web + news), HN Algolia (free), DuckDuckGo, RSS expert feeds
- **Cost governor**: `MONTHLY_BUDGET_USD` (default 60) — each run increments a
  KV `cost:YYYY-MM` counter; `POST /api/research` returns 503 once the month's
  spend hits the cap. Per-run cost persists to `research.cost_usd`.
- **Deployment**: GitHub (private) → Cloudflare Pages + Workers

## Key Constraint
NO package managers. No npm, pip, cargo, etc. All dependencies vendored or loaded via CDN.
Supply chain security is a hard requirement.

## Commands
- Local dev: `npx wrangler dev` (wrangler is the only CLI tool, used ad-hoc not as a dependency)
- Deploy: Push to main → Cloudflare auto-deploys
- DB migrations: `npx wrangler d1 execute DB --file=schema/001_initial.sql`
- Tests: `node scripts/run-tests.mjs` (272 assertions across 8 suites — credibility rubric, validate quality-gate, product-search faceting, reviews render-smoke, utils, affiliate-links, lib-pure, credibility-extra)
- Coverage gate: `bash scripts/coverage.sh` (Node built-in V8 coverage, zero npm; enforces ~100% line on the pure-logic layer. I/O modules need the CF runtime and are out of unit-coverage scope by design.)
- Output eval: `node scripts/run-eval.mjs` (golden-query honesty audit against the live site; `--spend` enqueues missing runs, ~$0.10 each)

## Architecture
- `/public/` — Static frontend files (served by Cloudflare Pages)
- `/worker/` — Cloudflare Worker source (plain JS)
- `/worker/engine/` — Ported research engine: `engine.js` (agent loop + synthesis
  orchestration), `llm.js` (OpenRouter streaming/non-streaming + context pruning),
  `tools.js` (web_search/read_page/note; Serper + HN + DDG + RSS providers),
  `prompts.js` (agent + synthesis prompts), `validate.js` (result sanitization)
- `/worker/lib/` — Shared utilities (`db.js`, `tiers.js`, `classifier.js`,
  `affiliate-links.js`, `credibility.js`, `duckduckgo.js`, `rss.js`, `jina.js`,
  `rate-limit.js`, `utils.js`). NOTE: the old `lib/llm.js` and `lib/search.js`
  were removed — the engine owns its LLM + Serper layers now.
- `/worker/pipeline/` — `orchestrator.js` only: classify → runEngine → validate →
  persist. The old `search.js`/`analyze.js`/`synthesize.js`/`affiliate.js`
  stages were deleted (the engine subsumes them).
- `/worker/handlers/` — HTTP route handlers (research, report, affiliate)
- `/schema/` — D1 database migrations

## Secrets (set via wrangler secret put)
- OPENROUTER_API_KEY — paid OpenRouter key (classifier/planner/synth models)
- SERPER_API_KEY — Serper.dev Google Search (web + news search providers)
- AMAZON_ASSOCIATE_TAG — optional; `AMAZON_AFFILIATE_TAG` ([vars]) is the default tag
