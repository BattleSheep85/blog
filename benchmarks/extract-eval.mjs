#!/usr/bin/env node
// Phase-1 quality gate for the pure-ML extraction engine. Groundedness is 0 by
// construction (the Phase-0 proof), so this measures the NEW failure class —
// WRONG-not-fabricated: attribution, recall, ranking, rating calibration, depth.
// All auto-computed against the fixtures' known legit/trap labels (no hand labels).
//
//   node benchmarks/extract-eval.mjs
//
// GATES (exit 1 if any fail): trap=0, ungrounded=0, legit_recall≥0.9,
// single_attribution≥0.9, dup_pro_rate≤0.1, pct_rating5≤0.34.

import { synthesizeExtractive } from '../worker/engine/extract/index.js';
import { SYNTH_SCENARIOS } from './synth-fixture.mjs';
import { EXTRA_SCENARIOS } from './synth-fixture-glm-extra.mjs';

const ALL = [...SYNTH_SCENARIOS, ...EXTRA_SCENARIOS];
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const norm = (s) => String(s || '').toLowerCase();
function numbersIn(t) { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; }
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
const srcNums = (sc) => numbersIn([...(sc.notes || []).map((x) => x.content), ...(sc.sources || []).map((s) => s.content)].join(' '));

const agg = { scen: 0, trap: 0, ungrounded: 0, prec: [], recall: [], single: [], dup: [], pros: [], cons: [], r5: 0, rN: 0, ms: [] };
const rows = [];
for (const sc of ALL) {
  const S = srcNums(sc);
  const t0 = Date.now();
  const rep = synthesizeExtractive(sc.query, sc.notes, sc.sources, sc.facets, sc.topicalCategory);
  agg.ms.push(Date.now() - t0);
  const prods = rep.products || [];
  const names = prods.map((p) => norm(p.name));
  const legitL = sc.legit.map(norm);
  const isLegit = (n) => legitL.some((L) => n.includes(L) || L.includes(n));
  const trapHit = names.some((n) => n.includes(norm(sc.trap)));

  // product precision/recall vs the known legit set
  const truePos = names.filter(isLegit).length;
  const precision = prods.length ? truePos / prods.length : 1;
  const recall = sc.legit.length ? sc.legit.filter((L) => names.some((n) => n.includes(norm(L)) || norm(L).includes(n))).length / sc.legit.length : 1;

  // attribution: a pro/con sentence is "single-product" if it mentions only its owner
  const allMatchers = prods.map((p) => norm(p.name)).concat(prods.flatMap((p) => norm(p.brand)).filter(Boolean));
  let single = 0, multi = 0;
  const proConIndex = new Map(); // sentence → set of owners (for dup detection)
  for (const p of prods) {
    for (const s of [...(p.pros || []), ...(p.cons || [])]) {
      const low = norm(s);
      const mentioned = prods.filter((q) => q !== p && (low.includes(norm(q.name)) || (q.brand && low.includes(norm(q.brand)) && norm(q.brand).length > 3)));
      if (mentioned.length === 0) single++; else multi++;
      const key = low.slice(0, 80);
      if (!proConIndex.has(key)) proConIndex.set(key, new Set());
      proConIndex.get(key).add(p.name);
    }
  }
  const singleRate = single + multi ? single / (single + multi) : 1;
  const dupCount = [...proConIndex.values()].filter((set) => set.size >= 2).length;
  const dupRate = proConIndex.size ? dupCount / proConIndex.size : 0;

  // groundedness (must stay 0)
  let ung = 0;
  for (const p of prods) {
    if (typeof p.price === 'number' && !grounded(p.price, S)) ung++;
    for (const v of Object.values(p.specs || {})) for (const n of numbersIn(v)) if (!grounded(n, S)) ung++;
  }
  const r5 = prods.filter((p) => p.rating === 5).length;

  agg.scen++; if (trapHit) agg.trap++; agg.ungrounded += ung;
  agg.prec.push(precision); agg.recall.push(recall); agg.single.push(singleRate); agg.dup.push(dupRate);
  agg.pros.push(avg(prods.map((p) => (p.pros || []).length))); agg.cons.push(avg(prods.map((p) => (p.cons || []).length)));
  agg.r5 += r5; agg.rN += prods.length;

  rows.push({
    scenario: sc.query.slice(0, 30), n: prods.length, trap: trapHit ? 'LEAK' : 'ok',
    precision: round(precision, 2), recall: round(recall, 2),
    single_attr: round(singleRate, 2), dup_pro: round(dupRate, 2),
    avg_pros: round(avg(prods.map((p) => (p.pros || []).length)), 1), avg_cons: round(avg(prods.map((p) => (p.cons || []).length)), 1),
    rating5: r5, ungrounded: ung,
  });
}

console.log('\n=== Extraction engine — Phase 1 quality eval ===');
console.table(rows);
const m = {
  trap_leaks: agg.trap, ungrounded_total: agg.ungrounded,
  product_precision: round(avg(agg.prec), 3), legit_recall: round(avg(agg.recall), 3),
  single_attribution: round(avg(agg.single), 3), dup_pro_rate: round(avg(agg.dup), 3),
  avg_pros: round(avg(agg.pros), 2), avg_cons: round(avg(agg.cons), 2),
  pct_rating5: round(agg.rN ? agg.r5 / agg.rN : 0, 3), p50_ms: agg.ms.sort((a, b) => a - b)[Math.floor(agg.ms.length / 2)],
};
console.log('\nAGGREGATE:', JSON.stringify(m, null, 1));

const gates = [
  ['trap=0', m.trap_leaks === 0], ['ungrounded=0', m.ungrounded_total === 0],
  ['legit_recall>=0.9', m.legit_recall >= 0.9], ['single_attribution>=0.9', m.single_attribution >= 0.9],
  ['dup_pro_rate<=0.1', m.dup_pro_rate <= 0.1], ['pct_rating5<=0.34', m.pct_rating5 <= 0.34],
  ['product_precision>=0.9', m.product_precision >= 0.9],
];
const failed = gates.filter(([, ok]) => !ok);
console.log('\nGATES:'); for (const [name, ok] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(failed.length ? `\n${failed.length} gate(s) FAILED.` : '\nALL GATES PASS.');
process.exit(failed.length ? 1 : 0);
