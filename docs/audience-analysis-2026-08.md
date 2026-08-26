# Audience analysis: is there a human buyer behind the traffic?

Date: 2026-08-03. Data source: production D1, read-only queries. Window: all `affiliate_clicks` rows, 2026-06-11 to 2026-08-02.

## Headline

Yes, there is a small human audience. It is roughly 60 to 82 people, not more. Most of the raw click volume in the database is not them. It is crawlers and IP-rotating bots. The owner's "solution in search of a problem" read is correct for scale, but not for existence: a few dozen real people did find specific reports and click through to Amazon. The site has not found a market. It has found a handful of individual buyers.

## 1. Clicks per address

`affiliate_clicks` has 5,191 rows from 109 distinct `ip_hash` values.

| Clicks per address | Addresses | Total clicks |
|---|---|---|
| 1 | 75 | 75 |
| 2 to 5 | 11 | 25 |
| 6 to 20 | 4 | 37 |
| 21 to 100 | 8 | 294 |
| 100+ | 11 | 4,760 |

Eleven addresses made 4,760 of the 5,191 clicks (92 percent). Top 10 by volume:

| ip_hash | Clicks | Distinct reports | First click | Last click |
|---|---|---|---|---|
| eab1ad126d49a750 | 824 | 211 | 2026-06-21 00:52:10 | 2026-06-21 00:54:16 |
| e9064f9f0e196d1c | 757 | 125 | 2026-06-29 21:09:56 | 2026-06-29 21:14:37 |
| fe04609f5d83b8db | 715 | 207 | 2026-06-21 19:25:13 | 2026-06-21 19:29:17 |
| 056741f57ba23968 | 542 | 175 | 2026-06-21 00:46:42 | 2026-06-21 00:48:08 |
| 66bcc0f674e9610c | 467 | 127 | 2026-07-03 13:26:17 | 2026-07-03 13:26:59 |
| b384a661808391a2 | 292 | 92 | 2026-06-21 00:59:24 | 2026-06-21 01:01:01 |
| 22614abdc2319618 | 291 | 81 | 2026-07-03 13:38:20 | 2026-07-03 13:38:46 |
| 933bf9ef6b5b6434 | 271 | 101 | 2026-06-22 02:02:50 | 2026-06-22 02:03:50 |
| 8eb3fa4196650c5a | 264 | 88 | 2026-06-22 03:01:52 | 2026-06-22 03:06:11 |
| 6f956cd900bfcc15 | 176 | 23 | 2026-06-29 20:54:29 | 2026-06-29 20:55:24 |

Each of these hits 20 to 211 different reports in a two-to-five minute window. No shopper reads and buys from 211 different product pages in two minutes. This is a link-harvesting crawler, not a person.

## 2. Defining the human cohort

**Cut-off used:** an address is human-shaped if either (a) it made exactly one click in the whole four-month window, or (b) it made two to ten clicks with the first and last click more than one hour apart. Everything else (bursts of many clicks in the same second or minute, or spans that still carry 20+ distinct reports) is treated as automated.

This gives a naive cohort of **82 addresses, 101 clicks**: 75 one-click addresses plus 7 multi-click addresses whose visits are spread over days to weeks (examples: one address clicked mesh-wifi then, 12 days later, a sedan report; another touched five unrelated categories, keyboards to tires to bulbs, across 12 days).

**But this cohort still hides a second bot pattern.** Checking for same-report clustering (multiple different one-click addresses hitting the *same* report within a 24-hour window) removes 41 of the 101 clicks. Those look like an IP-rotating crawler that spreads its hits across many source addresses instead of one, which defeats a same-IP burst check but is still not a person: five different addresses hit the same robot-vacuum report inside four hours; five different addresses hit the same mesh-wifi report inside one afternoon; four different addresses hit the same mouse-trap report inside three hours; and so on.

**Refined human cohort: 60 clicks, no two of which land on the same report within 24 hours.** This is the number I trust. It spans 57 distinct reports, June 12 to August 2 (a full 51-day range with no gap longer than about a week), and no repeat pattern that looks scripted.

