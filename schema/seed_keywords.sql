-- TrueRank D1 Schema - flywheel seed keywords
-- ~120 hand-curated, high-intent, buyable queries for the programmatic-SEO
-- flywheel (migration 006). INSERT OR IGNORE keeps this idempotent and safe to
-- re-run — the UNIQUE(keyword) constraint dedupes against anything already in
-- the queue. created_at = strftime('%s','now') (epoch seconds).
--
-- Priorities:
--   80-90  niches with an existing static guide (mechanical keyboards, NAS,
--          earbuds) — pages here cross-link to proven content, so they rank
--          and convert first.
--   60-75  high-volume adjacent affiliate niches.
--   50     default (long-tail / lower-confidence intent).

INSERT OR IGNORE INTO keyword_queue (keyword, priority, status, created_at) VALUES
-- Mechanical keyboards (existing guide) — priority 80-90
('best mechanical keyboard under $100', 90, 'pending', strftime('%s','now')),
('best mechanical keyboard under $50', 88, 'pending', strftime('%s','now')),
('best wireless mechanical keyboard under $150', 85, 'pending', strftime('%s','now')),
('best mechanical keyboard for programming', 84, 'pending', strftime('%s','now')),
('best mechanical keyboard for gaming under $120', 83, 'pending', strftime('%s','now')),
('best quiet mechanical keyboard for office', 82, 'pending', strftime('%s','now')),
('best 60 percent mechanical keyboard under $100', 80, 'pending', strftime('%s','now')),
('best hot swappable mechanical keyboard under $100', 80, 'pending', strftime('%s','now')),

-- NAS (existing guide) — priority 80-90
('best NAS for home media server under $500', 90, 'pending', strftime('%s','now')),
('best NAS for Plex under $600', 88, 'pending', strftime('%s','now')),
('best 2 bay NAS for home backup', 85, 'pending', strftime('%s','now')),
('best 4 bay NAS under $800', 84, 'pending', strftime('%s','now')),
('best budget NAS under $300', 83, 'pending', strftime('%s','now')),
('best NAS for photographers', 81, 'pending', strftime('%s','now')),
('best NAS hard drives for 24/7 use', 80, 'pending', strftime('%s','now')),

-- Earbuds (existing guide) — priority 80-90
('best wireless earbuds under $100', 90, 'pending', strftime('%s','now')),
('best noise cancelling earbuds under $150', 88, 'pending', strftime('%s','now')),
('best earbuds for running under $80', 85, 'pending', strftime('%s','now')),
('best wireless earbuds for small ears', 84, 'pending', strftime('%s','now')),
('best earbuds for working out under $60', 83, 'pending', strftime('%s','now')),
('best cheap wireless earbuds under $50', 82, 'pending', strftime('%s','now')),
('best earbuds for phone calls under $120', 81, 'pending', strftime('%s','now')),
('best open ear earbuds for running', 80, 'pending', strftime('%s','now')),

-- Monitors — priority 70-75
('best 4k monitor under $400', 75, 'pending', strftime('%s','now')),
('best gaming monitor under $300', 74, 'pending', strftime('%s','now')),
('best ultrawide monitor under $500', 72, 'pending', strftime('%s','now')),
('best monitor for programming under $350', 71, 'pending', strftime('%s','now')),
('best 1440p 144hz monitor under $300', 70, 'pending', strftime('%s','now')),
('best budget monitor under $150', 70, 'pending', strftime('%s','now')),
('best portable monitor for laptop under $200', 68, 'pending', strftime('%s','now')),

-- Routers / mesh wifi — priority 70-75
('best mesh wifi system under $200', 75, 'pending', strftime('%s','now')),
('best wifi 6 router under $150', 74, 'pending', strftime('%s','now')),
('best mesh wifi for large house under $400', 72, 'pending', strftime('%s','now')),
('best budget router under $80', 70, 'pending', strftime('%s','now')),
('best gaming router under $250', 69, 'pending', strftime('%s','now')),
('best wifi 6e mesh system under $500', 68, 'pending', strftime('%s','now')),

