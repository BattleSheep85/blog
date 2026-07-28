#!/usr/bin/env node
// harvest-teacher-labels.mjs — generate stance + claim-extraction SFT JSONL by
// running the REAL production teacher (gpt-5.4-mini) over a list of product names.
//
// Reuses the exact production engine functions from worker/engine/verify.js
// (extractClaims, classifyStance, topEvidenceForClaim) and the OpenRouter client
// (worker/engine/llm.js callLLM) so harvested records match inference-time
// formatting byte-for-byte with the Part B seed schema.
//
//   task:'stance'         → messages:[STANCE_SYSTEM, user(claim+15 evidence)], completion:{verdicts:[{url,stance,span}]}
//   task:'claim-extract'  → messages:[CLAIM_EXTRACTION_SYSTEM, user(product+block)], completion:{claims:[{text,type}]}
//
// SPEND: this script calls a PAID API (OpenRouter gpt-5.4-mini + Serper search).
// It prints an estimate and REQUIRES --live to actually spend. Default is a
// zero-network --dry-run that proves the record shape with a mock teacher.
//
// Usage:
//   node benchmarks/harvest-teacher-labels.mjs --dry-run --limit 1      # no spend (default)
//   node benchmarks/harvest-teacher-labels.mjs --live --limit 5         # SPENDS ~$0.09/product
//   node benchmarks/harvest-teacher-labels.mjs --live --products "Anker Space A40, Sony WF-1000XM5"
//
// Products come from --products "a, b, c" or a --file <path> (one name per line),
// else a small built-in demo list.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  CLAIM_EXTRACTION_SYSTEM,
  STANCE_SYSTEM,
  extractClaims,
  classifyStance,
  topEvidenceForClaim,
} from '../worker/engine/verify.js';
import { gatherParallel } from '../worker/engine/parallel-engine.js';
import { isManufacturerDomain, scoreSource } from '../worker/lib/credibility.js';
import { ENGINE_CONFIG } from '../worker/lib/engine-config.js';
import { callLLM as realCallLLM } from '../worker/engine/llm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'ft-data');
const CLAIM_TEXT_CHAR_CAP = 20_000;
const DEFAULT_PRODUCTS_PATH = join(OUT_DIR, 'harvest-products.txt');
const STANCE_HARVESTED_PATH = join(OUT_DIR, 'stance-harvested.jsonl');
const EXTRACT_HARVESTED_PATH = join(OUT_DIR, 'extract-harvested.jsonl');

// Per-product spend estimate. Anchored on the one real run we have:
//   verify-anker-soundcore-space-a40.json totalCostUsd = $0.091 (gather+extract+stance).
//   LLM-only (extract+stance) replay = $0.038. Gather (search+planner) ≈ $0.05.
const EST_USD_PER_PRODUCT = 0.09;

// Hard live-spend ceiling for this script, enforced regardless of product-list
// size or per-product estimate drift. Never exceeded, even mid-product.
const SPEND_CAP_USD = 25;

// Reads OPENROUTER_API_KEY / SERPER_API_KEY (etc.) from .dev.vars, falling back
// to process.env. Mirrors benchmarks/glm52-synth-bench.mjs:25-35.
function readEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* .dev.vars absent — fall back to process.env only */ }
  return out;
}
const DEV_VARS = readEnv('.dev.vars');
function envVar(name) {
  return DEV_VARS[name] || process.env[name];
}

function parseArgs(argv) {
  const args = { dryRun: true, limit: Infinity, products: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--products') args.products = argv[++i];
    else if (a === '--file') args.file = argv[++i];
  }
  return args;
}

