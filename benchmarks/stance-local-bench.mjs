#!/usr/bin/env node
// stance-local-bench.mjs — compares LOCAL Ollama models against the
// production stance classifier (gpt-5.4-mini) on the SAME pinned
// claims/evidence, to evaluate moving TrueRank's stance/detection step to
// local inference. Free — no OpenRouter calls; everything runs against a
// local Ollama daemon (http://localhost:11434).
//
// Loads a REPLAY reference run (pinned claims + evidence pool + the
// gpt-5.4-mini stance/verdict decisions already embedded in its
// claimVerdicts[].supporting/contradicting), re-runs stance + verdict for
// each candidate local model against the identical evidence, and scores
// agreement against the reference.
//
// Usage:
//   node benchmarks/stance-local-bench.mjs
//   REFERENCE=<path> node benchmarks/stance-local-bench.mjs
//   MODELS="nemotron-3-nano:4b,granite3.3:8b" node benchmarks/stance-local-bench.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  topEvidenceForClaim,
  buildClaimEvidence,
  classifyStance,
} from '../worker/engine/verify.js';
import { verdictForClaim } from '../worker/lib/verdict.js';

const OLLAMA_URL = 'http://localhost:11434/v1/chat/completions';
const OLLAMA_CALL_TIMEOUT_MS = 120_000;
const EVIDENCE_TOP_N = 15;
const CANDIDATE_TIME_BUDGET_MS = 10 * 60 * 1000; // ~10 min/model soft cutoff

const REFERENCE_PATH =
  process.env.REFERENCE ||
  new URL('./results/verify-anker-soundcore-space-a40-replay.json', import.meta.url).pathname;

const DEFAULT_MODELS = ['nemotron-3-nano:4b', 'granite3.3:8b', 'glm-4.7-flash:latest', 'cogito:32b'];
const MODELS = process.env.MODELS
  ? process.env.MODELS.split(',').map((m) => m.trim()).filter(Boolean)
  : DEFAULT_MODELS;

const BANNED_SUBSTRINGS = ['deepseek'];
for (const m of MODELS) {
  if (BANNED_SUBSTRINGS.some((b) => m.toLowerCase().includes(b))) {
    throw new Error(`refusing to benchmark vetoed model: ${m}`);
  }
}