So: 82 candidate addresses on the loose definition, **60 isolated events that hold up under a same-report clustering check.** Call the real number "on the order of 60."

## 3. What the human-shaped cohort clicked

Isolated cohort (60 clicks), by category, ranked:

| Category | Isolated human clicks |
|---|---|
| mechanical keyboards | 6 |
| (uncategorized / test report) | 4 |
| photo and video backup | 2 |
| wireless earbuds | 2 |
| IEM foam tips | 2 |
| noise cancelling headphones | 2 |
| home NAS devices | 2 |
| 14 other categories | 1 each |

No category dominates. The one repeat winner, mechanical keyboards, is also the site's single largest category by report count (19 reports), so 6 clicks out of 60 is proportionate to its size, not a sign of special demand. Query shape is narrow-intent and price-qualified almost every time: "best mechanical keyboard for programming," "best air fryer for a family of four," "best nas for plex under $600," "tires for my 2010 mazda 3." These read like real people with a specific purchase in mind, not test data.

## 4. Timing

Isolated human cohort, by day of week (Monday = 0):

| Day | Clicks |
|---|---|
| Mon | 3 |
| Tue | 2 |
| Wed | 4 |
| Thu | 4 |
| Fri | 18 |
| Sat | 19 |
| Sun | 10 |

78 percent of isolated human clicks (47 of 60) land on Friday, Saturday, or Sunday. By hour of day, clicks concentrate from 17:00 to 23:00 (31 of 60, 52 percent), with a smaller cluster overnight (00:00 to 04:00, 10 of 60) that is consistent with a second, later time zone rather than a flat distribution.

Compare the full, bot-dominated table: clicks spike hard at four specific hours (00:00, 13:00, 19:00, and 21:00, each with 700+ hits) and on only two days (Sunday 2,530, Monday 1,641 out of 5,191). That is not a weekly shopping rhythm. It is a small number of scheduled or repeated crawl runs.

## 5. Do views and clicks agree

Top 20 reports by `view_count`, against distinct clicking addresses (all addresses, not filtered to the human cohort, since this check is about the reliability of `view_count` itself):

| Views | Distinct clickers | Total clicks | Category | Query |
|---|---|---|---|---|
| 333 | 22 | 87 | IEM foam tips | Best foam tips for IEMs |
| 262 | 16 | 81 | mesh wifi systems | best mesh wifi |
| 238 | 6 | 31 | Noise-Cancelling Over-Ear Headphones | best noise cancelling over-ear headphones under 300 2026 |
| 197 | 15 | 62 | standing desks | best standing desk 2026 |
| 161 | 14 | 85 | home NAS devices | best home NAS for 2026 |
| 130 | 0 | 0 | tax preparation software | best tax software for self employed |
| 116 | 11 | 47 | Mesh Wi-Fi Systems | best mesh wifi system 2026 |
| 111 | 8 | 22 | mechanical keyboards | best mechanical keyboards 2026 unique test 4829 |
| 103 | 8 | 51 | mechanical keyboards | best mechanical keyboard under 150 2026 |
| 100 | 8 | 38 | portable bluetooth speakers | best portable bluetooth speaker under 150 2026 |
| 100 | 0 | 0 | Credit Report Dispute Services | Credit report Dispute Service |
| 96 | 3 | 20 | running shoes | best running shoes 2026 stability trainer |

(remaining 8 of the top 20 follow the same pattern and are omitted for space)

The rank order of views and total clicks agrees reasonably well. That is expected, because both counters are being driven by the same crawler traffic. The two exceptions, tax preparation software (130 views) and credit report dispute services (100 views), get zero clicks of any kind, human or bot, because those reports carry no Amazon product links. `view_count` tracks page loads, including bot page loads, and is not a usable proxy for buyer interest on its own. It has to be read alongside the click and cohort data, not instead of it.

## 6. What is not selling

Report counts by category (top entries) against isolated human clicks:

