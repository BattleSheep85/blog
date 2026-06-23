import { readFileSync, writeFileSync } from 'node:fs';
import { runParallelEngine } from '../worker/engine/parallel-engine.js';
import { getTierConfig } from '../worker/lib/tiers.js';
const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const F = { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true };
const QS = [
  { q: 'full sized keyboard, 100% layout with hotswapable switches', cat: 'mechanical keyboards' },
  { q: 'full sized 100% keyboard with hotswapable switches', cat: 'mechanical keyboards' },
];
const out = [];
for (const { q, cat } of QS) {
  process.stderr.write('gather: ' + q + '\n');
  try {
    const r = await runParallelEngine(q, { ...getTierConfig('full'), maxConcurrency: 6 }, e.OPENROUTER_API_KEY, { SERPER_API_KEY: e.SERPER_API_KEY }, async () => {}, F, cat, {});
    out.push({ query: q, facets: F, cat, sources: r.sources || [], notes: r.notes || [] });
    process.stderr.write('  → ' + (r.sources || []).length + ' sources\n');
  } catch (err) { process.stderr.write('  FAIL ' + err.message + '\n'); }
}
writeFileSync(new URL('./results/kbd-corpus.json', import.meta.url), JSON.stringify(out));
process.stderr.write('saved kbd-corpus.json\n');
