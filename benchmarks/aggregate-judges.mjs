#!/usr/bin/env node
// Aggregate the synth-judge-panel workflow output into a per-model verdict.
// De-blinds A/B/C/D → model via judge-blinding.json, then computes mean
// grounding/recall/usefulness, Borda rank, #1-win rate, fabrication counts.
//
// Usage:
//   node benchmarks/aggregate-judges.mjs \
//     benchmarks/results/judge-results.json \
//     benchmarks/results/judge-bundles
//
import { readFileSync } from 'node:fs';

const [resultsPath, bundleDir] = process.argv.slice(2);
const panel = JSON.parse(readFileSync(resultsPath, 'utf8'));
const blinding = JSON.parse(readFileSync(`${bundleDir}/judge-blinding.json`, 'utf8'));

// idx → query (bundles were written q00..qNN in insertion order)
function queryForIdx(idx) {
  const nn = String(idx).padStart(2, '0');
  return JSON.parse(readFileSync(`${bundleDir}/q${nn}.json`, 'utf8')).query;
}

const LABELS = ['A', 'B', 'C', 'D'];
const acc = {}; // model -> stats
function bump(model) {
  return (acc[model] ??= {
    n: 0, grounding: 0, recall: 0, usefulness: 0,
    rankPoints: 0, wins: 0, fabrications: 0, jurorsSeen: 0,
  });
}

let queriesJudged = 0, jurorCount = 0;

for (const entry of panel) {
  if (!entry || entry.idx == null || !Array.isArray(entry.jurors)) continue;
  const query = queryForIdx(entry.idx);
  const map = blinding[query]; // { A: model, B: model, ... }
  if (!map) { console.error(`no blinding for "${query}"`); continue; }
  queriesJudged++;

  for (const juror of entry.jurors) {
    if (!juror?.scores) continue;
    jurorCount++;
    // Per-label scores
    for (const label of LABELS) {
      const model = map[label];
      const s = juror.scores[label];
      if (!model || !s) continue;
      const b = bump(model);
      b.n++;
      b.grounding += s.grounding || 0;
      b.recall += s.recall || 0;
      b.usefulness += s.usefulness || 0;
      b.fabrications += Array.isArray(s.fabrications) ? s.fabrications.length : 0;
    }
    // Ranking → Borda points (1st=4 … 4th=1) + win tally
    if (Array.isArray(juror.ranking)) {
      juror.ranking.forEach((label, pos) => {
        const model = map[label];
        if (!model) return;
        const b = bump(model);
        b.rankPoints += (LABELS.length - pos);
        b.jurorsSeen++;
        if (pos === 0) b.wins++;
      });
    }
  }
}

const rows = Object.entries(acc).map(([model, b]) => ({
  model,
  judgments:   b.n,
  grounding:   +(b.grounding / b.n).toFixed(2),
  recall:      +(b.recall / b.n).toFixed(2),
  usefulness:  +(b.usefulness / b.n).toFixed(2),
  composite:   +(((b.grounding + b.recall + b.usefulness) / 3) / b.n).toFixed(2),
  avg_rank:    +((b.jurorsSeen ? (LABELS.length + 1) - (b.rankPoints / b.jurorsSeen) : 0)).toFixed(2),
  win_rate:    `${b.jurorsSeen ? Math.round(100 * b.wins / b.jurorsSeen) : 0}%`,
  fab_per_judgment: +(b.fabrications / b.n).toFixed(2),
})).sort((a, b) => b.composite - a.composite);

console.log(`\nqueries judged: ${queriesJudged}/50 · juror verdicts: ${jurorCount} (target 150)\n`);
console.log('══ JUDGE-PANEL VERDICT (de-blinded, sorted by composite) ══');
console.log('grounding/recall/usefulness 0-10 · avg_rank 1=best · win_rate = % juror-ranked #1\n');
console.table(rows);
