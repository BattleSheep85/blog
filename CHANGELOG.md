# Changelog

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