| Category | Reports published | Isolated human clicks |
|---|---|---|
| mechanical keyboards | 19 | 6 |
| smart light bulbs | 14 | 0 |
| wireless earbuds | 10 | 2 |
| robot vacuums | 8 | 0 |
| noise cancelling headphones | 8 | 2 |
| mesh wifi systems | 8 | 0 |
| smart bulbs | 6 | 1 |
| standing desks | 5 | 1 |
| home NAS devices | 5 | 2 |
| ergonomic office chairs | 5 | 0 |

Smart light bulbs is the second-largest category on the site by report count and produced zero isolated human clicks. Robot vacuums and mesh wifi systems each got several clicks in the naive count, but every one of those clicks turned out to be part of a same-report cluster (multiple different addresses hitting one report within hours), so the honest isolated-human count for both is zero. Ergonomic office chairs is the same story.

The two non-Amazon categories checked in Section 5, tax preparation software and credit report dispute services, get zero clicks from bots or humans. That confirms the owner's existing understanding: non-Amazon categories earn nothing on this site, because there is no product link to click.

## 7. Clicks most likely to have converted

All `affiliate_clicks` rows use the `amazon` network. There is no other network in the data, so this section is the isolated human cohort itself: 60 clicks, each on a report the address touched only once, with no other address hitting that report within 24 hours. Full list (clicked_at, category, query) for the owner to check against the Associates dashboard by eye:

```
2026-06-12 18:24:41 | standing desks for dual monitors | best standing desk for dual monitors
2026-06-12 18:33:49 | air fryer deals | best air fryer deals prime day 2026
2026-06-14 17:45:36 | pet grooming scissors | best scissors for cutting mats out of pet fur
2026-06-18 20:19:28 | photo and video backup | best photo and video backup software or appliance
2026-06-19 19:05:22 | Bulk Ethernet Cable | Cheapest 500ft Cat5e outdoor UTP unshielded cable
2026-06-19 20:17:11 | mechanical keyboards | best budget mechanical keyboard under $100
2026-06-19 22:13:03 | wireless mice | best wireless mouse for productivity
2026-06-19 22:23:37 | wireless earbuds | best wireless earbuds 2026
2026-06-22 03:56:31 | smart bulbs | matter by thread smart bulbs
2026-06-23 17:57:30 | full layout mechanical keyboard kits | best full layout 100% barebones mechanical keyboard kit
2026-06-25 15:31:36 | security cameras | 8mp or greater security camera
2026-06-26 19:05:21 | IEM foam tips | Best foam tips for IEMs
2026-06-26 19:24:53 | standing desks | best standing desk 2026
2026-06-26 22:33:28 | mechanical keyboards | full sized 100% keyboard with hotswapable switches
2026-06-26 22:55:38 | mechanical keyboards under $150 | best mechanical keyboard under 150
2026-06-27 02:12:20 | iphone 16 pro phone cases | best phone case for iphone 16 pro
2026-06-27 02:42:16 | noise cancelling headphones | best noise cancelling headphones 2026
2026-06-27 11:30:18 | men's shirts | best men's shirts for hot humid weather
2026-06-27 12:18:43 | fitness trackers | best fitness tracker under 150
2026-06-27 15:09:55 | photo and video backup | best photo and video backup software or appliance
2026-06-27 16:09:03 | sports smartwatches for running | Apple Watch vs Garmin for marathon training
2026-06-28 02:46:35 | Air fryer under $100 | best air fryer under $100
2026-07-01 13:53:27 | (no query) |
2026-07-03 22:57:43 | Best wireless gaming headset under $150 | best wireless gaming headset under $150
2026-07-03 23:28:19 | NAS for Plex | best nas for plex under $600
2026-07-04 01:16:53 | wireless earbuds | best wireless earbuds for students under 60
2026-07-10 01:36:16 | Olive oil | best olive oil
2026-07-10 22:53:57 | robot vacuums | best robot vacuum under $300
2026-07-11 00:33:08 | gaming headsets | best gaming headset under $100
2026-07-11 17:52:55 | NAS for photographers | best nas for photographers
2026-07-11 21:44:18 | air fryers | best air fryer for a family of four
2026-07-12 01:52:10 | computer storage | best ssd brands
2026-07-12 02:03:30 | TV antennas | best tv antenna
2026-07-12 02:13:05 | nasal sprays | best nasal spray
2026-07-12 08:25:00 | noise cancelling headphones | best noise cancelling headphones for flights
2026-07-15 20:18:06 | water jugs | best water jug 2026
2026-07-16 21:32:21 | winter national parks | best national parks to visit in winter
2026-07-17 04:08:51 | IEMs (In-Ear Monitors) | The highest accuracy IEMs for un 100
2026-07-17 09:58:39 | wifi 6 routers | best wifi 6 router under $150
2026-07-18 09:11:35 | IEM foam tips | Best foam tips for IEMs
2026-07-18 10:24:36 | backpack coolers | best backpack cooler
2026-07-18 10:32:47 | mechanical keyboards | best mechanical keyboards 2026 unique test 4829
2026-07-18 11:45:03 | (no query) |
2026-07-20 20:34:43 | backpack sprayers | best backpack sprayer
2026-07-21 19:42:17 | 3D printers | 3d printer under $600
2026-07-23 17:15:56 | mechanical keyboards | best mechanical keyboard for programming
2026-07-24 17:48:56 | Mazda 3 tires | tires for my 2010 mazda 3
2026-07-24 23:49:43 | military boots | army boots with strong shank for heavy loads
2026-07-25 06:33:58 | Prime Day deals | best prime day deals
2026-07-25 06:43:28 | Best dishwashers 2026 | best dishwashers 2026
2026-07-25 07:02:02 | streaming microphones | best usb microphone for streaming
2026-07-25 08:29:08 | mechanical keyboards | best mechanical keyboard for programming
2026-07-25 08:47:57 | Best GaN charger for laptop under $60 | best gan charger for laptop under $60
2026-07-26 21:17:29 | home NAS devices | best home NAS for 2026
2026-07-27 12:31:52 | mechanical keyboards | best mechanical keyboard under 100
2026-07-29 19:56:32 | hiking boots | hiking boot, 10.5 in 4e, 270lb man
2026-07-29 22:46:15 | (no query) |
2026-08-02 20:32:37 | home NAS devices | best home nas 2026
2026-08-02 21:12:56 | (no query) |
2026-08-02 23:21:42 | workout earbuds | best earbuds for working out under $60
```

