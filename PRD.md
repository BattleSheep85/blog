# TrueRank: Honest Product Research Tool

> **Revised 2026-06-12.** This document was updated to describe the system as
> actually shipped. The headline change: v1 does NOT do per-review fake-review
> detection (reviewer-history analysis, review-farm pattern matching). What
> shipped is a deterministic **source-genre credibility engine** — see §3 —
> which scores and discounts whole sources by evidence type and conflict of
> interest, and never ingests marketplace reviews at all. Review-level
> authenticity analysis is scoped as a future phase (§3b). The accounts
> non-goal also graduated (2026-06-12).
>
> **Stale model references (read this):** sections below still describe a
> Claude haiku/sonnet/opus tiered stack and multi-tier depth modes. That is
> historical. The shipped stack collapsed to ONE config (2026-06-16) on
> Gemini + GPT-5.4-mini via OpenRouter. `CLAUDE.md` is the authoritative,
> always-current description of models, search providers, and tiers — where it
> and this PRD disagree, `CLAUDE.md` wins.

## Problem

Product research online is broken. Search results are dominated by affiliate blogs regurgitating spec sheets, Amazon reviews are flooded with fakes, and "top 10" listicles are written by people who never touched the products. A consumer searching for "best NAS for homelab" has to wade through pages of garbage to find one honest opinion buried in a Reddit thread.

Claude (or any LLM) alone can summarize what it knows, but it can't verify its claims against current real-world user experiences, detect fake reviews, or weight sources by credibility.

## Solution

TrueRank is a web app that takes a product category as input and produces an honest, sourced comparison report by:

1. Searching the web for real user reviews and discussions
2. Scoring each source's credibility by evidence genre (hands-on testing,
   expert outlet, community discussion) and conflict of interest (affiliate
   monetization, listicle format, manufacturer marketing), then discounting
   conflicted sources — never using them as the sole basis for a claim
3. Synthesizing the weighted evidence into a ranked comparison, with conflicts
   disclosed in the verdicts
4. Presenting results with clearly-labeled affiliate links for monetization

