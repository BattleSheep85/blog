#!/usr/bin/env node
// synth-gold-blind.mjs — BLINDING step of the synthesis-quality gold
// benchmark. Reads synth-gold-runs.jsonl (produced by synth-gold-gen.mjs)
// plus the cached corpus, and emits one blinded judge bundle per query with
// models shuffled to letters A-F, a different mapping per query (seeded by
// query string + a fixed seed, mirroring build-judge-bundles.mjs). The
// deblinding map is written SEPARATELY — never inside a bundle a judge sees.
//
// Judging itself (a frontier model scoring the blinded bundles) is NOT part
// of this script — that's the next step.
//
// Usage:
//   node benchmarks/synth-gold-blind.mjs
//
// Outputs:
//   benchmarks/ft-data/synth-gold-blind/q<NN>.json  — per-query blinded bundle
//   benchmarks/ft-data/synth-gold-blinding.json      — query -> {A:model, B:model, ...}

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RUNS_PATH = new URL('./ft-data/synth-gold-runs.jsonl', import.meta.url);
const CORPUS_PATH = new URL('./results/google-top50-corpus.json', import.meta.url);
const OUT_DIR = new URL('./ft-data/synth-gold-blind/', import.meta.url);
const BLINDING_OUT = new URL('./ft-data/synth-gold-blinding.json', import.meta.url);

const SEED = 42;
const CORPUS_DIGEST_CHAR_CAP = 6000;
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function readJsonl(url) {
  return readFileSync(url, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// Deterministic per-query shuffle, keyed by query string + a numeric seed —
// no Math.random, keeps reruns stable and gives a DIFFERENT label mapping
// for every query (mirrors build-judge-bundles.mjs's seededOrder).
function seededOrder(items, seedKey, seed) {
  const full = `${seed}:${seedKey}`;
  let h = 0;
  for (let i = 0; i < full.length; i++) h = (h * 31 + full.charCodeAt(i)) >>> 0;
  return [...items].sort((a, b) => {
    const ha = (h ^ [...a].reduce((x, ch) => (x * 33 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0;
    const hb = (h ^ [...b].reduce((x, ch) => (x * 33 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0;
    return ha - hb;
  });
}

// Notes + source titles/snippets condensed to ~CORPUS_DIGEST_CHAR_CAP chars —
// enough for a judge to sanity-check grounding without re-supplying the
// whole 150-source corpus.
function condenseCorpus(corpus, capChars) {
  if (!corpus) return '(no corpus)';
  const parts = [];
  for (const n of corpus.notes || []) if (n?.content) parts.push(`NOTE: ${n.content}`);
  for (const s of corpus.sources || []) {
    const title = (s.title || '').trim();
    const snip = (s.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (title || snip) parts.push(`SRC [${title}]: ${snip}`);
  }
  let text = '';
  for (const p of parts) {
    if (text.length + p.length + 1 > capChars) break;
    text += p + '\n';
  }
  return text || '(no corpus text)';
}

// OpenRouter model ids are always "org/model-name" (optionally with a
// ":suffix" like ":free") — redact that shape from error text so a failed
// run's error message (e.g. an upstream 429 that echoes the model id back)
// can never deblind the bundle.
const MODEL_ID_PATTERN = /[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.:-]*/gi;
function redactModelIds(text) {
  return String(text || '').replace(MODEL_ID_PATTERN, '[model-id-redacted]');
}

function reportForBundle(run) {
  if (!run || !run.ok || !run.report) {
    const rawError = run?.error || 'no report';
    return { failed: true, error: redactModelIds(rawError).slice(0, 120), products: [], summary: '' };
  }
  const r = run.report;
  return {
    summary: r.summary || '',
    products: (r.products || []).map((p) => ({
      name: p.name, brand: p.brand, price: p.price, rating: p.rating,
      pros: p.pros || [], cons: p.cons || [], specs: p.specs || {},
      verdict: p.verdict || '', best_for: p.best_for || '',
    })),
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const runs = readJsonl(RUNS_PATH);
const corpora = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
const corpusByQuery = new Map(corpora.map((c) => [c.query, c]));

const byQuery = new Map(); // query -> { model -> run }
for (const r of runs) {
  if (!byQuery.has(r.query)) byQuery.set(r.query, {});
  byQuery.get(r.query)[r.model] = r;
}

mkdirSync(OUT_DIR, { recursive: true });

const blinding = {};
let n = 0;
for (const [query, modelMap] of byQuery) {
  const corpus = corpusByQuery.get(query);
  const models = Object.keys(modelMap);
  const order = seededOrder(models, query, SEED);

  const labelToModel = {};
  const reports = {};
  order.forEach((model, i) => {
    const label = LABELS[i];
    labelToModel[label] = model;
    reports[label] = reportForBundle(modelMap[model]);
  });
  blinding[query] = labelToModel;

  const bundle = {
    query,
    corpus_digest: condenseCorpus(corpus, CORPUS_DIGEST_CHAR_CAP),
    source_count: corpus?.sources?.length || 0,
    note_count: corpus?.notes?.length || 0,
    reports,
  };

  const idx = String(n).padStart(2, '0');
  writeFileSync(new URL(`q${idx}.json`, OUT_DIR), JSON.stringify(bundle, null, 2));
  n++;
}

writeFileSync(BLINDING_OUT, JSON.stringify(blinding, null, 2));
console.log(`wrote ${n} blinded bundles → ${OUT_DIR.pathname}`);
console.log(`blinding map (keep private from judge) → ${BLINDING_OUT.pathname}`);
console.log(`models per query: ${byQuery.size ? Object.keys([...byQuery.values()][0]).length : 0}`);
