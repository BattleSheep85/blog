// claude-code-judge.mjs — run one judging prompt through the Claude Code CLI,
// billed to the owner's Claude subscription, never through OpenRouter.
//
// THE OWNER'S RULE (2026-07-29): any Anthropic model used for benchmark
// judging must run through this transport. See
// benchmarks/lib/no-anthropic-on-openrouter.mjs for the companion guard that
// stops an Anthropic model id from reaching OpenRouter by accident.
//
// Transport choice: the prompt is piped on STDIN with no positional argv
// prompt, and no --input-format flag (plain text is the default). Judging
// bundles run to several kilobytes of JSON; stdin avoids argv length limits
// and shell quoting risk entirely, and it was verified live against the CLI
// (see report). The CLI is spawned with an argv array, never a shell string,
// so prompt content can never be shell-interpreted.
//
// Environment hygiene: ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are
// stripped from the child's environment before spawn. If either reached the
// CLI, billing could go to a metered key instead of the subscription. The
// returned envelope's `provider` field is asserted to be "firstParty" as a
// second, independent check.

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 120_000;
const REQUIRED_PROVIDER = 'firstParty';
const REQUIRED_MODEL_SUBSTRING = 'opus';
const RETRYABLE = Symbol('retryable-transport-failure');

function childEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function runClaudeCli(prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--model', 'opus', '--output-format', 'json'],
      { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      const err = new Error(`claude-code-judge: CLI timed out after ${timeoutMs}ms`);
      err[RETRYABLE] = true;
      reject(err);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const wrapped = new Error(`claude-code-judge: failed to spawn CLI: ${err.message}`);
      wrapped[RETRYABLE] = true;
      reject(wrapped);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`claude-code-judge: CLI exited ${code}: ${stderr.slice(0, 2000)}`);
        err[RETRYABLE] = true;
        reject(err);
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export function parseEnvelope(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`claude-code-judge: CLI output was not parseable JSON: ${err.message}`);
  }
  if (typeof envelope.result !== 'string') {
    throw new Error('claude-code-judge: CLI envelope had no string "result" field');
  }
  const usage = envelope.modelUsage ? Object.values(envelope.modelUsage)[0] : null;
  const provider = usage?.provider ?? null;
  const canonicalModel = usage?.canonicalModel ?? null;
  if (provider !== REQUIRED_PROVIDER) {
    throw new Error(
      `claude-code-judge: expected provider "${REQUIRED_PROVIDER}", got "${provider}". `
      + 'Refusing to trust this call, billing may not be on the subscription.',
    );
  }
  if (typeof canonicalModel !== 'string' || !canonicalModel.includes(REQUIRED_MODEL_SUBSTRING)) {
    throw new Error(
      `claude-code-judge: expected a model id containing "${REQUIRED_MODEL_SUBSTRING}", got "${canonicalModel}"`,
    );
  }
  return {
    text: envelope.result,
    costUsd: Number.isFinite(envelope.total_cost_usd) ? envelope.total_cost_usd : 0,
    model: canonicalModel,
    provider,
  };
}

// Tracks cumulative spend across calls made through this module instance,
// the same running-total pattern the OpenRouter-based judge scripts use.
let cumulativeCostUsd = 0;

export function getCumulativeCostUsd() {
  return cumulativeCostUsd;
}

export function resetCumulativeCostUsd() {
  cumulativeCostUsd = 0;
}

export async function judgeWithClaudeCode(prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const start = Date.now();
  let stdout;
  try {
    stdout = await runClaudeCli(prompt, timeoutMs);
  } catch (err) {
    if (err[RETRYABLE]) {
      // One retry, transport failures only. A refusal or malformed answer
      // is not a transport failure and must surface, not be retried.
      stdout = await runClaudeCli(prompt, timeoutMs);
    } else {
      throw err;
    }
  }
  const parsed = parseEnvelope(stdout);
  cumulativeCostUsd += parsed.costUsd;
  return { ...parsed, durationMs: Date.now() - start };
}
