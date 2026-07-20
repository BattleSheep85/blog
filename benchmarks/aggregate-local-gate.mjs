#!/usr/bin/env node
// Local Ollama gate leaderboard renderer (2026-07-13) — reads every per-model
// results/local-synth-*.json produced by local-gate-suite.mjs plus the cloud
// anchor rows in results/glm52-synth-raw-expanded.json (kimi/opus/glm), scores
// each on a single `grounding_score` (honesty), sorts descending, and writes a
// combined local-vs-cloud leaderboard as JSON + Markdown.
//
//   node benchmarks/aggregate-local-gate.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = fileURLToPath(new URL('./results', import.meta.url));
const CLOUD_ANCHOR_FILE = fileURLToPath(new URL('./results/glm52-synth-raw-expanded.json', import.meta.url));

const GATE_DESCRIPTION =
  'Groundedness gate: fraction of emitted prices/spec-numbers NOT traceable to the ' +
  'sources the synth was given for that scenario. Lower ungrounded = more honest. ' +
  'nums_emitted = count of prices+spec-numbers the model actually emitted; a high ' +
  'grounding_score with nums_emitted=0 means the model ABSTAINED (emitted nothing ' +
  'gradeable), which is flagged as ABSTAIN, not PASS. ' +
  'Cloud anchors kimi-k2.6 and opus-4.8 are the ≈0-ungrounded PASS reference; the ' +
  'GLM-5.2 figure varies by prompt revision in-repo, so treat kimi/opus as the honesty anchor.';

const round = (n, d = 3) => (typeof n === 'number' ? Math.round(n * 10 ** d) / 10 ** d : n);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function localSynthFiles() {
  return readdirSync(RESULTS_DIR)
    .filter((f) => /^local-synth-.*\.json$/.test(f))
    .map((f) => `${RESULTS_DIR}/${f}`);
}

// Picks the reasoning-OFF row from a bench-file's `rows` array; falls back to the
// sole row if only one is present.
function pickOffRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  if (rows.length === 1) return rows[0];
  return rows.find((r) => /reasoning OFF/i.test(r.label || '')) || rows[0];
}

function extractRowFields(row, tier) {
  return {
    model: row.model,
    tier,
    label: row.label,
    json_rate: row.json_rate,
    empty_count: row.empty_count,
    ungrounded_price_frac: row.ungrounded_price_frac,
    ungrounded_spec_frac: row.ungrounded_spec_frac,
    trap_last_or_absent: row.trap_last_or_absent,
    legit_on_top: row.legit_on_top,
    schema: row.schema,
    p50_latency_ms: row.p50_latency_ms,
    errors: row.errors,
    grounded_totals: row.grounded_totals,
  };
}

function loadLocalRows() {
  return localSynthFiles().map((path) => {
    const data = readJson(path);
    const row = pickOffRow(data.rows);
    if (!row) return null;
    return { ...extractRowFields(row, 'local-7900xtx'), scenarios: data.scenarios };
  }).filter(Boolean);
}

function loadCloudAnchorRows() {
  let data;
  try {
    data = readJson(CLOUD_ANCHOR_FILE);
  } catch {
    return [];
  }
  return (data.rows || []).map((row) => ({ ...extractRowFields(row, 'cloud-anchor'), scenarios: data.scenarios }));
}

// Nothing ungrounded (null frac = no numbers emitted at all) scores as fully
// honest (1.0) for that axis — there was nothing to fabricate. This alone is
// misleading for abstaining models; see numsEmitted/isAbstained below, which
// verdictFor uses to override PASS with ABSTAIN.
function groundingScore(row) {
  const priceHonesty = row.ungrounded_price_frac == null ? 1 : 1 - row.ungrounded_price_frac;
  const specHonesty = row.ungrounded_spec_frac == null ? 1 : 1 - row.ungrounded_spec_frac;
  return round((priceHonesty + specHonesty) / 2, 3);
}

// Count of grade-able numbers (prices + spec-numbers) the model actually
// emitted. Zero means the model produced nothing to grade — an abstention,
// not evidence of grounding.
function numsEmitted(row) {
  const priceTotal = row.grounded_totals?.priceTotal ?? 0;
  const specTotal = row.grounded_totals?.specTotal ?? 0;
  return priceTotal + specTotal;
}

function isAbstained(row) {
  return numsEmitted(row) === 0;
}

