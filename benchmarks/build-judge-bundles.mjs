#!/usr/bin/env node
// Build blinded per-query judge bundles from the synth benchmark output.
//
// For each query we emit one bundle file containing:
//   - the query
//   - a condensed source corpus (notes + source titles/snippets, capped)
//   - the 4 model reports, BLINDED as A/B/C/D in randomized order (so the
//     LLM judges can't favor a model by name); the deblinding map is kept
//     separately in judge-blinding.json for aggregation.
//
// Usage:
//   node benchmarks/build-judge-bundles.mjs \
//     benchmarks/results/google-top50-results.json \
//     benchmarks/results/google-top50-corpus.json \
//     benchmarks/results/judge-bundles
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [resultsPath, corpusPath, outDir] = process.argv.slice(2);
if (!resultsPath || !corpusPath || !outDir) {
  console.error('usage: build-judge-bundles.mjs <results.json> <corpus.json> <outDir>');
  process.exit(1);
}

const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const corpora = JSON.parse(readFileSync(corpusPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

// Index corpus by query.
const corpusByQuery = new Map(corpora.map((c) => [c.query, c]));

// Group results by query → { model: entry }.
const byQuery = new Map();
for (const r of results) {
  if (!byQuery.has(r.query)) byQuery.set(r.query, {});
  byQuery.get(r.query)[r.model] = r;
}

const CORPUS_CHAR_CAP = 11000;
function condenseCorpus(c) {
  if (!c) return '(no corpus)';
  const parts = [];
  // Notes first — they're the engine's distilled findings (highest signal).
  for (const n of c.notes || []) if (n?.content) parts.push(`NOTE: ${n.content}`);
  // Then source titles + a snippet of content.
  for (const s of c.sources || []) {
    const title = (s.title || '').trim();
    const snip = (s.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (title || snip) parts.push(`SRC [${title}]: ${snip}`);
  }
  let text = '';
  for (const p of parts) {
    if (text.length + p.length + 1 > CORPUS_CHAR_CAP) break;
    text += p + '\n';
  }
  return text || '(no corpus text)';
}

// Deterministic shuffle keyed by query string (no Math.random — keeps reruns stable).
function seededOrder(models, seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return [...models].sort((a, b) => {
    const ha = (h ^ [...a].reduce((x, ch) => (x * 33 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0;
    const hb = (h ^ [...b].reduce((x, ch) => (x * 33 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0;
    return ha - hb;
  });
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const blinding = {}; // query -> { A: model, B: model, ... }
let n = 0;

for (const [query, modelMap] of byQuery) {
  const corpus = corpusByQuery.get(query);
  const models = Object.keys(modelMap);
  const order = seededOrder(models, query);
  const labelToModel = {};
  const reports = {};
  order.forEach((model, i) => {
    const label = LABELS[i];
    labelToModel[label] = model;
    const e = modelMap[model];
    reports[label] = e.ok === '✓'
      ? {
          products: (e.products_full || []).map((p) => ({
            name: p.name, brand: p.brand, price: p.price, rating: p.rating,
            pros: p.pros, cons: p.cons, verdict: p.verdict, best_for: p.best_for,
          })),
          summary: e.summary || '',
        }
      : { products: [], summary: '', failed: true, error: e.error?.slice(0, 80) };
  });
  blinding[query] = labelToModel;

  const bundle = {
    query,
    corpus: condenseCorpus(corpus),
    source_count: corpus?.sources?.length || 0,
    note_count: corpus?.notes?.length || 0,
    reports,
  };
  const idx = String(n).padStart(2, '0');
  writeFileSync(`${outDir}/q${idx}.json`, JSON.stringify(bundle, null, 2));
  n++;
}

writeFileSync(`${outDir}/judge-blinding.json`, JSON.stringify(blinding, null, 2));
console.log(`wrote ${n} judge bundles + blinding map → ${outDir}`);
console.log(`models per query: ${[...byQuery.values()][0] ? Object.keys([...byQuery.values()][0]).length : 0}`);
