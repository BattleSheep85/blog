#!/usr/bin/env node
// synth-gold-leaderboard-v2.mjs — joins the corrected halves and prints the
// leaderboard (docs/benchmark-validity-audit.md section 6.6). Costs $0.
//
//   composite_v2 = 0.45 * gDet + 0.30 * evidence_discipline + 0.25 * usefulness
//
// composite_v2 is NOT comparable to the stored composite. The grounding axis
// changed source (exact code over the full corpus, instead of an LLM reading a
// 6,000 character digest) and the judge axes changed meaning.
//
// Usage:
//   node benchmarks/synth-gold-leaderboard-v2.mjs
//
// Reads  benchmarks/ft-data/synth-gold-grounding-v2.json
//        benchmarks/ft-data/synth-gold-quality-v2-*.json
//        benchmarks/ft-data/synth-gold-blinding-v2*.json
// Writes benchmarks/ft-data/synth-gold-leaderboard-v2.json

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJsonIfPresent, loadOldJudgeAxes, loadOldCandidateComposite, mean, round2 } from './lib/rescore-io.mjs';

const FT_DIR = new URL('./ft-data/', import.meta.url);
const GROUNDING_PATH = new URL('./synth-gold-grounding-v2.json', FT_DIR);
const OUT_PATH = new URL('./synth-gold-leaderboard-v2.json', FT_DIR);

export const WEIGHTS = Object.freeze({ gDet: 0.45, evidenceDiscipline: 0.30, usefulness: 0.25 });

export const compositeV2 = ({ gDet, evidenceDiscipline, usefulness }) => round2(
  WEIGHTS.gDet * gDet + WEIGHTS.evidenceDiscipline * evidenceDiscipline + WEIGHTS.usefulness * usefulness,
);

// Blinding file name -> the quality file that was judged from the same bundles.
const pairFiles = (dir) => {
  const files = readdirSync(dir);
  return files
    .filter((f) => /^synth-gold-quality-v2-.+\.json$/.test(f))
    .map((quality) => {
      const slug = quality.replace(/^synth-gold-quality-v2-/, '').replace(/\.json$/, '');
      const blinding = slug === 'incumbents'
        ? 'synth-gold-blinding-v2.json'
        : `synth-gold-blinding-v2-${slug}.json`;
      if (!files.includes(blinding)) throw new Error(`quality file ${quality} has no matching blinding map ${blinding}`);
      return { slug, quality, blinding };
    });
};

// A candidate bundle holds one report under letter A, so its model id alone
// cannot identify the run. The slug carries the label.
const labelFor = (slug, modelId, byModelId) => (slug === 'incumbents' ? byModelId.get(modelId) : slug);

function collectJudged(dir, byModelId) {
  const rows = [];
  let costUsd = 0;
  let incomplete = [];
  for (const { slug, quality, blinding } of pairFiles(dir)) {
    const q = readJsonIfPresent(new URL(quality, FT_DIR));
    const map = readJsonIfPresent(new URL(blinding, FT_DIR));
    costUsd += q.costUsd || 0;
    if (!q.complete) incomplete = [...incomplete, slug];
    for (const [query, letters] of Object.entries(q.results)) {
      for (const [letter, s] of Object.entries(letters)) {
        if (s.failed) continue;   // reliability strike, carried by the completion rate
        rows.push({
          query, label: labelFor(slug, map[query]?.[letter], byModelId),
          usefulness: s.usefulness, evidenceDiscipline: s.evidence_discipline,
        });
      }
    }
  }
  return { rows, costUsd, incomplete };
}

function join(grounding, judged) {
  const gByKey = new Map(grounding.rows.map((r) => [`${r.label}|${r.query}`, r]));
  return judged.rows.map((j) => {
    const g = gByKey.get(`${j.label}|${j.query}`);
    if (!g) throw new Error(`no deterministic row for ${j.label} on "${j.query}" (re-run synth-gold-rescore.mjs)`);
    return { ...j, gDet: g.gDet, composite: compositeV2({ gDet: g.gDet, evidenceDiscipline: j.evidenceDiscipline, usefulness: j.usefulness }) };
  });
}