The conflict-of-interest model is symmetric and resolves an ambiguity in the
original draft of this document: **undisclosed**-conflict sources are the
enemy; **disclosed**-conflict research pages (ours, Wirecutter's) are
legitimate. TrueRank's own pages carry prominent commission disclosure and
follow the same standard the credibility engine applies to its inputs.

## Users

- Consumers researching purchases (any category: electronics, tools, appliances, software)
- The kind of person who currently digs through Reddit threads and YouTube comments to find honest takes

## Core Features

### 1. Research Input
- Text input: user types a product category or specific comparison (e.g., "best budget mechanical keyboard" or "Synology vs QNAP for home media server")
- Optional filters: price range, use case, brand preferences/exclusions

### 2. Multi-Source Research Pipeline
The system searches and scrapes from multiple source types, weighted by credibility:

| Source Type | Trust Weight (as shipped) | Examples |
|-------------|--------------------------|----------|
| Hands-on testing evidence | +25 | RTINGS, Project Farm (YouTube), "we tested" content |
| Expert review domains | +15 | Wirecutter, Tom's Hardware, RTINGS (allowlisted; affiliate penalty still applies on top) |
| Community discussions | +5 | Reddit, specialized forums, HackerNews |
| Manufacturer content | −15 | Brand sites, press releases |
| Listicle-format content | −30 | "Top 10 Best X in 2026" titles |
| Affiliate-conflicted sources | −45 | Pages monetized through undisclosed affiliate links |
| Marketplace reviews | **Not ingested** | Amazon/Best Buy star reviews never enter the evidence pool — exclusion by non-ingestion, not by detection |

Scores start at 50, are clamped to 0–100, and tag the source (e.g.
`[hands-on]`, `[affiliate-conflict]`) so the synthesis layer sees the verdicts.
Penalties are **discounts, not exclusions**: a conflicted source can support a
claim only alongside a non-conflicted corroborating source, and the conflict
must be named in the verdict. Only recency violations hard-drop a source.

### 3. Source Credibility Engine (as shipped)
A deterministic scorer (`worker/lib/credibility.js`) classifies every search
result by URL, title, and (after fetch) full text:

- **Affiliate-conflict detection**: known affiliate-redirect domains, tag
  parameters, and link-density heuristics on page content
- **Listicle detection**: title-pattern matching for SEO roundup formats
- **Hands-on detection**: first-person testing language and methodology markers
- **Domain priors**: allowlists for expert outlets and community platforms

Scoring runs twice: at snippet time (URL + title — triages which sources are
worth the limited fetch budget) and again on full text after every fetch. The
synthesis prompt subordinates LLM sentiment to these deterministic tags: the
planner model is known to be credulous, so tags outrank note sentiment, and
verdicts must disclose conflicts.

### 3b. Review-Level Authenticity Analysis (future, NOT in v1)
The original draft of this section described per-review fake detection —
reviewer posting history, review-farm text matching, seeded-review timing.
**None of that shipped, and none of it is currently planned.** It would
require ingesting marketplace reviews (which v1 deliberately does not do) and
reviewer-graph data we have no source for. If it is ever built, it gets its
own phase with its own eval. Until then, no TrueRank surface should claim
"fake review detection."

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
| Frontend | Static HTML + CSS + JS | Prebuilt Tailwind (standalone binary), no runtime deps |
| API Layer | Cloudflare Workers | Plain JavaScript, no npm |
| Database | Cloudflare D1 | SQLite: research, products, clicks, users, keyword queue |
| Key-Value Cache | Cloudflare KV | Page cache, rate limiting, budget counter, progress feeds |
| Background Processing | Cloudflare Queues + cron | Research jobs, reaper, SEO flywheel, re-research sweep |
| Classifier | gemini-2.5-flash-lite (OpenRouter) | Facets, rejection, clarifying questions, Amazon-viability |
| Planner / agent loop | gemini-2.5-flash (OpenRouter) | Search planning + note-taking (known credulous — subordinated to deterministic credibility tags) |
| Synthesis | haiku-4.5 (instant) / sonnet-4.6 (full) / opus-4.8 no-reasoning (exhaustive) | Tier configs in worker/lib/tiers.js; opus-4.8 chosen on BullshitBench BS-detection |
| Web Research | Serper.dev + HN Algolia + DuckDuckGo + RSS + Jina Reader | Provider fan-out in worker/engine/tools.js |
| Hosting | Cloudflare Workers routes on chrisputer.tech | Worker-first so HTML gets per-request CSP nonces |

Spend is governed by a hard monthly cap (`MONTHLY_BUDGET_USD`, default $60):
each run's real cost accrues to a KV counter and new paid work refuses at the
cap.

### Data Model (D1/SQLite, as shipped — schema/003+)

**research**: Permanent research rows, server-rendered at /research/:slug
- id, slug, query, canonical_query, status, tier, category, facets,
  clarifications, summary, result (JSON), sources (JSON with per-source
  credibility tags), cost_usd, synth_model, view_count, timestamps

**products**: Ranked items per research run
- id, research_id, name, brand, price, rating, image_url, product_url,
  affiliate_url, pros/cons/specs (JSON), verdict, rank, best_for, metadata

**affiliate_clicks / guide_clicks**: Click tracking for revenue analytics

**users / sessions / user_searches**: Accounts + per-user search history (2026-06-12)

**keyword_queue**: Programmatic-SEO flywheel queue

(The original draft's `sources.is_fake` column belonged to the unbuilt
review-level authenticity engine and does not exist in the current schema.)

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

- Report accuracy: periodic golden-query eval (eval/golden-queries.json) —
  does the top pick land in the known-good set, is the conflict disclosure
  present, are minimum source/product thresholds met
- Report quality: users find the research useful (feedback mechanism)
- Trust differentiation: users can see the difference vs. a basic Google search
- Affiliate conversion: click-through rate on product links
- Distribution health: Google index coverage of /research pages (the flywheel
  bet is falsified if scaled-content policy suppresses them)
- Return usage: users come back for their next purchase decision

## Non-Goals (v1)

- ~~User accounts / login~~ — **graduated 2026-06-12**: lightweight
  email/password accounts shipped (PBKDF2 via WebCrypto, zero deps) to power
  per-user search history; still no OAuth, profiles, or social features
- User-generated reviews (we aggregate, not collect)
- Review-level fake detection (see §3b — explicitly out of scope until it has
  its own phase and eval)
- Price tracking over time (future feature)
- Browser extension
- Mobile app (responsive web is fine)

## Risks

- **Web scraping reliability**: Sites change, block scrapers. Mitigation: use search APIs where possible, graceful degradation when scraping fails.
- **Claude API costs**: Each research job makes multiple API calls. Mitigation: aggressive caching in D1, rate limiting per IP.
- **Affiliate program approval**: Amazon Associates requires a site with content. Mitigation: launch with sample reports pre-generated.
- **Review source quality**: Some sources may be unreachable or paywalled. Mitigation: always disclose how many sources were successfully analyzed.
