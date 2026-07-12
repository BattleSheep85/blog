#!/usr/bin/env node
// verify-product.mjs — Truth Audit reference run: gather → resolve claim vs
// evidence sources → extract claims → score evidence → stance → verdict, end
// to end on ONE real product. Reuses existing engine/lib modules verbatim;
// does NOT touch the worker HTTP/queue/orchestrator/UI. Non-invasive.
//
// Usage:
//   node benchmarks/verify-product.mjs                       # default product
//   PRODUCT="..." node benchmarks/verify-product.mjs
//   node benchmarks/verify-product.mjs "Some Product Name"
//   PRODUCT_URL=https://example.com/product node benchmarks/verify-product.mjs
//
//   REPLAY=<path-to-prior-results.json> node benchmarks/verify-product.mjs
//     Skips gather + claim-extraction entirely; loads `claims` + `evidence`
//     from the given prior results JSON (same shape this script writes) and
//     runs ONLY stance + verdict against them. Lets you isolate a stance/
//     verdict-logic change (e.g. the independent-corroboration fix) from
//     gather/extraction non-determinism: same claims + same evidence pool in,
//     directly observe what changed. Output is written to a NEW file
//     (`verify-<slug>-replay.json`) so the pinned input is never overwritten.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gatherParallel } from '../worker/engine/parallel-engine.js';
import { readPageInto } from '../worker/engine/tools.js';
import { callLLM } from '../worker/engine/llm.js';
import { scoreSource, isManufacturerDomain } from '../worker/lib/credibility.js';
import { verdictForClaim, overallVerdict, verificationWeight } from '../worker/lib/verdict.js';
import { getTierConfig } from '../worker/lib/tiers.js';
import {
  topEvidenceForClaim,
  buildClaimEvidence,
  extractClaims as extractClaimsShared,
  classifyStance as classifyStanceShared,
} from '../worker/engine/verify.js';