const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

function aggregate(joined, grounding, oldAxes) {
  const byLabel = new Map();
  for (const r of joined) byLabel.set(r.label, [...(byLabel.get(r.label) || []), r]);
  return [...byLabel.entries()].map(([label, rows]) => {
    const agg = grounding.perModel.find((m) => m.label === label);
    const composites = rows.map((r) => r.composite);
    const old = oldAxes.get(label);
    return {
      label,
      model: agg?.model ?? 'unknown',
      n: rows.length,
      completions: agg?.completions ?? 'n/a',
      gDet: agg?.gDetMean ?? null,
      evidenceDiscipline: round2(mean(rows.map((r) => r.evidenceDiscipline))),
      usefulness: round2(mean(rows.map((r) => r.usefulness))),
      compositeV2: round2(mean(composites)),
      stdevComposite: round2(stdev(composites)),
      sem: round2(stdev(composites) / Math.sqrt(rows.length)),
      fabricatedProducts: agg?.fabricatedProducts ?? null,
      fabricatedCitations: agg?.fabricatedCitations ?? null,
      ungroundedNumbers: agg?.ungroundedNumbers ?? null,
      genCostUsd: agg?.genCostUsd ?? null,
      costPerReportUsd: agg && agg.genCostUsd !== null ? round2(agg.genCostUsd / rows.length) : null,
      oldComposite: old?.oldComposite ?? loadOldCandidateComposite(import.meta.url, label),
    };
  }).sort((a, b) => b.compositeV2 - a.compositeV2);
}

function main() {
  const grounding = readJsonIfPresent(GROUNDING_PATH);
  if (!grounding) throw new Error(`${fileURLToPath(GROUNDING_PATH)} missing. Run synth-gold-rescore.mjs first.`);
  const byModelId = new Map(grounding.perModel.map((m) => [m.model, m.label]));
  const dir = fileURLToPath(FT_DIR);
  const judged = collectJudged(dir, byModelId);
  const joined = join(grounding, judged);
  const oldAxes = loadOldJudgeAxes(import.meta.url);
  const table = aggregate(joined, grounding, oldAxes);

  console.log('\n══ SYNTHESIS LEADERBOARD v2 (corrected measurement) ══');
  console.log('NOT COMPARABLE to the stored composite. Grounding is now exact code over the FULL');
  console.log('corpus, and the judge axes changed meaning. The old column is shown for context only,');
  console.log('and its grounding and honesty inputs are known to be invalid.\n');
  console.table(table.map((r) => ({
    label: r.label,
    completions: r.completions,
    gDet: r.gDet,
    evid_disc: r.evidenceDiscipline,
    useful: r.usefulness,
    composite_v2: r.compositeV2,
    'sem±': r.sem,
    old_composite: r.oldComposite ?? 'n/a',
    cost_per_report: r.costPerReportUsd,
  })));
  if (judged.incomplete.length) console.log(`WARNING: incomplete judge sets (spend cap): ${judged.incomplete.join(', ')}`);
  console.log(`judge spend recorded across all v2 quality files: $${judged.costUsd.toFixed(4)}`);

  writeFileSync(OUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    formula: 'composite_v2 = 0.45*gDet + 0.30*evidence_discipline + 0.25*usefulness',
    notComparableTo: 'synth-gold-fable-scores.json composites (0.4*g + 0.35*h + 0.25*u, judged through a 6000-char digest)',
    judgeCostUsd: judged.costUsd,
    incompleteSets: judged.incomplete,
    leaderboard: table,
    perReport: joined,
  }, null, 2));
  console.log(`\nwrote ${OUT_PATH.pathname}`);
}

main();
