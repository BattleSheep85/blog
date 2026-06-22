// Coverage for the pure helpers in llm.js: the reasoning-effort time budgets and
// the context-pruning algorithm (truncate middle tool outputs, then drop oldest).
import { llmBudgetMs, pruneMessages } from '../../worker/engine/llm.js';

export function runLlmTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // llmBudgetMs — all four branches.
  eq('budget high', llmBudgetMs('high').hardMs, 360_000);
  eq('budget medium', llmBudgetMs('medium').hardMs, 240_000);
  eq('budget low', llmBudgetMs('low').hardMs, 180_000);
  eq('budget default', llmBudgetMs(undefined).hardMs, 120_000);

  // pruneMessages — under budget → returned unchanged (same reference).
  {
    const msgs = [{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }];
    ok('prune: under budget unchanged', pruneMessages(msgs) === msgs);
  }

  // Over budget but <= KEEP_HEAD+KEEP_TAIL (12) messages → can't prune, unchanged.
  {
    const msgs = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: 'x'.repeat(11_000) + i }));
    ok('prune: too few messages to prune → unchanged', pruneMessages(msgs) === msgs);
  }

  // Over budget with >12 messages: middle tool outputs truncated, then oldest
  // middle dropped while still over (huge un-truncatable head forces the drop loop).
  {
    const head = [{ role: 'system', content: 'h'.repeat(70_000) }, { role: 'user', content: 'h'.repeat(70_000) }];
    const middle = Array.from({ length: 4 }, (_, i) => ({ role: 'tool', content: 't'.repeat(1_000) + i }));
    const tail = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: 'tail' + i }));
    const out = pruneMessages([...head, ...middle, ...tail]);
    ok('prune: returns a new array', Array.isArray(out));
    ok('prune: keeps head', out[0].content.length === 70_000);
    ok('prune: keeps the 10-message tail', out.slice(-10).every((m) => m.content.startsWith('tail')));
    ok('prune: dropped/truncated the middle tool spam', out.length < 2 + 4 + 10);
  }

  return report;
}
