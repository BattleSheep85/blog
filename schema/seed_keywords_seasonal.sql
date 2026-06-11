-- TrueRank D1 Schema - seasonal flywheel seed keywords
-- ~60 hand-curated, high-intent, buyable seasonal queries layered on top of the
-- evergreen seed (seed_keywords.sql). INSERT OR IGNORE keeps this idempotent and
-- safe to re-run — the UNIQUE(keyword) constraint dedupes against anything
-- already in the queue. created_at = strftime('%s','now') (epoch seconds).
--
-- Seasonal priorities run HIGHER than evergreen so the flywheel drains timely,
-- high-converting deal/season intent first while the window is open:
--   95  Prime Day 2026 angle (mid-July) — deal-hunter intent, peak conversion.
--   88  Back-to-school (Aug-Sep) — dorm/student gear buying surge.
--   85  Summer (now) — outdoor/travel/yard tech.
--
-- IMPORTANT: every query is evergreen-compatible — a research engine can answer
-- it NOW from real reviews. No "today only" / live-price phrasings. The
-- "prime day 2026" and "under $X" framing simply captures deal-hunting search
-- traffic; the answer is a normal best-products comparison.

INSERT OR IGNORE INTO keyword_queue (keyword, priority, status, created_at) VALUES
-- ===== Prime Day 2026 (mid-July) — priority 95 =====
-- Explicit prime-day phrasings (capture deal-hunter searches)
('best wireless earbuds to buy on prime day 2026', 95, 'pending', strftime('%s','now')),
('best robot vacuum deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best noise cancelling headphones to buy on prime day 2026', 95, 'pending', strftime('%s','now')),
('best laptop deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best tv deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best air fryer deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best smartwatch deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best tablet deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best gaming laptop deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best kitchen appliance deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best fitness tracker deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best coffee maker deals prime day 2026', 95, 'pending', strftime('%s','now')),
('best vacuum cleaner deals prime day 2026', 95, 'pending', strftime('%s','now')),
-- Deal-priced "under $X" queries (rank for deal-hunting without live prices)
('best 65 inch tv under 800', 95, 'pending', strftime('%s','now')),
('best 55 inch tv under 500', 95, 'pending', strftime('%s','now')),
('best laptop under 700 for students', 95, 'pending', strftime('%s','now')),
('best 4k tv under 600', 95, 'pending', strftime('%s','now')),
('best smartwatch under 250', 95, 'pending', strftime('%s','now')),
('best tablet under 300', 95, 'pending', strftime('%s','now')),
('best headphones under 200', 95, 'pending', strftime('%s','now')),
('best fitness tracker under 150', 95, 'pending', strftime('%s','now')),
('best wireless earbuds under 80 for prime day', 95, 'pending', strftime('%s','now')),
('best robot vacuum under 250 for prime day', 95, 'pending', strftime('%s','now')),
('best laptop under 1000 for prime day', 95, 'pending', strftime('%s','now')),
('best air fryer under 120 for prime day', 95, 'pending', strftime('%s','now')),

-- ===== Back-to-school (Aug-Sep) — priority 88 =====
('best laptop for college students under 800', 88, 'pending', strftime('%s','now')),
('best laptop for college students under 500', 88, 'pending', strftime('%s','now')),
('best chromebook for students under 400', 88, 'pending', strftime('%s','now')),
('best backpack for high school', 88, 'pending', strftime('%s','now')),
('best backpack for college students', 88, 'pending', strftime('%s','now')),
('best laptop backpack with usb port under 60', 88, 'pending', strftime('%s','now')),
('best noise cancelling headphones for studying', 88, 'pending', strftime('%s','now')),
('best wireless earbuds for students under 60', 88, 'pending', strftime('%s','now')),
('best graphing calculator for high school', 88, 'pending', strftime('%s','now')),
('best scientific calculator for college under 30', 88, 'pending', strftime('%s','now')),
('best dorm room essentials under 100', 88, 'pending', strftime('%s','now')),
('best mini fridge for dorm under 150', 88, 'pending', strftime('%s','now')),
('best desk lamp for studying under 50', 88, 'pending', strftime('%s','now')),
('best desk setup for college students under 300', 88, 'pending', strftime('%s','now')),
('best printer for college students under 150', 88, 'pending', strftime('%s','now')),
('best tablet for taking notes in college under 400', 88, 'pending', strftime('%s','now')),
('best laptop stand for students under 40', 88, 'pending', strftime('%s','now')),
('best surge protector for dorm under 30', 88, 'pending', strftime('%s','now')),
('best mattress topper for dorm bed under 80', 88, 'pending', strftime('%s','now')),
('best storage bins for dorm organization under 50', 88, 'pending', strftime('%s','now')),

-- ===== Summer (outdoor / travel / yard) — priority 85 =====
('best portable fan for camping', 85, 'pending', strftime('%s','now')),
('best rechargeable fan for outdoors under 60', 85, 'pending', strftime('%s','now')),
('best cooler under 200', 85, 'pending', strftime('%s','now')),
('best electric cooler for car camping under 300', 85, 'pending', strftime('%s','now')),
('best travel power bank for flights under 50', 85, 'pending', strftime('%s','now')),
('best solar power bank for camping under 80', 85, 'pending', strftime('%s','now')),
('best portable bluetooth speaker for pool under 100', 85, 'pending', strftime('%s','now')),
('best waterproof speaker for beach under 150', 85, 'pending', strftime('%s','now')),
('best portable power station for camping under 500', 85, 'pending', strftime('%s','now')),
('best gps watch for hiking under 300', 85, 'pending', strftime('%s','now')),
('best action camera for travel under 300', 85, 'pending', strftime('%s','now')),
('best portable grill for camping under 200', 85, 'pending', strftime('%s','now')),
('best outdoor string lights for backyard under 60', 85, 'pending', strftime('%s','now')),
('best robot lawn mower under 1000', 85, 'pending', strftime('%s','now')),
('best portable air conditioner for bedroom under 400', 85, 'pending', strftime('%s','now'));