// ── ENV ──────────────────────────────────────────────────────────────────────
function loadDevVars() {
  const env = {};
  const text = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const devVars = loadDevVars();
const OPENROUTER_API_KEY = devVars.OPENROUTER_API_KEY;
const SERPER_API_KEY = devVars.SERPER_API_KEY;
const JINA_API_KEY = devVars.JINA_API_KEY;

// REPLAY mode never gathers, so it only needs the OpenRouter key (for the
// stance LLM call) — SERPER_API_KEY is irrelevant when there's no search.
const REPLAY_PATH = process.env.REPLAY || null;
if (!OPENROUTER_API_KEY || (!REPLAY_PATH && !SERPER_API_KEY)) {
  console.error('need OPENROUTER_API_KEY (and SERPER_API_KEY unless REPLAY is set) in .dev.vars');
  process.exit(1);
}

function loadReplayInput(path) {
  const text = readFileSync(path, 'utf8');
  const parsed = JSON.parse(text);
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
  if (claims.length === 0 || evidence.length === 0) {
    throw new Error(`REPLAY input ${path} is missing claims[] or evidence[]`);
  }
  return { claims, evidence, product: parsed.product, productUrl: parsed.productUrl ?? null };
}

const replayInput = REPLAY_PATH ? loadReplayInput(REPLAY_PATH) : null;

const PRODUCT = process.env.PRODUCT || process.argv[2] || replayInput?.product || 'Anker Soundcore Space A40';
const PRODUCT_URL = process.env.PRODUCT_URL || replayInput?.productUrl || null;

const cfg = getTierConfig('full');
const synthModel = cfg.synthModel;

let totalCostUsd = 0;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── 1. GATHER ─────────────────────────────────────────────────────────────────
async function gather() {
  process.stderr.write(`[gather] researching "${PRODUCT}"...\n`);
  const r = await gatherParallel(
    PRODUCT,
    cfg,
    OPENROUTER_API_KEY,
    { SERPER_API_KEY, JINA_API_KEY },
    () => {},
    { is_buyable: true, sold_on_amazon: true, recency_sensitive: true },
    PRODUCT,
    {},
  );
  totalCostUsd += r.totalCostUsd || 0;
  process.stderr.write(`[gather] ${r.sources?.length || 0} sources, ${r.notes?.length || 0} notes\n`);
  return r.sources || [];
}

// ── 2. RESOLVE — split claim (manufacturer/retailer) vs evidence sources ──────
async function resolve(sources) {
  process.stderr.write('[resolve] splitting claim sources vs evidence sources...\n');
  const claimFromGather = sources.filter((s) => isManufacturerDomain(s.url));
  const evidence = sources.filter((s) => !isManufacturerDomain(s.url));

  let claimSources = [...claimFromGather];

  if (PRODUCT_URL) {
    const already = claimSources.find((s) => s.url === PRODUCT_URL);
    if (already && (already.content?.length ?? 0) > 300) {
      process.stderr.write(`[resolve] PRODUCT_URL already gathered with content: ${PRODUCT_URL}\n`);
    } else {
      process.stderr.write(`[resolve] reading PRODUCT_URL: ${PRODUCT_URL}\n`);
      const manual = already || { url: PRODUCT_URL, title: PRODUCT_URL, content: '', source: 'manual' };
      await readPageInto(manual, { SERPER_API_KEY, JINA_API_KEY: devVars.JINA_API_KEY });
      if (!already) claimSources.push(manual);
    }
  }

  if (claimSources.length === 0 && !PRODUCT_URL) {
    console.log(`Could not resolve "${PRODUCT}"'s own product page. Re-run with PRODUCT_URL=<amazon/bestbuy/walmart/manufacturer url> to specify it.`);
    process.exit(0);
  }

  process.stderr.write(`[resolve] ${claimSources.length} claim source(s), ${evidence.length} evidence source(s)\n`);
  return { claimSources, evidence };
}

// ── 3. EXTRACT CLAIMS ──────────────────────────────────────────────────────────
// CLAIM_EXTRACTION_SYSTEM + the extraction call are shared with
// worker/engine/verify.js (single source of truth) — this is a thin
// cost-tracking + logging wrapper over extractClaimsShared().
async function extractClaims(claimSources) {
  process.stderr.write('[extract-claims] calling LLM...\n');
  const block = claimSources
    .map((s, i) => `### SOURCE ${i + 1} ${s.title || ''}\n${s.url}\n${(s.content || '').slice(0, 20000)}`)
    .join('\n\n')
    .slice(0, 20000);

  const { claims, costUsd } = await extractClaimsShared({
    product: PRODUCT,
    claimText: block,
    apiKey: OPENROUTER_API_KEY,
    model: synthModel,
    callLLM,
  });
  totalCostUsd += costUsd;
  process.stderr.write(`[extract-claims] ${claims.length} claims\n`);
  return claims;
}

// ── 4. SCORE EVIDENCE ──────────────────────────────────────────────────────────
function scoreEvidence(evidenceSources) {
  process.stderr.write('[score-evidence] scoring sources...\n');
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

// ── 5. STANCE per claim ────────────────────────────────────────────────────────
// STANCE_SYSTEM, topEvidenceForClaim, and the deterministic stance backstops
// (applyStanceBackstops/isMarketingEcho/spanHasGenuineTestLanguage/
// NON_CORROBORATING_TAGS) are shared with worker/engine/verify.js — single
// source of truth. This wraps the shared classifyStance() I/O call and joins
// its rows against the scored evidence via the shared buildClaimEvidence().
async function stanceForClaim(claim, evidence) {
  const picked = topEvidenceForClaim(evidence);
  if (picked.length === 0) return [];

  const { rows, costUsd } = await classifyStanceShared({
    claim,
    evidence: picked,
    apiKey: OPENROUTER_API_KEY,
    model: synthModel,
    callLLM,
  });
  totalCostUsd += costUsd;

  return buildClaimEvidence(claim, picked, rows);
}

// ── OUTPUT FORMATTING ──────────────────────────────────────────────────────────
function formatSourceLine(arrow, ev) {
  const host = hostOf(ev.url);
  const flagTags = (ev.tags || []).filter((t) =>
    ['seeded-unit', 'incentivized-review', 'affiliate-conflict', 'embargo-nda'].includes(t),
  );
  const flags = flagTags.length ? ` {${flagTags.join(',')}}` : '';
  const span = ev.span ? ` — "${ev.span}"` : '';
  // ev.weight is populated by verdictForClaim's sortedSide() using whatever
  // `weigh` function was passed in — here that's verificationWeight, so this
  // is the strict-(a) verification weight, not raw credibility×independence.
  const weight = Number.isFinite(ev.weight) ? ` weight=${ev.weight}` : '';
  return `      ${arrow} [cred=${ev.credibility} indep=${ev.independence}${weight}] ${host}${span}${flags}`;
}

function printLedger({ overall, claimVerdicts, evidenceCount, spent }) {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`TRUTH AUDIT — ${PRODUCT}`);
  console.log(`Overall: ${overall.score}/100 — ${overall.label}`);
  console.log(`Claims: ${claimVerdicts.length}   Evidence sources: ${evidenceCount}   Spent: $${spent.toFixed(4)}`);
  console.log('══════════════════════════════════════════════════════════════════');

  for (const cv of claimVerdicts) {
    console.log(`\n[${cv.status}] (conf=${cv.confidence}) ${cv.claim.text}`);
    const supporting = cv.supporting.slice(0, 3);
    const contradicting = cv.contradicting.slice(0, 2);
    for (const ev of supporting) console.log(formatSourceLine('↑', ev));
    for (const ev of contradicting) console.log(formatSourceLine('↓', ev));
    if (supporting.length === 0 && contradicting.length === 0) {
      console.log('      (no matched evidence — unsubstantiated)');
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────────');
}

// ── FIX 3: REPLAY — load a prior run's pinned claims + evidence, skip
// gather/extraction, run only stance + verdict. `evidence` in a prior
// results JSON is already in the scored `{url,title,content,credibility,
// independence,tags}` shape scoreEvidence() produces, so it's used as-is.
async function loadClaimsAndEvidence() {
  if (replayInput) {
    process.stderr.write(`[replay] loaded ${replayInput.claims.length} claims, ${replayInput.evidence.length} evidence from ${REPLAY_PATH}\n`);
    return { claims: replayInput.claims, scoredEvidence: replayInput.evidence };
  }

  const sources = await gather();
  const { claimSources, evidence } = await resolve(sources);
  const claims = await extractClaims(claimSources);

  if (claims.length === 0) {
    console.error('[extract-claims] no claims extracted — cannot proceed');
    process.exit(1);
  }

  return { claims, scoredEvidence: scoreEvidence(evidence) };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const { claims, scoredEvidence } = await loadClaimsAndEvidence();

  process.stderr.write('[stance] scoring stance per claim...\n');
  const claimEvidence = [];
  for (const claim of claims) {
    const evArr = await stanceForClaim(claim, scoredEvidence);
    claimEvidence.push({ claim, evidence: evArr });
    process.stderr.write(`[stance] ${claim.id}: ${evArr.length} matched evidence items\n`);
  }

  process.stderr.write('[verdict] computing per-claim verdicts...\n');
  const claimVerdicts = claimEvidence.map(({ claim, evidence: evArr }) => {
    const v = verdictForClaim(claim, evArr, { weigh: verificationWeight });
    return { ...v, claim, claimType: claim.type };
  });

  const overall = overallVerdict(claimVerdicts);

  process.stderr.write('[determinism] re-running verdictForClaim on pinned evidence...\n');
  let reproducible = true;
  const diffs = [];
  for (const { claim, evidence: evArr } of claimEvidence) {
    const first = verdictForClaim(claim, evArr, { weigh: verificationWeight });
    const second = verdictForClaim(claim, evArr, { weigh: verificationWeight });
    const same = JSON.stringify(first) === JSON.stringify(second);
    if (!same) {
      reproducible = false;
      diffs.push({ claimId: claim.id, first, second });
    }
  }

  printLedger({ overall, claimVerdicts, evidenceCount: scoredEvidence.length, spent: totalCostUsd });

  if (reproducible) {
    console.log('verdict pass reproducible: ✓');
  } else {
    console.log('verdict pass reproducible: ✗');
    console.log(JSON.stringify(diffs, null, 2));
  }

  const resultsDir = new URL('./results/', import.meta.url);
  mkdirSync(resultsDir, { recursive: true });
  const slug = PRODUCT.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // REPLAY writes to a distinct filename so it never clobbers the pinned
  // input JSON it just read (even mid-run, if the same slug is reused).
  const outName = replayInput ? `verify-${slug}-replay.json` : `verify-${slug}.json`;
  const outPath = new URL(outName, resultsDir);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        product: PRODUCT,
        productUrl: PRODUCT_URL,
        overall,
        claims,
        claimVerdicts,
        evidence: scoredEvidence,
        reproducible,
        totalCostUsd,
        replay: replayInput ? REPLAY_PATH : null,
      },
      null,
      2,
    ),
  );
  process.stderr.write(`[output] wrote ${outPath.pathname}\n`);
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
