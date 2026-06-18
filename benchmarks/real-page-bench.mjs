#!/usr/bin/env node
// REAL-PAGE acceptance gate: the synthetic fixtures are clean; this runs the live
// gather (search→read→notes via Serper+gemini) on fresh queries NOT in the fixtures,
// then feeds the SAME real {sources, notes} to BOTH the extraction engine and kimi,
// and compares — groundedness (the killer metric), product recall, and dumps both
// reports for a human read. Real content is messy (ads, nav, many product mentions),
// so this is where extraction precision/recall is actually tested.
//
//   node benchmarks/real-page-bench.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { runParallelEngine } from '../worker/engine/parallel-engine.js';
import { synthesizeExtractive } from '../worker/engine/extract/index.js';
import { getTierConfig } from '../worker/lib/tiers.js';

const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const KEY = e.OPENROUTER_API_KEY, SERPER = e.SERPER_API_KEY;
if (!KEY || !SERPER) { console.error('need OPENROUTER_API_KEY + SERPER_API_KEY in .dev.vars'); process.exit(1); }

const F_PROD = { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true };
const QUERIES = [
  { q: 'best wireless earbuds under $100', facets: F_PROD, cat: 'wireless earbuds' },
  { q: 'best standing desk for a home office', facets: F_PROD, cat: 'standing desks' },
  { q: 'best espresso machine under $500', facets: F_PROD, cat: 'espresso machines' },
];

function numbersIn(t) { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; }
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
function ungroundedCount(products, srcNums) {
  let u = 0;
  for (const p of products || []) {
    if (typeof p.price === 'number' && !grounded(p.price, srcNums)) u++;
    for (const v of Object.values(p.specs || {})) for (const n of numbersIn(String(v))) if (!grounded(n, srcNums)) u++;
  }
  return u;
}

const rows = []; const dump = [];
for (const { q, facets, cat } of QUERIES) {
  process.stderr.write(`\n### gathering: ${q}\n`);
  let r;
  try { r = await runParallelEngine(q, { ...getTierConfig('full'), maxConcurrency: 6 }, KEY, { SERPER_API_KEY: SERPER }, async () => {}, facets, cat, {}); }
  catch (err) { process.stderr.write(`  gather FAILED: ${err.message}\n`); rows.push({ query: q.slice(0, 28), error: err.message }); continue; }

  const srcNums = numbersIn((r.sources || []).map((s) => s.content || '').join(' '));
  const ext = synthesizeExtractive(q, r.notes, r.sources, facets, cat);
  const llm = r.result;

  const extNames = (ext.products || []).map((p) => p.name);
  const llmNames = (llm.products || []).map((p) => p.name);
  const overlap = extNames.filter((n) => llmNames.some((m) => n.toLowerCase().includes(m.toLowerCase().split(' ')[0]) || m.toLowerCase().includes(n.toLowerCase().split(' ')[0]))).length;

  rows.push({
    query: q.slice(0, 28), sources: r.sources.length, notes: r.notes.length,
    llm_products: llmNames.length, ext_products: extNames.length, name_overlap: overlap,
    llm_ungrounded: ungroundedCount(llm.products, srcNums), ext_ungrounded: ungroundedCount(ext.products, srcNums),
    ext_avg_pros: Math.round(10 * (ext.products || []).reduce((s, p) => s + (p.pros || []).length, 0) / Math.max(1, (ext.products || []).length)) / 10,
    ext_avg_cons: Math.round(10 * (ext.products || []).reduce((s, p) => s + (p.cons || []).length, 0) / Math.max(1, (ext.products || []).length)) / 10,
    gather_cost: Math.round((r.totalCostUsd || 0) * 1e4) / 1e4,
  });
  dump.push({ query: q, llm: { products: llmNames, summary: llm.summary }, extraction: ext, sourceCount: r.sources.length });
}

writeFileSync(new URL('./results/real-page-reports.json', import.meta.url), JSON.stringify(dump, null, 2));
console.log('\n=== REAL-PAGE: extraction engine vs kimi on live-gathered sources ===');
console.table(rows);
console.log('\nfull reports → results/real-page-reports.json  (LLM names + extraction full output for human read)');