-- SSDs — priority 70-75
('best nvme ssd under $100', 74, 'pending', strftime('%s','now')),
('best 2tb ssd under $150', 72, 'pending', strftime('%s','now')),
('best portable ssd under $120', 71, 'pending', strftime('%s','now')),
('best ssd for ps5 under $150', 70, 'pending', strftime('%s','now')),
('best budget sata ssd under $60', 68, 'pending', strftime('%s','now')),

-- Air fryers — priority 65-70
('best air fryer under $100', 70, 'pending', strftime('%s','now')),
('best large air fryer for family under $150', 68, 'pending', strftime('%s','now')),
('best dual basket air fryer under $200', 66, 'pending', strftime('%s','now')),
('best small air fryer for two under $80', 64, 'pending', strftime('%s','now')),

-- Robot vacuums — priority 65-72
('best robot vacuum under $300', 72, 'pending', strftime('%s','now')),
('best robot vacuum for pet hair under $400', 70, 'pending', strftime('%s','now')),
('best robot vacuum mop combo under $500', 68, 'pending', strftime('%s','now')),
('best budget robot vacuum under $200', 66, 'pending', strftime('%s','now')),

-- Standing desks — priority 65-70
('best standing desk under $400', 70, 'pending', strftime('%s','now')),
('best electric standing desk under $300', 68, 'pending', strftime('%s','now')),
('best small standing desk for home office', 64, 'pending', strftime('%s','now')),

-- Office chairs — priority 65-72
('best office chair under $300', 72, 'pending', strftime('%s','now')),
('best ergonomic office chair under $500', 70, 'pending', strftime('%s','now')),
('best budget office chair under $150', 68, 'pending', strftime('%s','now')),
('best office chair for back pain under $400', 67, 'pending', strftime('%s','now')),

-- Webcams — priority 60-68
('best webcam under $100', 68, 'pending', strftime('%s','now')),
('best 4k webcam for streaming under $200', 65, 'pending', strftime('%s','now')),
('best budget webcam for video calls under $50', 62, 'pending', strftime('%s','now')),

-- Microphones — priority 60-68
('best usb microphone under $100', 68, 'pending', strftime('%s','now')),
('best microphone for podcasting under $200', 65, 'pending', strftime('%s','now')),
('best budget microphone for streaming under $80', 62, 'pending', strftime('%s','now')),

-- Power banks — priority 60-66
('best power bank under $50', 66, 'pending', strftime('%s','now')),
('best portable charger for iphone under $40', 63, 'pending', strftime('%s','now')),
('best high capacity power bank for travel under $80', 60, 'pending', strftime('%s','now')),

-- Chargers — priority 60-66
('best usb c charger under $40', 64, 'pending', strftime('%s','now')),
('best gan charger for laptop under $60', 62, 'pending', strftime('%s','now')),
('best multi port wall charger under $50', 60, 'pending', strftime('%s','now')),

-- E-readers — priority 60-65
('best e reader under $150', 65, 'pending', strftime('%s','now')),
('best e reader for large library under $250', 60, 'pending', strftime('%s','now')),

-- Smart plugs / bulbs — priority 58-64
('best smart plug under $20', 64, 'pending', strftime('%s','now')),
('best smart bulbs for home under $60', 60, 'pending', strftime('%s','now')),
('best smart light switch under $40', 58, 'pending', strftime('%s','now')),

-- Dash cams — priority 60-66
('best dash cam under $150', 66, 'pending', strftime('%s','now')),
('best front and rear dash cam under $200', 62, 'pending', strftime('%s','now')),
('best budget dash cam under $80', 60, 'pending', strftime('%s','now')),

-- Electric toothbrushes — priority 58-64
('best electric toothbrush under $100', 64, 'pending', strftime('%s','now')),
('best budget electric toothbrush under $50', 60, 'pending', strftime('%s','now')),

-- Water flossers — priority 58-62
('best water flosser under $80', 62, 'pending', strftime('%s','now')),
('best cordless water flosser under $60', 58, 'pending', strftime('%s','now')),

