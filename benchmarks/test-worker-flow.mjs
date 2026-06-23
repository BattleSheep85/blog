// Mirrors research-worker.mjs processJob: gatherParallel + synthesizeHonest (UNLIMITED
// sources, no caps — the blackbox has no Cloudflare CPU ceiling). Proves the pivot delivers
// comprehensive + honest results at acceptable wall-clock.
import { readFileSync } from 'node:fs';
import { gatherParallel } from '../worker/engine/parallel-engine.js';
import { synthesizeHonest } from '../worker/engine/extract/index.js';
import { getTierConfig } from '../worker/lib/tiers.js';
const e = {}; for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim(); }
const F = { sold_on_amazon: true, is_buyable: true, recency_sensitive: true };
const query = 'full sized 100% keyboard with hotswapable switches';
const cat = 'mechanical keyboards';
const config = { ...getTierConfig('full'), maxConcurrency: 8 };
const t0 = Date.now();
const g = await gatherParallel(query, config, e.OPENROUTER_API_KEY, { SERPER_API_KEY: e.SERPER_API_KEY }, async (_t, m) => process.stderr.write(`  · ${m}\n`), F, cat, {});
const tg = Date.now();
process.stderr.write(`\nGATHER: ${((tg - t0) / 1000).toFixed(1)}s → ${g.sources.length} sources, ${g.notes.length} notes\n`);
const rep = await synthesizeHonest({ query, notes: g.notes, sources: g.sources, facets: F, topicalCategory: cat, openrouterKey: e.OPENROUTER_API_KEY, conSelectorModel: config.conSelectorModel });
const ts = Date.now();
process.stderr.write(`SYNTH: ${((ts - tg) / 1000).toFixed(1)}s (UNLIMITED ${g.sources.length} sources, NO caps) → ${rep.products.length} products\n`);
for (const p of rep.products.slice(0, 22)) process.stderr.write(`  #${p.rank} ${p.rating}/5 «${p.name.slice(0, 44)}» cons:${(p.cons || []).length}\n`);
