# TrueRank: Honest Product Research Tool

## Problem

Product research online is broken. Search results are dominated by affiliate blogs regurgitating spec sheets, Amazon reviews are flooded with fakes, and "top 10" listicles are written by people who never touched the products. A consumer searching for "best NAS for homelab" has to wade through pages of garbage to find one honest opinion buried in a Reddit thread.

Claude (or any LLM) alone can summarize what it knows, but it can't verify its claims against current real-world user experiences, detect fake reviews, or weight sources by credibility.

## Solution

TrueRank is a web app that takes a product category as input and produces an honest, sourced comparison report by:

1. Searching the web for real user reviews and discussions
2. Analyzing each source for authenticity (filtering fakes, discounting affiliate-driven content)
3. Synthesizing surviving reviews into a ranked comparison with trust scores
4. Presenting results with affiliate links for monetization

## Users

- Consumers researching purchases (any category: electronics, tools, appliances, software)
- The kind of person who currently digs through Reddit threads and YouTube comments to find honest takes

## Core Features

### 1. Research Input
- Text input: user types a product category or specific comparison (e.g., "best budget mechanical keyboard" or "Synology vs QNAP for home media server")
- Optional filters: price range, use case, brand preferences/exclusions

### 2. Multi-Source Research Pipeline
The system searches and scrapes from multiple source types, weighted by credibility:

| Source Type | Trust Weight | Examples |
|-------------|-------------|----------|
| Independent review sites | High | RTINGS, Project Farm (YouTube), TechPowerUp |
| Community discussions | High | Reddit, specialized forums, HackerNews |
| Long-form YouTube reviews | Medium | Channels with hands-on testing methodology |
| Major review outlets | Medium | Wirecutter, Tom's Hardware (discount affiliate bias) |
| Marketplace reviews | Low (filtered) | Amazon, Best Buy (heavy fake detection applied) |
| Affiliate blogs | Excluded | "Top 10 Best X in 2026" SEO content |

### 3. Fake Review Detection Engine
Claude API analyzes each review/source for authenticity signals:

**Red flags (reduce trust score):**
- Generic superlative language without specifics ("absolutely love this product!")
- Reviewer posted many reviews in a short time window
- Review text matches patterns seen across "different" reviewers (review farms)
- Source website is primarily monetized through affiliate links
- No mention of actual usage duration, specific features used, or real-world context
- Suspiciously perfect grammar with no personality or voice
- Review appeared within days of product launch (likely seeded/incentivized)

**Green flags (increase trust score):**
- Mentions specific use case and duration ("been using this for 6 months for X")
- Discusses tradeoffs and negatives (not just positives)
- Reviewer has history of substantive reviews across different products
- Posted in community forums (Reddit, specialized forums) where there's no incentive
- Contains photos/evidence of actual ownership
- Responds to follow-up questions from other users

### 4. Report Generation
The final output is a structured comparison report:

- **Executive summary**: Quick verdict with top picks and reasoning
- **Product cards**: Each product with:
  - Trust score (based on quality/quantity of verified real reviews)
  - Pros/cons from real users (attributed to sources)
  - Price with affiliate link
  - Who it's best for
  - Key specs
- **Source transparency**: Every claim linked to its source, with the source's trust rating visible
- **Methodology note**: Brief explanation of how reviews were filtered

### 5. Affiliate Link Integration
- Amazon Associates links for products available on Amazon
- Best Buy, Newegg, Walmart affiliate programs as secondary
- Links are clearly labeled (no dark patterns)
- Affiliate relationship disclosed prominently
- Revenue comes from users who found the research valuable, not from steering recommendations

## Technical Architecture

### Stack (Zero Package Managers)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Frontend | Static HTML + CSS + JS | Vendored htmx, Tailwind via CDN |
| API Layer | Cloudflare Workers | Plain JavaScript, no npm |
| Database | Cloudflare D1 | SQLite, stores cached research and affiliate mappings |
| Key-Value Cache | Cloudflare KV | Session state, rate limiting, hot result cache |
| Background Processing | Cloudflare Queues + Workers | Heavy research jobs |
| AI Analysis (volume) | Claude Haiku 4.5 | Review scoring, fake detection ($1/$5 per MTok) |
| AI Synthesis | Claude Sonnet 4.6 | Final report writing ($3/$15 per MTok) |
| Web Research | Claude API web_search tool | $0.01/search, server-side, zero deps |
| Hosting | Cloudflare Pages | Static assets, auto-deploy from GitHub |

