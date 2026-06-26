#!/usr/bin/env node
// Harvest real popular product searches from Google Autocomplete (Suggest API).
// Completions are ordered by Google's actual search popularity — this is
// "what people search for" straight from Google, no browser needed.
//
// Strategy: multi-seed expansion to remove author bias —
//   1. Alphabetic:  "best a", "best b", ... "best z"   (discovers categories)
//   2. Category roots: curated product domains            (depth in each)
//   3. Two-level:   harvested root + " for " / " under "  (specific real queries)
// Then dedup, keep product-intent, rank by frequency-of-appearance.

const SUGGEST = (q) =>
  `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${encodeURIComponent(q)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function suggest(q) {
  try {
    const res = await fetch(SUGGEST(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
    });
    const data = await res.json();
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Product domains worth depth — broad consumer categories with Amazon revenue.
const ROOTS = [
  'headphones', 'earbuds', 'wireless earbuds', 'laptop', 'monitor', 'gaming monitor',
  'mechanical keyboard', 'mouse', 'webcam', 'router', 'mesh wifi', 'nas',
  'ssd', 'external hard drive', 'graphics card', 'cpu', 'power supply', 'pc case',
  'standing desk', 'office chair', 'desk lamp', 'monitor arm',
  'robot vacuum', 'air purifier', 'air fryer', 'espresso machine', 'coffee maker',
  'blender', 'microwave', 'dishwasher', 'refrigerator', 'mattress', 'pillow', 'sheets',
  'tv', 'soundbar', 'projector', 'bluetooth speaker', 'smart bulb', 'smart thermostat',
  'security camera', 'video doorbell', 'smart lock', 'smart plug',
  'phone', 'phone case', 'tablet', 'smartwatch', 'fitness tracker',
  'electric toothbrush', 'hair dryer', 'electric shaver', 'massage gun',
  'running shoes', 'hiking boots', 'backpack', 'luggage', 'water bottle',
  'portable charger', 'power station', 'dash cam', 'baby monitor',
  'gaming headset', 'gaming chair', 'controller', 'vr headset',
  'printer', 'paper shredder', 'label maker', 'vacuum',
  'lawn mower', 'pressure washer', 'drill', 'grill',
];

// Modifiers to drill into real specific searches off each root.
const MODS = [' for', ' under', ' 2026', ' with'];

const counts = new Map(); // query -> times it appeared in a suggestion list

function record(s) {
  const q = s.trim().toLowerCase();
  if (q.length < 6 || q.length > 110) return;
  if (!q.startsWith('best ')) return;          // product-intent only
  if (/\b(buy|near me|reddit|vs|review|amazon)\b/.test(q)) return; // strip nav/compare junk
  counts.set(q, (counts.get(q) || 0) + 1);
}

let calls = 0;
async function harvest(seed) {
  const out = await suggest(seed);
  out.forEach(record);
  calls++;
  await sleep(120); // polite
}

console.error('Phase 1: alphabetic discovery (best a..z)...');
for (const c of ALPHA) await harvest(`best ${c}`);

console.error('Phase 2: category roots...');
for (const r of ROOTS) await harvest(`best ${r}`);

console.error('Phase 3: two-level drill (root + modifier)...');
// Only drill the roots that produced real completions, to control call volume.
for (const r of ROOTS) {
  for (const m of MODS) await harvest(`best ${r}${m}`);
}

// Rank: appearance count desc, then length asc (prefer cleaner phrasings).
const ranked = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
  .map(([q, n]) => ({ q, n }));

console.error(`\n${calls} suggest calls · ${ranked.length} unique product queries harvested\n`);

// Emit JSON for the next stage; print top 80 to stderr for eyeballing.
ranked.slice(0, 80).forEach((r, i) =>
  console.error(`${String(i + 1).padStart(3)}. (${r.n})  ${r.q}`),
);

process.stdout.write(JSON.stringify(ranked, null, 0));
