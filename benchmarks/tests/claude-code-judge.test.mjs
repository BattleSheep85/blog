#!/usr/bin/env node
// claude-code-judge.test.mjs — zero-dep unit test for the envelope parser in
// benchmarks/lib/claude-code-judge.mjs. Run directly:
//   node benchmarks/tests/claude-code-judge.test.mjs
//
// Deliberately does NOT invoke the real Claude Code CLI. It only exercises
// parseEnvelope() against hand-built JSON strings, the same shape the CLI's
// `--output-format json` produces (see benchmarks/lib/claude-code-judge.mjs
// for the live probe that established this shape).

import { parseEnvelope } from '../lib/claude-code-judge.mjs';

export function runClaudeCodeJudgeTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, actual, expected) => {
    const A = JSON.stringify(actual); const E = JSON.stringify(expected);
    if (A === E) report.passed++;
    else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, cond) => eq(name, !!cond, true);
  const throws = (name, fn) => {
    try { fn(); report.failed++; report.failures.push(`${name}: expected to throw, did not`); }
    catch { report.passed++; }
  };

  const validEnvelope = () => JSON.stringify({
    result: '{"usefulness": 8}',
    total_cost_usd: 0.1858,
    modelUsage: { 'claude-opus-5': { canonicalModel: 'claude-opus-5', provider: 'firstParty' } },
  });

  // 1. A valid firstParty opus envelope parses cleanly.
  const parsed = parseEnvelope(validEnvelope());
  eq('valid: text', parsed.text, '{"usefulness": 8}');
  eq('valid: costUsd', parsed.costUsd, 0.1858);
  eq('valid: model', parsed.model, 'claude-opus-5');
  eq('valid: provider', parsed.provider, 'firstParty');

  // 2. Missing `result` field throws.
  throws('missing-result throws', () => parseEnvelope(JSON.stringify({
    total_cost_usd: 0.1,
    modelUsage: { 'claude-opus-5': { canonicalModel: 'claude-opus-5', provider: 'firstParty' } },
  })));

  // 3. Wrong provider (e.g. a metered API key path) throws.
  throws('wrong-provider throws', () => parseEnvelope(JSON.stringify({
    result: '{}',
    total_cost_usd: 0.1,
    modelUsage: { 'claude-opus-5': { canonicalModel: 'claude-opus-5', provider: 'thirdParty' } },
  })));

  // 4. A non-opus model id throws, even with firstParty provider.
  throws('non-opus model throws', () => parseEnvelope(JSON.stringify({
    result: '{}',
    total_cost_usd: 0.1,
    modelUsage: { 'claude-haiku-4.5': { canonicalModel: 'claude-haiku-4.5', provider: 'firstParty' } },
  })));

  // 5. Malformed JSON throws.
  throws('malformed JSON throws', () => parseEnvelope('not json at all'));

  // 6. Missing modelUsage entirely throws (provider comes back null).
  throws('missing modelUsage throws', () => parseEnvelope(JSON.stringify({ result: '{}' })));

  ok('sanity: eq helper works', 1 === 1);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runClaudeCodeJudgeTests();
  console.log(`claude-code-judge: ${report.passed}/${report.passed + report.failed} passed`);
  for (const f of report.failures) console.log(`  FAIL ${f}`);
  process.exit(report.failed > 0 ? 1 : 0);
}
