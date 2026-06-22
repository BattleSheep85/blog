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
import { MESSY_SCENARIOS } from './synth-fixture-messy.mjs';

const ALL = [...SYNTH_SCENARIOS, ...EXTRA_SCENARIOS, ...MESSY_SCENARIOS];
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const norm = (s) => String(s || '').toLowerCase();

// ── output-cleanliness checks (the messy-fixture regression net) ──────────────
// Local entity decode so groundedness compares like-for-like (the engine gains
// its own decodeEntities in Q1; the eval keeps an independent copy on purpose so
// the gate can't be fooled by importing the very code it audits).
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', bull: ' ', middot: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
function decodeEntities(t) {
  return String(t || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const c = parseInt(h, 16); return Number.isFinite(c) && c >= 0x20 ? String.fromCodePoint(c) : ' '; })
    .replace(/&#(\d+);/g, (_, d) => { const c = parseInt(d, 10); return Number.isFinite(c) && c >= 0x20 && !(c >= 0x2022 && c <= 0x2606) ? String.fromCodePoint(c) : ' '; })
    .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] ?? ' '));
}
// A surviving entity in OUTPUT (after the engine should have decoded) — also
// catches the mangled "& 9679" form stripMarkdown produces from "&#9679;".
const ENTITY = /&(?:#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|[a-z]+);?|&\s*#?\s*\d{2,};?/i;
// Trailing non-name token bled into a product name.
const BLEED_TAIL = /\b(appears|delivers|offers|features|excellent|great|amazing|best|good|loud|small|sharp|crisp|review|reviews|tested|the|a|an)$/i;
const ORD_OR_DEC = /\b(?:\d+(?:st|nd|rd|th)|\d+\.\d+)$/i;
const STOP_BESTFOR = new Set(['under', 'for', 'the', 'a', 'an', 'with', 'and', 'or', 'to', 'of', 'best', 'top', 'more']);
const nameDirty = (name) => { const n = String(name || '').trim(); return ENTITY.test(n) || BLEED_TAIL.test(n) || ORD_OR_DEC.test(n); };
const bestForDirty = (bf) => { const v = String(bf || '').trim().toLowerCase(); if (!v) return false; const toks = v.split(/\s+/).filter(Boolean); return ENTITY.test(v) || toks.every((t) => STOP_BESTFOR.has(t)); };
// Every human-facing string the report emits (for entity + groundedness sweeps).
const reportStrings = (rep) => {
  const out = [];
  const bg = rep.buyersGuide || {};
  out.push(rep.summary, bg.howToChoose, bg.pitfalls, bg.marketingToIgnore);
  for (const p of rep.products || []) {
    out.push(p.name, p.brand, p.best_for ?? p.bestFor, p.verdict, ...(p.pros || []), ...(p.cons || []), ...Object.values(p.specs || {}));
  }
  return out.filter((s) => typeof s === 'string' && s.length > 0);
};
// Whitespace/punct-insensitive normalization for substring grounding.
const groundNorm = (s) => decodeEntities(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
function numbersIn(t) { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; }
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
const srcNums = (sc) => numbersIn([...(sc.notes || []).map((x) => x.content), ...(sc.sources || []).map((s) => s.content)].join(' '));

const agg = { scen: 0, trap: 0, ungrounded: 0, prec: [], recall: [], single: [], dup: [], pros: [], cons: [], r5: 0, rN: 0, ms: [],
  nameDirty: 0, nameTotal: 0, entity: 0, textUng: 0, bestforDirty: 0, band: 0, bandTotal: 0 };
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

  // ── output cleanliness + text groundedness (messy-fixture net) ──
  // name + best_for cleanliness
  let nameDirtyN = 0, bestforDirtyN = 0;
  for (const p of prods) { if (nameDirty(p.name)) nameDirtyN++; if (bestForDirty(p.best_for ?? p.bestFor)) bestforDirtyN++; }
  // surviving HTML entities in any emitted string
  const strs = reportStrings(rep);
  const entityHits = strs.filter((s) => ENTITY.test(s)).length;
  // text groundedness: every emitted name/pro/con/best_for must appear (post-decode,
  // punct-insensitive) as a substring of some source/note text. Catches fabrication
  // AND entity-mangling artifacts that are not in any real span.
  const corpus = ' ' + [...(sc.sources || []).map((s) => `${s.title} ${s.content}`), ...(sc.notes || []).map((n) => n.content)].map(groundNorm).join(' ') + ' ';
  // Only the VERBATIM fields are grounding-checked: name, pros, cons. best_for /
  // verdict / summary are templated/paraphrased prose by design (best_for has its
  // own bestfor_dirty gate), so holding them to a substring rule is wrong.
  const checkStrings = [];
  for (const p of prods) {
    checkStrings.push(p.name, ...(p.pros || []), ...(p.cons || []));
  }
  let textUng = 0;
  for (const s of checkStrings) {
    if (typeof s !== 'string' || !s.trim()) continue;
    const g = groundNorm(s);
    if (g.length < 4) continue; // too short to verify meaningfully
    if (!corpus.includes(' ' + g + ' ') && !corpus.includes(g)) textUng++;
  }
  // rating-band: fraction of products parked on the 3.5 floor [3.4,3.6]
  const bandN = prods.filter((p) => typeof p.rating === 'number' && p.rating >= 3.4 && p.rating <= 3.6).length;

  agg.scen++; if (trapHit) agg.trap++; agg.ungrounded += ung;
  agg.prec.push(precision); agg.recall.push(recall); agg.single.push(singleRate); agg.dup.push(dupRate);
  agg.pros.push(avg(prods.map((p) => (p.pros || []).length))); agg.cons.push(avg(prods.map((p) => (p.cons || []).length)));
  agg.r5 += r5; agg.rN += prods.length;
  agg.nameDirty += nameDirtyN; agg.nameTotal += prods.length; agg.entity += entityHits;
  agg.textUng += textUng; agg.bestforDirty += bestforDirtyN; agg.band += bandN; agg.bandTotal += prods.length;

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
  // messy-fixture cleanliness net
  name_dirty_rate: round(agg.nameTotal ? agg.nameDirty / agg.nameTotal : 0, 3),
  entity_hits: agg.entity, text_ungrounded: agg.textUng, bestfor_dirty: agg.bestforDirty,
  rating_band_rate: round(agg.bandTotal ? agg.band / agg.bandTotal : 0, 3),
};
console.log('\nAGGREGATE:', JSON.stringify(m, null, 1));

const gates = [
  ['trap=0', m.trap_leaks === 0], ['ungrounded=0', m.ungrounded_total === 0],
  ['legit_recall>=0.9', m.legit_recall >= 0.9], ['single_attribution>=0.9', m.single_attribution >= 0.9],
  ['dup_pro_rate<=0.1', m.dup_pro_rate <= 0.1], ['pct_rating5<=0.34', m.pct_rating5 <= 0.34],
  ['product_precision>=0.9', m.product_precision >= 0.9],
  // NEW gates — FAIL on extraction-v0, must PASS after Q1–Q6
  ['name_dirty_rate==0', m.name_dirty_rate === 0],
  ['entity_hits==0', m.entity_hits === 0],
  ['text_ungrounded==0', m.text_ungrounded === 0],
  ['bestfor_dirty==0', m.bestfor_dirty === 0],
  ['avg_cons>=0.6', m.avg_cons >= 0.6],
  ['rating_band_rate<=0.6', m.rating_band_rate <= 0.6],
];
const failed = gates.filter(([, ok]) => !ok);
console.log('\nGATES:'); for (const [name, ok] of gates) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(failed.length ? `\n${failed.length} gate(s) FAILED.` : '\nALL GATES PASS.');
process.exit(failed.length ? 1 : 0);
