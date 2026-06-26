#!/usr/bin/env node
// Select a diverse top-50 from the harvested Google product searches.
// Dedup by product-category signature so we don't get 10 "best portable charger
// for X" — one representative (highest popularity) per category.

import { readFileSync, writeFileSync } from 'node:fs';

const ranked = JSON.parse(readFileSync(new URL('./harvested.json', import.meta.url), 'utf8'));

// Category signature = words after "best " up to the first modifier token.
const STOP = new Set(['for', 'under', 'with', 'in', 'on', 'to', '2026', '2025', 'and']);
function signature(q) {
  const words = q.replace(/^best\s+/, '').split(/\s+/);
  const sig = [];
  for (const w of words) {
    if (STOP.has(w)) break;
    sig.push(w.replace(/s$/, '')); // crude singularize so "earbuds"/"earbud" merge
    if (sig.length >= 2) break;    // 1-2 word category head
  }
  return sig.join(' ');
}

// Software/service categories that are NOT Amazon-buyable physical goods.
const NON_BUYABLE = /\b(software|app|apps|service|hosting|vpn|antivirus|distro|os)\b/;

// Media/content searches that aren't product-research targets.
const MEDIA = /\b(tv shows?|movies?|series|songs?|albums?|anime|books?|podcasts?|games?|memes?|recipes?)\b/;

const seen = new Set();
const picked = [];
for (const { q, n } of ranked) {
  if (MEDIA.test(q)) continue; // drop content/media, keep buyable products
  // skip ultra-generic bare-category queries ("best vacuum") — prefer ones with
  // a qualifier when available, but keep if it's the only representative.
  const sig = signature(q);
  if (!sig || seen.has(sig)) continue;
  seen.add(sig);
  const buyable = !NON_BUYABLE.test(q);
  picked.push({
    q,
    n,
    facets: { is_buyable: buyable, sold_on_amazon: buyable, recency_sensitive: true },
    cat: sig,
  });
  if (picked.length >= 50) break;
}

console.error(`selected ${picked.length} diverse categories:\n`);
picked.forEach((p, i) =>
  console.error(`${String(i + 1).padStart(2)}. (pop ${p.n})  ${p.q}${p.facets.is_buyable ? '' : '  [non-buyable]'}`),
);

writeFileSync(new URL('./queries50.json', import.meta.url), JSON.stringify(picked, null, 2));