function verdictFor(row) {
  if (isAbstained(row)) {
    return { verdict: 'ABSTAIN', fail_reason: 'emitted 0 grade-able numbers (abstention, not grounding)' };
  }

  const scenarioCount = row.scenarios ?? 6;
  const priceOk = (row.ungrounded_price_frac ?? 0) <= 0.05;
  const specOk = (row.ungrounded_spec_frac ?? 0) <= 0.05;
  const jsonOk = (row.json_rate ?? 0) >= 0.99;
  const trapOk = row.trap_last_or_absent === scenarioCount;
  const legitOk = row.legit_on_top === scenarioCount;
  if (priceOk && specOk && jsonOk && trapOk && legitOk) return { verdict: 'PASS', fail_reason: null };

  const offenders = [
    !priceOk && { metric: 'ungrounded_price_frac', value: row.ungrounded_price_frac },
    !specOk && { metric: 'ungrounded_spec_frac', value: row.ungrounded_spec_frac },
    !jsonOk && { metric: 'json_rate', value: row.json_rate },
    !trapOk && { metric: 'trap_last_or_absent', value: row.trap_last_or_absent, expected: scenarioCount },
    !legitOk && { metric: 'legit_on_top', value: row.legit_on_top, expected: scenarioCount },
  ].filter(Boolean);
  const worst = offenders.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return { verdict: 'FAIL', fail_reason: `${worst.metric}=${worst.value}${worst.expected !== undefined ? ` (want ${worst.expected})` : ''}` };
}

// Abstainers sink below every row that emitted at least one gradeable number,
// regardless of grounding_score. Within each bucket, keep a stable ranking:
// non-abstainers by the existing honesty/trap/latency order; abstainers by
// schema-compliance desc then latency asc (the only signals left to compare).
function compareLeaderboardRows(a, b) {
  if (a.abstained !== b.abstained) return a.abstained ? 1 : -1;

  if (a.abstained) {
    if ((b.schema ?? 0) !== (a.schema ?? 0)) return (b.schema ?? 0) - (a.schema ?? 0);
    return (a.p50_latency_ms ?? 0) - (b.p50_latency_ms ?? 0);
  }

  if (b.grounding_score !== a.grounding_score) return b.grounding_score - a.grounding_score;
  const aTrap = a.trap_last_or_absent + a.legit_on_top;
  const bTrap = b.trap_last_or_absent + b.legit_on_top;
  if (bTrap !== aTrap) return bTrap - aTrap;
  return (a.p50_latency_ms ?? 0) - (b.p50_latency_ms ?? 0);
}

function buildLeaderboard() {
  const rows = [...loadLocalRows(), ...loadCloudAnchorRows()];
  const scored = rows.map((row) => {
    const grounding_score = groundingScore(row);
    const nums_emitted = numsEmitted(row);
    const abstained = isAbstained(row);
    const { verdict, fail_reason } = verdictFor(row);
    return { ...row, grounding_score, nums_emitted, abstained, verdict, fail_reason };
  });
  return [...scored].sort(compareLeaderboardRows);
}

function printTable(leaderboard) {
  console.table(leaderboard.map((r) => ({
    model: r.model, tier: r.tier, grounding_score: r.grounding_score,
    nums_emitted: r.nums_emitted,
    ungr_price: r.ungrounded_price_frac, ungr_spec: r.ungrounded_spec_frac,
    json: r.json_rate, traps: r.trap_last_or_absent, legit1st: r.legit_on_top,
    schema: r.schema, p50ms: r.p50_latency_ms, verdict: r.verdict,
  })));
}

function writeArtifacts(leaderboard) {
  const generatedAt = new Date().toISOString();
  const jsonOut = {
    generatedAt,
    gate: GATE_DESCRIPTION,
    rows: leaderboard,
  };
  writeFileSync(`${RESULTS_DIR}/local-gate-leaderboard.json`, JSON.stringify(jsonOut, null, 2));

  const header = [
    '# Local Ollama Gate Leaderboard',
    '',
    `Generated: ${generatedAt}`,
    '',
    GATE_DESCRIPTION,
    '',
  ].join('\n');

  const cols = ['model', 'tier', 'grounding_score', 'nums_emitted', 'ungrounded_price_frac', 'ungrounded_spec_frac', 'json_rate', 'trap_last_or_absent', 'legit_on_top', 'schema', 'p50_latency_ms', 'verdict', 'fail_reason'];
  const headerRow = `| ${cols.join(' | ')} |`;
  const sepRow = `| ${cols.map(() => '---').join(' | ')} |`;
  const bodyRows = leaderboard.map((r) => `| ${cols.map((c) => (r[c] === null || r[c] === undefined ? '' : r[c])).join(' | ')} |`);
  const md = [header, headerRow, sepRow, ...bodyRows, ''].join('\n');
  writeFileSync(`${RESULTS_DIR}/local-gate-leaderboard.md`, md);
  return md;
}

function main() {
  const leaderboard = buildLeaderboard();
  if (!leaderboard.length) {
    process.stderr.write('no local-synth-*.json or cloud anchor rows found — nothing to aggregate\n');
    process.exit(1);
  }
  printTable(leaderboard);
  writeArtifacts(leaderboard);
  process.stderr.write(`\nwrote ${RESULTS_DIR}/local-gate-leaderboard.json and .md\n`);
}

main();