### Data Model (D1/SQLite)

**research_reports**: Cached completed reports
- id, query, filters_json, report_json, created_at, expires_at

**sources**: Individual review sources found during research
- id, report_id, url, source_type, trust_score, content_summary, is_fake, analysis_json

**products**: Products discovered during research
- id, name, category, specs_json, affiliate_links_json

**affiliate_clicks**: Click tracking for revenue analytics
- id, product_id, report_id, affiliate_network, clicked_at

### API Endpoints

```
POST /api/research      — Start a new research job
GET  /api/research/:id  — Get research status/results (SSE for live updates)
GET  /api/report/:id    — Get cached report
POST /api/feedback      — User feedback on report quality
```

### Research Pipeline Flow

```
User Input
    |
    v
[Search Phase] — Fan out 5-10 web searches across source types
    |
    v
[Scrape Phase] — Extract review content from top results
    |
    v
[Analysis Phase] — Claude analyzes each source:
    |               - Authenticity score
    |               - Key claims extracted
    |               - Bias indicators
    |
    v
[Filter Phase] — Remove fakes, discount biased sources
    |
    v
[Synthesis Phase] — Claude produces ranked comparison from surviving sources
    |
    v
[Enrichment Phase] — Add affiliate links, format report, cache in D1
    |
    v
[Delivery] — Stream report to user via SSE
```

## UI Design

### Homepage
- Clean, minimal search interface (think Google-simple)
- Example queries as suggestions
- "How it works" section below: 3-step visual (Search, Filter, Report)

### Research in Progress
- Live feed showing what the system is doing:
  - "Searching Reddit for 'mechanical keyboard reviews'..."
  - "Found 23 sources, analyzing authenticity..."
  - "Filtered 8 fake/low-quality reviews"
  - "Synthesizing report from 15 verified sources..."
- Progress bar or step indicator

### Report View
- Executive summary at top
- Product comparison cards in a grid
- Each card: product image, trust score badge, quick pros/cons, price + affiliate button
- Expandable sections for detailed analysis
- Source list with trust indicators (green/yellow/red)
- "View raw sources" toggle for transparency
- Share/bookmark capability
- Print-friendly layout

### Design Language
- Dark mode default (with light toggle)
- Clean typography (system fonts, no web font dependencies)
- Trust score uses a simple color scale (not gamified)
- Mobile-responsive (most product research happens on phones)
- No popups, no newsletter nags, no cookie walls beyond what's legally required

## Monetization

### Phase 1 (Launch)
- Amazon Associates (apply immediately, widest product coverage)
- Affiliate disclosure in footer and on each report

### Phase 2 (With Traffic)
- Best Buy, Newegg, Walmart affiliate programs
- Direct brand affiliate programs for specialized categories

### Phase 3 (Scale)
- Premium tier: more detailed reports, saved research history, comparison tools
- API access for power users or other tools

## Success Metrics

- Report quality: users find the research useful (feedback mechanism)
- Trust differentiation: users can see the difference vs. a basic Google search
- Affiliate conversion: click-through rate on product links
- Return usage: users come back for their next purchase decision

## Non-Goals (v1)

- User accounts / login (keep it simple, no auth complexity)
- User-generated reviews (we aggregate, not collect)
- Price tracking over time (future feature)
- Browser extension
- Mobile app (responsive web is fine)

## Risks

- **Web scraping reliability**: Sites change, block scrapers. Mitigation: use search APIs where possible, graceful degradation when scraping fails.
- **Claude API costs**: Each research job makes multiple API calls. Mitigation: aggressive caching in D1, rate limiting per IP.
- **Affiliate program approval**: Amazon Associates requires a site with content. Mitigation: launch with sample reports pre-generated.
- **Review source quality**: Some sources may be unreachable or paywalled. Mitigation: always disclose how many sources were successfully analyzed.