function loadProducts(args) {
  if (args.products) return args.products.split(',').map((s) => s.trim()).filter(Boolean);
  if (args.file) {
    return readFileSync(args.file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  if (existsSync(DEFAULT_PRODUCTS_PATH)) {
    return readFileSync(DEFAULT_PRODUCTS_PATH, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return ['Anker Soundcore Space A40', 'Sony WF-1000XM5', 'Anker 737 Power Bank'];
}

// Reads a harvested JSONL file (if present) and returns the set of product
// names already recorded (lowercased), so a resumed run skips re-spending.
function loadHarvestedProducts(path) {
  const names = new Set();
  if (!existsSync(path)) return names;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      const name = rec?.meta?.product;
      if (name) names.add(name.trim().toLowerCase());
    } catch { /* skip malformed line */ }
  }
  return names;
}

// Appends records to a JSONL file, creating it (and OUT_DIR) if absent.
// Never overwrites existing content.
function appendRecords(path, recs) {
  if (recs.length === 0) return;
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const body = recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  appendFileSync(path, body);
}

// Local copy of verify.js's non-exported scoreEvidence (same logic).
function scoreEvidence(evidenceSources) {
  return evidenceSources.map((s) => {
    const cred = scoreSource({ url: s.url, title: s.title, content: s.content, sourceType: s.source });
    return {
      url: s.url,
      title: s.title,
      content: s.content || '',
      credibility: cred.score,
      independence: cred.independence,
      tags: cred.tags,
    };
  });
}

function buildClaimTextBlock(claimSources) {
  return claimSources
    .map((s, i) => `### SOURCE ${i + 1} ${s.title || ''}\n${s.url}\n${(s.content || '').slice(0, CLAIM_TEXT_CHAR_CAP)}`)
    .join('\n\n')
    .slice(0, CLAIM_TEXT_CHAR_CAP);
}

// ── mock teacher + gather for --dry-run (zero network, zero spend) ──
function mockGather(product) {
  const mk = (url, title, content, source) => ({ url, title, content, source });
  return {
    totalCostUsd: 0,
    sources: [
      mk('https://www.amazon.com/dp/B0DEMO', `${product} official listing`,
        `${product} features adaptive ANC, up to 50-hour playtime, Hi-Res sound, and a comfortable fit. Reduce noise by up to 98%.`, 'manufacturer'),
      mk('https://www.reddit.com/r/headphones/demo', `${product} owner thread`,
        `I tested the ${product} for two weeks; the ANC noticeably cut my office fan noise. Battery got me ~40h real use.`, 'community'),
      mk('https://www.rtings.com/demo', `${product} review`,
        `In our lab we measured playback around 42 hours, short of the rated 50. ANC performance was mid-tier.`, 'expert'),
    ],
  };
}
async function mockCallLLM(_apiKey, _model, messages, _opts) {
  const sys = messages[0].content;
  let content;
  if (sys === CLAIM_EXTRACTION_SYSTEM) {
    content = JSON.stringify({
      claims: [
        { text: 'Has adaptive active noise cancelling.', type: 'spec' },
        { text: 'Up to 50-hour playtime.', type: 'spec' },
        { text: 'Reduces noise by up to 98%.', type: 'marketing' },
      ],
    });
  } else {
    // stance: echo one verdict per source in the user block
    const urls = [...messages[1].content.matchAll(/^\d+\. (\S+)/gm)].map((m) => m[1]);
    content = JSON.stringify({
      verdicts: urls.map((url, i) => ({
        url,
        stance: i === 2 ? 'contradict' : i === 1 ? 'support' : 'neutral',
        span: i === 2 ? 'we measured playback around 42 hours' : '',
      })),
    });
  }
  return { choices: [{ message: { content } }], usage: { cost: 0 } };
}

// Returns { stanceRecords, extractRecords, skipped, costUsd }. costUsd sums
// gather.totalCostUsd + extractClaims costUsd + every classifyStance costUsd —
// the actual spend for this product (0 in --dry-run, since the mock LLM/gather
// report 0 cost).
async function harvestProduct(product, { config, apiKey, env, callLLM, gather }) {
  const stanceRecords = [];
  const extractRecords = [];
  let costUsd = 0;

  const gathered = await gather(product, config, apiKey, env, () => {},
    { is_buyable: true, sold_on_amazon: true, recency_sensitive: true }, product, {});
  costUsd += gathered.totalCostUsd || 0;
  const sources = gathered.sources || [];

  const claimSources = sources.filter((s) => isManufacturerDomain(s.url));
  const evidenceSources = sources.filter((s) => !isManufacturerDomain(s.url));
  if (claimSources.length === 0) {
    return { stanceRecords, extractRecords, skipped: `${product}: no manufacturer/claim source resolved`, costUsd };
  }

  // EXTRACT
  const claimText = buildClaimTextBlock(claimSources);
  const { claims, costUsd: extractCost } = await extractClaims({ product, claimText, apiKey, model: config.synthModel, callLLM });
  costUsd += extractCost || 0;
  extractRecords.push({
    task: 'claim-extract',
    source: `harvest:${product}`,
    meta: { product },
    messages: [
      { role: 'system', content: CLAIM_EXTRACTION_SYSTEM },
      { role: 'user', content: `Product: "${product}"\n\n${claimText}` },
    ],
    completion: JSON.stringify({ claims: claims.map((c) => ({ text: c.text, type: c.type })) }),
  });

  // STANCE (same top-15 evidence for every claim, per production)
  const scored = scoreEvidence(evidenceSources);
  const picked = topEvidenceForClaim(scored, 15);
  for (const claim of claims) {
    const { rows, costUsd: stanceCost } = await classifyStance({ claim, evidence: picked, apiKey, model: config.synthModel, callLLM });
    costUsd += stanceCost || 0;
    const block = picked.map((s, i) => `${i + 1}. ${s.url}\n${(s.content || '').slice(0, 1200)}`).join('\n\n');
    stanceRecords.push({
      task: 'stance',
      source: `harvest:${product}`,
      meta: { product, claimId: claim.id, claimType: claim.type },
      messages: [
        { role: 'system', content: STANCE_SYSTEM },
        { role: 'user', content: `Claim: "${claim.text}"\n\nEvidence sources:\n${block}` },
      ],
      completion: JSON.stringify({ verdicts: rows.map((r) => ({ url: r.url, stance: r.stance, span: r.span })) }),
    });
  }

  return { stanceRecords, extractRecords, skipped: null, costUsd };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allProducts = loadProducts(args);

  // Resume support: skip products already present (by name) in the live
  // harvested JSONL files, so a cap-stop or crash never re-spends on them.
  const alreadyDone = loadHarvestedProducts(STANCE_HARVESTED_PATH);
  const remaining = allProducts.filter((p) => !alreadyDone.has(p.trim().toLowerCase()));
  const skippedResume = allProducts.length - remaining.length;
  const products = remaining.slice(0, Number.isFinite(args.limit) ? args.limit : remaining.length);

  const estTotal = (products.length * EST_USD_PER_PRODUCT).toFixed(2);
  console.error(`[harvest] mode=${args.dryRun ? 'DRY-RUN (no spend)' : 'LIVE (SPENDS)'} products=${products.length} (${skippedResume} already harvested, skipped)`);
  console.error(`[harvest] estimated spend: ~$${EST_USD_PER_PRODUCT.toFixed(2)}/product → ~$${estTotal} total (hard cap $${SPEND_CAP_USD})`);

  const config = ENGINE_CONFIG;
  let apiKey = null;
  let env = {};
  let callLLM = mockCallLLM;
  let gather = (p) => mockGather(p);

  if (!args.dryRun) {
    apiKey = envVar('OPENROUTER_API_KEY');
    if (!apiKey) {
      console.error('[harvest] --live requires OPENROUTER_API_KEY in .dev.vars or env. Aborting (no spend).');
      process.exit(1);
    }
    env = {
      SERPER_API_KEY: envVar('SERPER_API_KEY'),
      BRAVE_API_KEY: envVar('BRAVE_API_KEY'),
      TAVILY_API_KEY: envVar('TAVILY_API_KEY'),
      SEARXNG_URL: envVar('SEARXNG_URL'),
      JINA_API_KEY: envVar('JINA_API_KEY'),
    };
    callLLM = realCallLLM;
    gather = gatherParallel;
  }

  const stance = [];
  const extract = [];
  const skipped = [];
  let spentUsd = 0;
  let capHit = false;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (!args.dryRun && spentUsd + EST_USD_PER_PRODUCT >= SPEND_CAP_USD) {
      console.error(`[harvest] SPEND CAP: total $${spentUsd.toFixed(2)} + est $${EST_USD_PER_PRODUCT.toFixed(2)} would reach $${SPEND_CAP_USD} cap. Stopping before "${product}".`);
      capHit = true;
      break;
    }

    try {
      const r = await harvestProduct(product, { config, apiKey, env, callLLM, gather });
      stance.push(...r.stanceRecords);
      extract.push(...r.extractRecords);
      if (r.skipped) skipped.push(r.skipped);
      if (!args.dryRun) {
        appendRecords(STANCE_HARVESTED_PATH, r.stanceRecords);
        appendRecords(EXTRACT_HARVESTED_PATH, r.extractRecords);
        spentUsd += r.costUsd || 0;
      }
      console.error(`[harvest] ${product}: +${r.extractRecords.length} extract, +${r.stanceRecords.length} stance${r.skipped ? ' (skipped)' : ''}`);
      console.error(`[harvest] product ${i + 1}/${products.length} · +$${(r.costUsd || 0).toFixed(3)} · total $${spentUsd.toFixed(2)}`);
    } catch (e) {
      skipped.push(`${product}: ERROR ${e.message}`);
      console.error(`[harvest] ${product}: ERROR ${e.message}`);
    }

    if (!args.dryRun && spentUsd >= SPEND_CAP_USD) {
      console.error(`[harvest] SPEND CAP HIT: total $${spentUsd.toFixed(2)} >= $${SPEND_CAP_USD} cap. Stopping.`);
      capHit = true;
      break;
    }
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const suffix = args.dryRun ? '.dryrun' : '';
  const wrote = (name, recs) => {
    const p = join(OUT_DIR, name);
    writeFileSync(p, recs.map((r) => JSON.stringify(r)).join('\n') + (recs.length ? '\n' : ''));
    return p;
  };
  // --dry-run keeps the original overwrite-preview files (zero spend, schema
  // demo only). --live appends incrementally to the resumable *-harvested.jsonl
  // files above (already flushed per-product); no separate write needed here.
  if (args.dryRun) {
    const stancePath = wrote(`stance-harvest${suffix}.jsonl`, stance);
    const extractPath = wrote(`extract-harvest${suffix}.jsonl`, extract);
    console.error(`[harvest] wrote ${stancePath} , ${extractPath}`);
  }

  console.error(`[harvest] DONE. stance=${stance.length} extract=${extract.length} skipped=${skipped.length} spent=$${spentUsd.toFixed(2)}${capHit ? ' (STOPPED: spend cap)' : ''}`);
  if (!args.dryRun) {
    console.error(`[harvest] appended to ${STANCE_HARVESTED_PATH} , ${EXTRACT_HARVESTED_PATH}`);
  }
  if (args.dryRun && (stance.length || extract.length)) {
    console.error('[harvest] --- sample stance record (dry-run) ---');
    console.error(JSON.stringify(stance[0], null, 2));
  }
  if (skipped.length) {
    console.error('[harvest] --- skipped/failed products ---');
    for (const s of skipped) console.error(`  ${s}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
