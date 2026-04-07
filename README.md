# TrueRank

Honest product research. We scrape real reviews from Reddit, forums, and independent sites, filter out fakes, and give you a sourced comparison report.

## What it does

1. You type a product query (e.g. "best NAS for home media server")
2. TrueRank searches Reddit, HackerNews, and Google for real user reviews
3. AI analyzes each source for authenticity, flags fakes and affiliate bait
4. You get a ranked comparison with trust scores, pros/cons from real users, and links to buy

## Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Frontend | Static HTML + vendored htmx + Tailwind CDN | Free |
| API | Cloudflare Workers (plain JS) | $5/mo |
| Database | Cloudflare D1 (SQLite) | Free tier |
| Cache | Cloudflare KV | Free tier |
| Background jobs | Cloudflare Queues | Free tier |
| AI (analysis) | DeepSeek R1 via OpenRouter | Free |
| AI (writing) | Qwen 3.6 Plus via OpenRouter | Free |
| Search | Reddit JSON API + HN Algolia + Serper.dev | Free |

Zero package managers. No npm, no pip, no cargo. All JS dependencies are vendored.

## Setup

### Prerequisites

- Cloudflare account (paid Workers plan, $5/mo)
- OpenRouter account (free, no credit card)
- Serper.dev account (optional, 2500 free searches)
- Amazon Associates account (for affiliate links)

### Deploy

```bash
# 1. Create Cloudflare resources
npx wrangler d1 create truerank-db
npx wrangler kv namespace create KV
npx wrangler queues create truerank-research
npx wrangler queues create truerank-dlq

# 2. Update wrangler.toml with the IDs from step 1

# 3. Run database migration
npx wrangler d1 execute truerank-db --file=schema/001_initial.sql

# 4. Set secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SERPER_API_KEY        # optional
npx wrangler secret put AMAZON_ASSOCIATE_TAG

# 5. Deploy
npx wrangler deploy
```

### Local development

```bash
npx wrangler dev
```

## Architecture

```
public/              Static frontend (served by Cloudflare Pages/Assets)
  index.html         Homepage with search
  report.html        Report viewer
  js/app.js          Search, SSE, report rendering
  js/report.js       Permalink report loader
  css/app.css        Custom styles
  vendor/htmx.min.js Vendored htmx 2.0.8

worker/              Cloudflare Worker (API + Queue consumer)
  index.js           Router + queue handler
  handlers/          HTTP route handlers
  pipeline/          Research pipeline (search → analyze → synthesize → enrich)
  lib/               Shared utilities (LLM client, search, DB, rate limiting)

schema/              D1 database migrations
```

## Research pipeline

```
User query
  → Search Reddit, HN, Google for real reviews
  → AI extracts products and review content from raw results
  → AI scores each source for authenticity (fake detection)
  → Filter out fakes and low-trust sources
  → AI synthesizes surviving sources into ranked comparison
  → Inject affiliate links
  → Cache and deliver report
```

## Configuration

Secrets (set via `wrangler secret put`):
- `OPENROUTER_API_KEY` — free tier, no credit card needed
- `SERPER_API_KEY` — optional, 2500 free Google searches
- `AMAZON_ASSOCIATE_TAG` — your Amazon Associates tracking tag

Environment variables (in `wrangler.toml`):
- `RATE_LIMIT_MAX` — max research jobs per IP per window (default: 5)
- `RATE_LIMIT_WINDOW_SECONDS` — rate limit window (default: 3600)
- `CACHE_TTL_SECONDS` — how long to cache reports (default: 86400)

## License

MIT