// ── Ollama shim — matches the callLLM(apiKey, model, messages, opts) contract
// classifyStance() expects: returns { choices:[{message:{content}}], usage }.
async function callLLMOllama(_apiKey, model, messages, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_CALL_TIMEOUT_MS);
  try {
    const resp = await fetch(OLLAMA_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: opts?.maxTokens ?? 2000,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`ollama HTTP ${resp.status}: ${body.slice(0, 500)}`);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    return {
      choices: [{ message: { content } }],
      usage: { cost: 0 },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Smoke test — 1-token call to nemotron to confirm the daemon is serving.
async function smokeTest() {
  process.stderr.write('[smoke] pinging Ollama daemon (nemotron-3-nano:4b, 1 token)...\n');
  const resp = await callLLMOllama(
    'local',
    'nemotron-3-nano:4b',
    [{ role: 'user', content: 'Say "ok".' }],
    { maxTokens: 5 },
  );
  const content = resp.choices[0].message.content;
  process.stderr.write(`[smoke] ok — got: ${JSON.stringify(content).slice(0, 80)}\n`);
}

// ── Load reference run ────────────────────────────────────────────────────
function loadReference(path) {
  const text = readFileSync(path, 'utf8');
  const parsed = JSON.parse(text);
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
  const claimVerdicts = Array.isArray(parsed.claimVerdicts) ? parsed.claimVerdicts : [];
  if (claims.length === 0 || evidence.length === 0) {
    throw new Error(`reference ${path} is missing claims[] or evidence[]`);
  }
  return { product: parsed.product, claims, evidence, claimVerdicts };
}

// Reference stance rows keyed by claimId -> Map(url -> stance). Only
// non-neutral rows survive into claimVerdicts[].supporting/contradicting
// (buildClaimEvidence keeps all matched rows, but verdictForClaim's
// supporting/contradicting split only retains support/contradict stances —
// neutral rows aren't stored in the reference JSON at all). Agreement is
// therefore scored only over the (claim,url) pairs where the reference has a
// recorded support/contradict stance.
function referenceStanceIndex(claimVerdicts) {
  const index = new Map();
  for (const cv of claimVerdicts) {
    const claimId = cv?.claim?.id;
    if (!claimId) continue;
    const byUrl = new Map();
    for (const ev of cv.supporting || []) byUrl.set(ev.url, 'support');
    for (const ev of cv.contradicting || []) byUrl.set(ev.url, 'contradict');
    index.set(claimId, byUrl);
  }
  return index;
}

function referenceVerdictIndex(claimVerdicts) {
  const index = new Map();
  for (const cv of claimVerdicts) {
    const claimId = cv?.claim?.id;
    if (!claimId) continue;
    index.set(claimId, cv.status);
  }
  return index;
}

// ── Per-model run ──────────────────────────────────────────────────────────
async function runModelOnClaim(model, claim, evidencePool) {
  const top = topEvidenceForClaim(evidencePool, EVIDENCE_TOP_N);
  const startedAt = Date.now();
  let rows = [];
  let parseFail = false;
  try {
    const result = await classifyStance({
      claim,
      evidence: top,
      apiKey: 'local',
      model,
      callLLM: callLLMOllama,
    });
    rows = result.rows;
    // classifyStance() returns rows=[] both on genuine "no verdicts" AND on
    // JSON parse failure. Evidence was non-empty, so an empty row set here
    // means the model's output didn't parse into usable {url,stance} rows.
    if (top.length > 0 && rows.length === 0) parseFail = true;
  } catch (err) {
    parseFail = true;
    process.stderr.write(`[${model}] ${claim.id} call failed: ${err.message}\n`);
  }
  const elapsedMs = Date.now() - startedAt;

  const claimEvidence = buildClaimEvidence(claim, top, rows);
  const verdict = verdictForClaim(claim, claimEvidence, { policy: 'verification' });

  return { claimEvidence, verdict, parseFail, elapsedMs, rowsByUrl: new Map(rows.map((r) => [r.url, r.stance])) };
}

async function runModel(model, claims, evidencePool) {
  process.stderr.write(`\n[${model}] starting ${claims.length} claim(s)...\n`);
  const modelStartedAt = Date.now();
  const perClaim = [];
  let parseFails = 0;
  let cutOff = false;

  for (const claim of claims) {
    if (Date.now() - modelStartedAt > CANDIDATE_TIME_BUDGET_MS) {
      process.stderr.write(
        `[${model}] exceeded ${(CANDIDATE_TIME_BUDGET_MS / 60000).toFixed(0)} min budget — cutting off, ${claims.length - perClaim.length} claim(s) skipped\n`,
      );
      cutOff = true;
      break;
    }
    const { claimEvidence, verdict, parseFail, elapsedMs, rowsByUrl } = await runModelOnClaim(
      model,
      claim,
      evidencePool,
    );
    if (parseFail) parseFails += 1;
    perClaim.push({ claim, claimEvidence, verdict, parseFail, elapsedMs, rowsByUrl });
    process.stderr.write(
      `[${model}] ${claim.id} done in ${(elapsedMs / 1000).toFixed(1)}s — status=${verdict.status}${parseFail ? ' (parse-fail)' : ''}\n`,
    );
  }

  const totalMs = Date.now() - modelStartedAt;
  return { model, perClaim, parseFails, cutOff, totalMs };
}

// ── Scoring ────────────────────────────────────────────────────────────────
function scoreModel(modelRun, refStanceIdx, refVerdictIdx) {
  let stanceMatch = 0;
  let stanceCompared = 0;
  let verdictMatch = 0;
  let verdictCompared = 0;

  for (const { claim, verdict, rowsByUrl } of modelRun.perClaim) {
    const refByUrl = refStanceIdx.get(claim.id) || new Map();
    for (const [url, refStance] of refByUrl.entries()) {
      if (!rowsByUrl.has(url)) continue; // candidate didn't return a row for this url
      stanceCompared += 1;
      if (rowsByUrl.get(url) === refStance) stanceMatch += 1;
    }

    const refStatus = refVerdictIdx.get(claim.id);
    if (refStatus !== undefined) {
      verdictCompared += 1;
      if (verdict.status === refStatus) verdictMatch += 1;
    }
  }

  const claimsRun = modelRun.perClaim.length;
  const avgSPerClaim = claimsRun > 0 ? modelRun.totalMs / claimsRun / 1000 : 0;

  return {
    model: modelRun.model,
    stanceAgreePct: stanceCompared > 0 ? round1((stanceMatch / stanceCompared) * 100) : null,
    stanceCompared,
    verdictAgreePct: verdictCompared > 0 ? round1((verdictMatch / verdictCompared) * 100) : null,
    verdictCompared,
    parseFails: modelRun.parseFails,
    avgSPerClaim: round1(avgSPerClaim),
    cutOff: modelRun.cutOff,
    claimsRun,
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// ── Worst-model per-claim diff ────────────────────────────────────────────
function worstModel(scores) {
  const scored = scores.filter((s) => s.verdictAgreePct !== null);
  if (scored.length === 0) return scores[0] || null;
  return scored.reduce((worst, s) => (s.verdictAgreePct < worst.verdictAgreePct ? s : worst));
}

function printPerClaimDiff(modelRun, refVerdictIdx) {
  console.log(`\n── Per-claim diff — worst-agreeing model: ${modelRun.model} ──`);
  for (const { claim, verdict, parseFail } of modelRun.perClaim) {
    const refStatus = refVerdictIdx.get(claim.id) ?? '(no reference)';
    const match = refStatus === verdict.status ? '=' : '≠';
    console.log(
      `[${claim.id}] "${claim.text}"\n    ref=${refStatus}  ${match}  ${modelRun.model}=${verdict.status}${parseFail ? '  (parse-fail)' : ''}`,
    );
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  await smokeTest();

  const reference = loadReference(REFERENCE_PATH);
  process.stderr.write(
    `[reference] loaded "${reference.product}" — ${reference.claims.length} claims, ${reference.evidence.length} evidence from ${REFERENCE_PATH}\n`,
  );

  const refStanceIdx = referenceStanceIndex(reference.claimVerdicts);
  const refVerdictIdx = referenceVerdictIndex(reference.claimVerdicts);

  const modelRuns = [];
  for (const model of MODELS) {
    const run = await runModel(model, reference.claims, reference.evidence);
    modelRuns.push(run);
  }

  const scores = modelRuns.map((run) => scoreModel(run, refStanceIdx, refVerdictIdx));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`STANCE LOCAL BENCH — reference: gpt-5.4-mini on "${reference.product}"`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.table(
    scores.map((s) => ({
      model: s.model,
      'stance_agree%': s.stanceAgreePct ?? 'n/a',
      'verdict_agree%': s.verdictAgreePct ?? 'n/a',
      parse_fails: s.parseFails,
      avg_s_per_claim: s.avgSPerClaim,
      claims_run: s.claimsRun,
      cut_off: s.cutOff,
    })),
  );

  const worst = worstModel(scores);
  const worstRun = modelRuns.find((r) => r.model === worst?.model);
  if (worstRun) printPerClaimDiff(worstRun, refVerdictIdx);

  const resultsDir = new URL('./results/', import.meta.url);
  mkdirSync(resultsDir, { recursive: true });
  const outPath = new URL('stance-local-bench.json', resultsDir);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        reference: REFERENCE_PATH,
        product: reference.product,
        models: MODELS,
        scores,
        modelRuns: modelRuns.map((r) => ({
          model: r.model,
          parseFails: r.parseFails,
          cutOff: r.cutOff,
          totalMs: r.totalMs,
          perClaim: r.perClaim.map((pc) => ({
            claimId: pc.claim.id,
            claimText: pc.claim.text,
            status: pc.verdict.status,
            confidence: pc.verdict.confidence,
            parseFail: pc.parseFail,
            elapsedMs: pc.elapsedMs,
            stanceRows: Array.from(pc.rowsByUrl.entries()).map(([url, stance]) => ({ url, stance })),
          })),
        })),
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