-- Coffee grinders — priority 60-66
('best burr coffee grinder under $100', 66, 'pending', strftime('%s','now')),
('best electric coffee grinder under $50', 62, 'pending', strftime('%s','now')),
('best hand coffee grinder under $80', 58, 'pending', strftime('%s','now')),

-- Espresso machines — priority 60-66
('best espresso machine under $500', 66, 'pending', strftime('%s','now')),
('best home espresso machine under $300', 62, 'pending', strftime('%s','now')),
('best budget espresso machine under $200', 60, 'pending', strftime('%s','now')),

-- Blenders — priority 58-64
('best blender under $100', 64, 'pending', strftime('%s','now')),
('best personal blender for smoothies under $60', 60, 'pending', strftime('%s','now')),
('best high power blender under $300', 58, 'pending', strftime('%s','now')),

-- Cordless drills — priority 60-65
('best cordless drill under $100', 65, 'pending', strftime('%s','now')),
('best cordless drill for home use under $150', 60, 'pending', strftime('%s','now')),

-- Label makers — priority 55-60
('best label maker under $50', 60, 'pending', strftime('%s','now')),
('best label maker for home organization under $80', 55, 'pending', strftime('%s','now')),

-- Baby monitors — priority 60-66
('best baby monitor under $150', 66, 'pending', strftime('%s','now')),
('best video baby monitor with camera under $200', 62, 'pending', strftime('%s','now')),
('best budget baby monitor under $80', 60, 'pending', strftime('%s','now')),

-- Dog cameras — priority 58-62
('best dog camera with treat dispenser under $200', 62, 'pending', strftime('%s','now')),
('best pet camera for dogs under $100', 58, 'pending', strftime('%s','now')),

-- Gaming mice — priority 65-72
('best gaming mouse under $50', 72, 'pending', strftime('%s','now')),
('best wireless gaming mouse under $100', 70, 'pending', strftime('%s','now')),
('best lightweight gaming mouse under $80', 66, 'pending', strftime('%s','now')),
('best budget gaming mouse under $30', 65, 'pending', strftime('%s','now')),

-- Gaming headsets — priority 65-72
('best gaming headset under $100', 72, 'pending', strftime('%s','now')),
('best wireless gaming headset under $150', 70, 'pending', strftime('%s','now')),
('best budget gaming headset under $50', 66, 'pending', strftime('%s','now')),

-- Game controllers — priority 60-66
('best pc game controller under $70', 66, 'pending', strftime('%s','now')),
('best wireless controller for pc under $100', 62, 'pending', strftime('%s','now')),
('best budget game controller under $40', 60, 'pending', strftime('%s','now')),

-- USB hubs — priority 58-62
('best usb c hub under $50', 62, 'pending', strftime('%s','now')),
('best powered usb hub under $40', 58, 'pending', strftime('%s','now')),

-- Docking stations — priority 60-66
('best usb c docking station under $200', 66, 'pending', strftime('%s','now')),
('best laptop docking station for dual monitors under $150', 62, 'pending', strftime('%s','now')),
('best budget docking station for macbook under $100', 60, 'pending', strftime('%s','now')),

-- Projectors — priority 60-66
('best projector under $500', 66, 'pending', strftime('%s','now')),
('best portable projector under $300', 62, 'pending', strftime('%s','now')),
('best 4k projector for home theater under $1000', 60, 'pending', strftime('%s','now')),

-- Soundbars — priority 62-68
('best soundbar under $300', 68, 'pending', strftime('%s','now')),
('best budget soundbar under $150', 64, 'pending', strftime('%s','now')),
('best soundbar with subwoofer under $500', 62, 'pending', strftime('%s','now')),

-- Bookshelf speakers — priority 58-64
('best bookshelf speakers under $300', 64, 'pending', strftime('%s','now')),
('best powered bookshelf speakers under $400', 60, 'pending', strftime('%s','now')),
('best budget bookshelf speakers under $150', 58, 'pending', strftime('%s','now'));
