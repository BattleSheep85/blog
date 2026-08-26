#!/usr/bin/env node
// no-anthropic-on-openrouter.test.mjs — zero-dep unit test for the guard in
// benchmarks/lib/no-anthropic-on-openrouter.mjs. Run directly:
//   node benchmarks/tests/no-anthropic-on-openrouter.test.mjs

import { assertNotAnthropicOnOpenRouter } from '../lib/no-anthropic-on-openrouter.mjs';

export function runNoAnthropicOnOpenRouterTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, cond) => {
    if (cond) report.passed++;
    else { report.failed++; report.failures.push(`${name}: condition was false`); }
  };
  const throws = (name, fn) => {
    try { fn(); report.failed++; report.failures.push(`${name}: expected to throw, did not`); }
    catch { report.passed++; }
  };
  const doesNotThrow = (name, fn) => {
    try { fn(); report.passed++; }
    catch (err) { report.failed++; report.failures.push(`${name}: unexpectedly threw ${err.message}`); }
  };

  throws('anthropic/claude-fable-5 throws', () => assertNotAnthropicOnOpenRouter('anthropic/claude-fable-5'));
  throws('anthropic/claude-haiku-4.5 throws', () => assertNotAnthropicOnOpenRouter('anthropic/claude-haiku-4.5'));
  doesNotThrow('minimax/minimax-m3 passes', () => assertNotAnthropicOnOpenRouter('minimax/minimax-m3'));
  doesNotThrow('google/gemini-2.5-flash passes', () => assertNotAnthropicOnOpenRouter('google/gemini-2.5-flash'));
  doesNotThrow('meta/muse-spark-1.1 passes', () => assertNotAnthropicOnOpenRouter('meta/muse-spark-1.1'));
  doesNotThrow('non-string is ignored', () => assertNotAnthropicOnOpenRouter(undefined));

  ok('sanity', true);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runNoAnthropicOnOpenRouterTests();
  console.log(`no-anthropic-on-openrouter: ${report.passed}/${report.passed + report.failed} passed`);
  for (const f of report.failures) console.log(`  FAIL ${f}`);
  process.exit(report.failed > 0 ? 1 : 0);
}
