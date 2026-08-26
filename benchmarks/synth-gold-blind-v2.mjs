#!/usr/bin/env node
// synth-gold-blind-v2.mjs — BLINDING step of the CORRECTED synthesis-quality
// benchmark (docs/benchmark-validity-audit.md section 6.4).
//
// Difference from synth-gold-blind.mjs, which stays untouched: the v1 bundle
// carried `corpus_digest`, the first 6,000 characters of the corpus in raw list
// order. Measured coverage was 0 to 13 percent of sources per query, and two of
// eight queries gave the judge zero sources. The judge was then asked whether
// products and citations were invented. It could not answer that.
//
// The v2 bundle carries no digest. Per report it carries:
//   - the blinded report,
//   - a relevance-selected per-product evidence table (the top corpus snippets
//     for the products THAT report actually names),
//   - every note,
//   - the deterministic grounding result for that report, as DATA.
// Existence is already settled before the judge reads anything.
//
// Blinding mechanics are identical to v1: seededOrder, SEED 42, letters A-F, a
// different mapping per query, model ids redacted from error text, and the
// deblinding map written to a separate file.
//
// Usage:
//   node benchmarks/synth-gold-blind-v2.mjs
//   node benchmarks/synth-gold-blind-v2.mjs --model <id> [--label <label>] \
//        --out-dir <dir> --blinding-out <path>
//
// Outputs (default mode, both NEW paths, v1 outputs are never touched):
//   benchmarks/ft-data/synth-gold-blind-v2/q<NN>.json
//   benchmarks/ft-data/synth-gold-blinding-v2.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { buildHaystacks, groundingCheck, buildEvidenceTable } from './lib/grounding-check.mjs';
import { readJsonl } from './lib/rescore-io.mjs';

const RUNS_PATH = new URL('./ft-data/synth-gold-runs.jsonl', import.meta.url);
const CORPUS_PATH = new URL('./results/google-top50-corpus.json', import.meta.url);
const SEED = 42;
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MODEL_ID_PATTERN = /[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.:-]*/gi;

function parseArgs(argv) {
  const out = { model: null, label: null, outDir: null, blindingOut: null };
  const flags = { '--model': 'model', '--label': 'label', '--out-dir': 'outDir', '--blinding-out': 'blindingOut' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = flags[argv[i]];
    if (key) { out[key] = argv[i + 1] || null; i += 1; }
  }
  return out;
}

// Identical to synth-gold-blind.mjs's seededOrder. Deterministic, no Math.random.
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

const redactModelIds = (text) => String(text || '').replace(MODEL_ID_PATTERN, '[model-id-redacted]');

const blindReport = (run) => {
  if (!run || !run.ok || !run.report) {
    return { failed: true, error: redactModelIds(run?.error || 'no report').slice(0, 120), products: [], summary: '' };
  }
  const r = run.report;
  return {
    summary: r.summary || '',
    products: (r.products || []).map((p) => ({
      name: p.name, brand: p.brand, price: p.price, rating: p.rating,
      pros: p.pros || [], cons: p.cons || [], specs: p.specs || {},
      verdict: p.verdict || '', best_for: p.best_for || p.bestFor || '',
    })),
  };
};

// The grounding result travels as DATA the judge must accept, not re-litigate.
const groundingSummary = (g) => ({
  g_det: g.gDet,
  weights: g.weights,
  products_checked: g.units.products.length,
  products_not_grounded: g.fabricatedProducts.map((p) => p.name),
  citations_checked: g.units.citations.filter((c) => c.citationPosition || c.dateISO).length,
  citations_not_verified: g.fabricatedCitations.map((c) => ({ outlet: c.outlet, status: c.status, cited_date: c.dateISO })),
  numbers_checked: g.units.numbers.checked,
  numbers_not_grounded: g.ungroundedNumbers.map((n) => ({ product: n.product, field: n.field, value: n.value })),
});

function buildEntry(run, corpus, hay) {
  const report = blindReport(run);
  if (report.failed) return { report, evidence: null, grounding: null, evidence_truncated: false };
  const evidence = buildEvidenceTable(run.report, corpus, { hay });
  return {
    report,
    evidence: evidence.perProduct,
    evidence_truncated: evidence.truncated,
    grounding: groundingSummary(groundingCheck(run.report, corpus, { hay })),
  };
}

function resolveOutputs(args) {
  if (args.model && (!args.outDir || !args.blindingOut)) {
    throw new Error('--model requires both --out-dir and --blinding-out (explicit output location, never the stored defaults)');
  }
  return {
    outDir: args.outDir
      ? new URL(args.outDir.replace(/\/?$/, '/'), `file://${process.cwd()}/`)
      : new URL('./ft-data/synth-gold-blind-v2/', import.meta.url),
    blindingOut: args.blindingOut
      ? new URL(args.blindingOut, `file://${process.cwd()}/`)
      : new URL('./ft-data/synth-gold-blinding-v2.json', import.meta.url),
  };
}

// Default mode covers the 6 incumbents. The two muse-spark labels share one
// model id, so they are always built as explicit single-candidate runs.
function selectRuns(args) {
  const all = readJsonl(RUNS_PATH);
  const runs = args.model
    ? all.filter((r) => r.model === args.model && (!args.label || r.label === args.label))
    : all.filter((r) => !r.label.startsWith('muse-spark'));
  if (!runs.length) throw new Error(`no rows for model="${args.model}" label="${args.label}"`);
  const byQuery = new Map();
  for (const r of runs) byQuery.set(r.query, { ...(byQuery.get(r.query) || {}), [r.model]: r });
  return byQuery;
}

function buildBundle(query, modelMap, corpus, hay) {
  const order = seededOrder(Object.keys(modelMap), query, SEED);
  const labelToModel = {};
  const reports = {};
  order.forEach((model, i) => {
    labelToModel[LABELS[i]] = model;
    reports[LABELS[i]] = buildEntry(modelMap[model], corpus, hay);
  });
  return {
    labelToModel,
    bundle: {
      query,
      method: 'v2: relevance-selected evidence, no corpus digest. Existence pre-checked deterministically.',
      source_count: corpus.sources?.length || 0,
      note_count: corpus.notes?.length || 0,
      notes: (corpus.notes || []).map((note) => note.content || '').filter(Boolean),
      reports,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { outDir, blindingOut } = resolveOutputs(args);
  if (!existsSync(CORPUS_PATH)) throw new Error(`corpus not found at ${CORPUS_PATH.pathname} (gitignored, 9.6 MB)`);

  const byQuery = selectRuns(args);
  const corpusByQuery = new Map(JSON.parse(readFileSync(CORPUS_PATH, 'utf8')).map((c) => [c.query, c]));
  mkdirSync(outDir, { recursive: true });

  const blinding = {};
  let n = 0;
  for (const [query, modelMap] of byQuery) {
    const corpus = corpusByQuery.get(query);
    if (!corpus) throw new Error(`no cached corpus for query "${query}"`);
    const { labelToModel, bundle } = buildBundle(query, modelMap, corpus, buildHaystacks(corpus));
    blinding[query] = labelToModel;
    writeFileSync(new URL(`q${String(n).padStart(2, '0')}.json`, outDir), JSON.stringify(bundle, null, 2));
    n += 1;
  }

  writeFileSync(blindingOut, JSON.stringify(blinding, null, 2));
  console.log(`wrote ${n} v2 bundles → ${outDir.pathname}`);
  console.log(`blinding map (keep private from judge) → ${blindingOut.pathname}`);
}

main();
