# GSC "Request Indexing" queue

Manual nudge for Google to crawl the `/research/` content pages (the homepage is
already indexed; deep content pages are not — that's the 0-organic root cause,
internal-links fix already shipped 2026-07-01).

## How (desktop, ~5 min/batch)
1. https://search.google.com/search-console → property **`chrisputer.tech`** (Domain)
2. Top **URL inspection** bar → paste a URL → wait → click **Request Indexing**
3. Repeat. Daily quota ~10–12 URLs per property.

Expected first status: *"URL is not on Google"* → after click → *"Indexing requested."*
If any shows a **crawl error** (redirect/blocked/404) instead, flag it — that's a code bug.

## Batch 1 (highest views + commercial intent) — do first
- [ ] https://chrisputer.tech/research/best-standing-desk-2026-5b487953
- [ ] https://chrisputer.tech/research/best-mesh-wifi-4c83a2dd
- [ ] https://chrisputer.tech/research/best-home-nas-for-2026-ae995547
- [ ] https://chrisputer.tech/research/best-noise-cancelling-over-ear-headphones-under-300-2026-2cc7e0e0
- [ ] https://chrisputer.tech/research/best-mechanical-keyboard-under-150-2026-63e7343d
- [ ] https://chrisputer.tech/research/best-portable-bluetooth-speaker-under-150-2026-37142d43
- [ ] https://chrisputer.tech/research/best-tax-software-for-self-employed-9b2ae2c2
- [ ] https://chrisputer.tech/research/best-home-security-camera-system-2026-ea36c9aa
- [ ] https://chrisputer.tech/research/best-running-shoes-2026-stability-trainer-a4778204
- [ ] https://chrisputer.tech/research/best-foam-tips-for-iems-4d0e6d9b

## Next batches
Ask Claude to generate Batch 2+ (ranked by view_count from D1) when Batch 1 is done.
Timeline: re-crawl → indexing is days–2 weeks, not instant.