These figures do not include Amazon's own conversion or commission data. That data lives only in the owner's Associates dashboard.

## Conclusion

**Is there a real human audience, and how big.** Yes, but it is small: on the order of 60 isolated, plausibly human clicks over 51 days, from a traffic base of 5,191 total clicks and 22,406 total page views. That is roughly 1 percent of recorded clicks. Google Search Console shows 139 impressions and 0 clicks over four months at an average position of 59.7, meaning almost none of these 60 people arrived from a Google search result. They arrived some other way (direct link, referral, or a search engine and query pair GSC does not track at this position). The sample is too small and the referral path is too undocumented in this database to say more about how they found the site.

**What they have in common.** No single category or price band stands out. The 60 clicks spread across 57 different reports and roughly 40 different categories, with mechanical keyboards appearing most often (6 clicks) only because it is also the largest category on the site (19 of 687 reports). Query shape is consistently narrow and specific: a size, a budget, a use case, a compatible ecosystem. Timing is the one real pattern: 78 percent of these clicks land on Friday, Saturday, or Sunday, and just over half land between 17:00 and 23:00, consistent with people browsing on personal time rather than a script running on a schedule.

**Does this support or contradict "a solution in search of a problem."** It supports it. Sixty isolated human clicks across two months, no repeat visitors buying more than once, no category or price band with concentrated demand, and zero organic search clicks from Google, is not a market. It is a trickle of individuals who each found one specific report useful once. The "couple bucks in sales" and "solution in search of a problem" statements are not in tension. Both are true. There are a few real buyers. There are not enough of them, and not enough repeat behavior among them, to call this an audience with unmet demand waiting to be served. If the owner wants a stronger read, the missing piece is the Associates dashboard: matching the 60 timestamps above against actual commission events would confirm whether even this small human cohort converts at all.
