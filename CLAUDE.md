# TrueRank — Honest Product Research Tool

## Overview
Product research web app that scrapes real reviews, filters out fakes/affiliate garbage,
and produces honest comparison reports. Monetized via affiliate links (Amazon Associates, etc.).

## Stack (ZERO package managers)
- **Frontend**: Static HTML/CSS/JS, vendored htmx, Tailwind via CDN
- **API**: Cloudflare Workers (plain JS, no npm)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV
- **Background jobs**: Cloudflare Queues
- **AI**: OpenRouter free models via fetch() (DeepSeek R1 for analysis, Qwen 3.6 Plus for writing)
- **Search**: Reddit JSON API (free), HN Algolia (free), Serper.dev (2500 free)
- **Deployment**: GitHub (private) → Cloudflare Pages + Workers

## Key Constraint
NO package managers. No npm, pip, cargo, etc. All dependencies vendored or loaded via CDN.
Supply chain security is a hard requirement.

## Commands
- Local dev: `npx wrangler dev` (wrangler is the only CLI tool, used ad-hoc not as a dependency)
- Deploy: Push to main → Cloudflare auto-deploys
- DB migrations: `npx wrangler d1 execute DB --file=schema/001_initial.sql`

## Architecture
- `/public/` — Static frontend files (served by Cloudflare Pages)
- `/worker/` — Cloudflare Worker source (plain JS)
- `/worker/lib/` — Shared utilities (llm.js, search.js, db.js, rate-limit.js)
- `/worker/pipeline/` — Research pipeline (search, analyze, synthesize, affiliate, orchestrator)
- `/worker/handlers/` — HTTP route handlers (research, report, affiliate)
- `/schema/` — D1 database migrations
- `/vendor/` — Vendored JS libraries (htmx)

## Secrets (set via wrangler secret put)
- OPENROUTER_API_KEY — free tier, no credit card needed
- SERPER_API_KEY — optional, 2500 free Google searches
- AMAZON_ASSOCIATE_TAG — affiliate tracking tag
