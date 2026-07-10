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
  - **Synthesis**: `openai/gpt-5.4-mini` (locked 2026-06-29 after a 50-query × 150-juror blind panel: best grounding + usefulness; replaced kimi-k2.6 which was slowest and timed out ~1/8 runs — see `issues.md` 2026-06-29 + `worker/lib/tiers.js`)
  - **Tiers collapsed to ONE config (2026-06-16):** one model set + ~50-search deep research for every run (no more instant/full/exhaustive). `worker/lib/tiers.js` exposes a single `ENGINE_CONFIG`; all tier keys resolve to it. Rationale + data: `benchmarks/engine-llm-bench-2026-06.md`.
- **Search**: Serper.dev Google Search (web + news, primary), SearXNG (self-hosted metasearch on blackbox, free/broad — fills the dead DuckDuckGo rotation slot + leads the web fallback chain), Brave + Tavily (keyed CF-reachable fallbacks / selectable providers), HN Algolia (free), DuckDuckGo (last resort, CAPTCHA-blocked from datacenter IPs), RSS expert feeds. Provider quality benchmark: `benchmarks/bench-providers.mjs` (all four ≈ equal credibility; SearXNG free-equals paid; "use them all" = +50–65% unique-source recall).
- **Cost governor**: `MONTHLY_BUDGET_USD` (default 60) — each run increments a
  KV `cost:YYYY-MM` counter; `POST /api/research` returns 503 once the month's
  spend hits the cap. Per-run cost persists to `research.cost_usd`.
- **Deployment**: GitHub → GitHub Actions (`.github/workflows/deploy.yml`) → Cloudflare Workers

## Key Constraint
NO RUNTIME package managers. The deployed Worker is plain JS with ZERO runtime
dependencies — everything that ships is vendored or loaded via CDN. Supply chain
security is a hard requirement for anything that reaches production.

**One scoped exception (2026-06-18): dev/test tooling.** A Miniflare-backed Workers
test harness (`vitest` + `@cloudflare/vitest-pool-workers`) lives in `devDependencies`
ONLY. It is never bundled into the worker (wrangler bundles `worker/index.js`'s import
graph; `node_modules`/test specs aren't in it). `node_modules/` is gitignored;
`package.json` + `package-lock.json` are committed for reproducible installs. The runtime
zero-dependency rule is unchanged — do NOT add a dependency that ships to the worker.

## Commands
- Local dev: `npx wrangler dev` (wrangler is the only CLI tool, used ad-hoc not as a dependency)
- Deploy: **push to `main`** runs unit tests + `wrangler deploy` via GitHub Actions. Manual fallback: `export $(grep -v '^#' .cf-token | xargs) && npx wrangler deploy`. Repo needs `CLOUDFLARE_API_TOKEN` secret (Workers Scripts Edit).
- DB migrations: `npx wrangler d1 execute DB --file=schema/001_initial.sql`
- Build CSS (after changing Tailwind classes): the standalone Tailwind binary — see README "Build CSS" (`tailwindcss -c tailwind.config.cjs -i build/input.css -o public/css/tailwind.css --minify`). Not in CI; rebuild + commit public/css/tailwind.css when you add new utility classes.
- Tests: `node scripts/run-tests.mjs` (308 assertions across 10 suites — credibility, validate quality-gate, product-search faceting, reviews render-smoke, utils, affiliate-links, lib-pure, credibility-extra, prompts, llm)
- Coverage gate: `bash scripts/coverage.sh` (Node built-in V8 coverage, zero npm; ~99.9% line on the 14-module pure-logic layer)
- Integration tests (I/O modules, real D1/KV via Miniflare): `npx vitest run` (or `--coverage`). Specs in `test/integration/*.spec.js`, config in `vitest.config.js`. Needs `npm install` first (dev deps only).
- Output eval: `node scripts/run-eval.mjs` (golden-query honesty audit against the live site; `--spend` enqueues missing runs, ~$0.10 each)
- Real-world benchmark: `node scripts/run-real-world-eval.mjs` (expert-review ground truth in `eval/real-world-benchmark.json`; free audit of live pages)

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
- BRAVE_API_KEY — optional; Brave Search fallback when Serper is unavailable
- TAVILY_API_KEY — optional; Tavily LLM-tuned web search (selectable provider + fallback)
- SEARXNG_URL — optional; self-hosted SearXNG metasearch (blackbox `http://192.168.5.10:8095`).
  Set on the blackbox research-worker container env only (LAN-private; the CF edge can't
  reach it, so the `searxng` provider returns null there and degrades gracefully).
- JINA_API_KEY — optional; lifts Jina Reader's free rate cap for `read_page`
- AMAZON_ASSOCIATE_TAG — optional; `AMAZON_AFFILIATE_TAG` ([vars]) is the default tag
