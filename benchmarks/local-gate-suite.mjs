#!/usr/bin/env node
// Local Ollama gate batch driver (2026-07-13) — runs the synthesis groundedness
// gate (glm52-synth-bench.mjs, local mode) over every chat model Ollama is
// currently serving on the 7900 XTX, reasoning OFF only (the only mode every
// model — thinking and non-thinking — supports). Sequential (one GPU), resilient
// (one bad model never aborts the batch), and produces the per-model
// results/local-synth-<slug>.json files the aggregator reads afterward.
//
//   node benchmarks/local-gate-suite.mjs
//   MODELS=phi4-mini:3.8b,gemma2:9b node benchmarks/local-gate-suite.mjs   (smoke test)

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EXCLUDE = (process.env.EXCLUDE || '').split(',').map((s) => s.trim()).filter(Boolean);
const PER_MODEL_TIMEOUT_MS = Number(process.env.PER_MODEL_TIMEOUT_MS || 1_200_000);
const NON_CHAT_RE = /embed|bge|nomic|minilm/i;
const ALWAYS_EXCLUDED = Object.freeze(['deepseek-r1']); // vetoed model — never auto-run, EXCLUDE env is additive on top
const BENCH_SCRIPT = fileURLToPath(new URL('./glm52-synth-bench.mjs', import.meta.url));

async function fetchModelIds(baseUrl) {
  const res = await fetch(`${baseUrl}/v1/models`);
  if (!res.ok) throw new Error(`GET /v1/models failed: HTTP ${res.status}`);
  const body = await res.json();
  const ids = Array.isArray(body?.data) ? body.data.map((m) => m.id).filter(Boolean) : [];
  return ids;
}

function isExcluded(id) {
  if (NON_CHAT_RE.test(id)) return true;
  if (ALWAYS_EXCLUDED.some((substr) => id.includes(substr))) return true;
  return EXCLUDE.some((substr) => id.includes(substr));
}

async function resolveModelList(baseUrl) {
  const override = (process.env.MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (override.length) return override;
  const all = await fetchModelIds(baseUrl);
  return all.filter((id) => !isExcluded(id));
}

// Runs one model's bench as a child process, resolving with {ok, note} once the
// child exits, times out, or errors. Never rejects — callers get a settled result.
function runOneModel(model, baseUrl, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BENCH_SCRIPT], {
      env: { ...process.env, SYNTH_BASE_URL: baseUrl, SYNTH_MODEL: model, SYNTH_THINK: 'off', EXPANDED: '1' },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    let settled = false;
    const finish = (ok, note) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, note });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(false, `timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    child.on('error', (err) => finish(false, err?.message || String(err)));
    child.on('exit', (code, signal) => {
      if (settled) return;
      if (code === 0) finish(true, 'ok');
      else finish(false, `exit code ${code}${signal ? ` (signal ${signal})` : ''}`);
    });
  });
}

async function runBatch(models, baseUrl, timeoutMs) {
  const summary = [];
  for (const model of models) {
    const t0 = Date.now();
    process.stderr.write(`\n=== [${model}] starting (timeout ${Math.round(timeoutMs / 1000)}s) ===\n`);
    let result;
    try {
      result = await runOneModel(model, baseUrl, timeoutMs);
    } catch (e) {
      result = { ok: false, note: e?.message || String(e) };
    }
    const ms = Date.now() - t0;
    process.stderr.write(`=== [${model}] ${result.ok ? 'OK' : 'FAILED'} — ${result.note} — ${Math.round(ms / 1000)}s ===\n`);
    summary.push({ model, ok: result.ok, ms, note: result.note });
  }
  return summary;
}

function printSummary(summary) {
  const succeeded = summary.filter((s) => s.ok);
  const failed = summary.filter((s) => !s.ok);
  process.stderr.write('\n\n=== local-gate-suite summary ===\n');
  console.table(summary.map((s) => ({
    model: s.model, ok: s.ok, seconds: Math.round(s.ms / 1000), note: s.note,
  })));
  process.stderr.write(`succeeded (${succeeded.length}): ${succeeded.map((s) => s.model).join(', ') || '(none)'}\n`);
  process.stderr.write(`failed (${failed.length}): ${failed.map((s) => s.model).join(', ') || '(none)'}\n`);
}

async function main() {
  const models = await resolveModelList(OLLAMA_URL);
  if (!models.length) {
    process.stderr.write('no models resolved — check OLLAMA_URL / MODELS / EXCLUDE\n');
    process.exit(1);
  }
  process.stderr.write(`local-gate-suite: ${models.length} model(s) — ${models.join(', ')}\n`);
  const summary = await runBatch(models, OLLAMA_URL, PER_MODEL_TIMEOUT_MS);
  printSummary(summary);
}

main();
