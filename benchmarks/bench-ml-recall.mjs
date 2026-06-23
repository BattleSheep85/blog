#!/usr/bin/env node
// Fast/free ML con-recall + entity-hygiene eval. Runs the extraction engine on the
// CACHED real corpus (no API cost) and reports the metrics the judging flagged:
// avg_cons (the recall gap), avg_pros, product count, and garbage/chrome names.
// Iterate the engine against this until cons rise + garbage names drop.
//
//   node benchmarks/bench-ml-recall.mjs            # table
//   node benchmarks/bench-ml-recall.mjs --names    # also dump every product name
//
import { readFileSync } from 'node:fs';
import { synthesizeExtractive } from '../worker/engine/extract/index.js';

const corpus = JSON.parse(readFileSync(new URL('./results/corpus.json', import.meta.url), 'utf8'));
const SHOW = process.argv.includes('--names');

// Heuristic "garbage name" detector — chrome/boilerplate/spec fragments that are NOT
// products (matches what the judges caught: license footers, timestamps, CTAs, bare
// tech-term+number, repeated words, video timestamps).
const GARBAGE = [
  /\b(attribution|sharealike|creative commons|noncommercial|cc by)\b/i,
  /\b(check latest price|buy now|shop now|view deal|add to cart|see price|best price)\b/i,
  /\b(bluetooth|displayport|hdmi|usb|wi-?fi|android|ios|version)\s+\d+\b/i,
  /\b\d{1,2}:\d{2}\b/,                                   // video timestamps 02:32
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\b/i, // August 18
  /\b(over|under|up to|from)\s+\d+\b/i,                  // "Over 100"
  /\b(\w+)\s+\1\b/i,                                     // repeated word "Security Security"
  /\b(privacy|cookie|terms|subscribe|newsletter|sign in|log in|menu|search|home|skip to)\b/i,
];
const isGarbage = (n) => GARBAGE.some((re) => re.test(String(n || '')));

const rows = []; const agg = { prod: 0, pros: 0, cons: 0, garbage: 0, withCons: 0, n: 0, q: 0 };
for (const c of corpus) {
  if (!c.sources?.length) continue;
  const rep = synthesizeExtractive(c.query, c.notes, c.sources, c.facets, c.cat);
  const prods = rep.products || [];
  const garbage = prods.filter((p) => isGarbage(p.name)).length;
  const withCons = prods.filter((p) => (p.cons || []).length > 0).length;
  const avgC = prods.length ? prods.reduce((s, p) => s + (p.cons || []).length, 0) / prods.length : 0;
  const avgP = prods.length ? prods.reduce((s, p) => s + (p.pros || []).length, 0) / prods.length : 0;
  rows.push({ query: c.query.slice(0, 26), products: prods.length, garbage_names: garbage, with_cons: `${withCons}/${prods.length}`, avg_cons: Math.round(avgC * 100) / 100, avg_pros: Math.round(avgP * 100) / 100 });
  agg.q++; agg.prod += prods.length; agg.pros += avgP; agg.cons += avgC; agg.garbage += garbage; agg.withCons += withCons; agg.n += prods.length;
  if (SHOW) { console.log(`\n${c.query}:`); for (const p of prods) console.log(`  ${isGarbage(p.name) ? 'GARBAGE>' : '        '} ${p.rating}/5 «${p.name}»  cons:${(p.cons || []).length}`); }
}
console.log('\n=== ML con-recall + entity hygiene (on cached real corpus) ===');
console.table(rows);
console.log('AGGREGATE:', JSON.stringify({
  queries: agg.q, total_products: agg.n, garbage_names: agg.garbage,
  pct_products_with_cons: Math.round(100 * agg.withCons / agg.n) + '%',
  avg_cons: Math.round(100 * agg.cons / agg.q) / 100, avg_pros: Math.round(100 * agg.pros / agg.q) / 100,
}, null, 1));
