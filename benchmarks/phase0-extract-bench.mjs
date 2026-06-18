#!/usr/bin/env node
// Phase-0 proof: run the pure-ML extraction synthesizer on the trap fixtures and
// score it on the SAME axes as the LLM bench — groundedness (expect 0/0 by
// construction), trap-suppression, legit-on-top, schema — plus dump full reports
// for a human read. No API calls, no spend, ~instant.
//
//   node benchmarks/phase0-extract-bench.mjs

import { writeFileSync } from 'node:fs';
import { synthesizeExtractive } from '../worker/engine/extract/index.js';
import { SYNTH_SCENARIOS } from './synth-fixture.mjs';
import { EXTRA_SCENARIOS } from './synth-fixture-glm-extra.mjs';

const ALL = [...SYNTH_SCENARIOS, ...EXTRA_SCENARIOS];

// --- reuse the groundedness metric (facts must trace to sources) ---
function numbersIn(t) { const o = []; const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g; let m; while ((m = re.exec(String(t || ''))) !== null) { const n = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(n)) o.push(n); } return o; }
const grounded = (n, S) => S.some((s) => n === s || Math.abs(n - s) <= 0.5 || (s !== 0 && Math.abs(n - s) / Math.abs(s) <= 0.03));
const srcNums = (sc) => numbersIn([...(sc.notes || []).map((x) => x.content), ...(sc.sources || []).map((s) => s.content)].join(' '));
const wc = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function schemaScore(p) {
  const prods = p.products || [];
  const prodOk = prods.length ? avg(prods.map((x) => avg([
    typeof x?.name === 'string' && x.name.trim().length > 0,
    Array.isArray(x?.pros) && x.pros.length >= 3,
    Array.isArray(x?.cons) && x.cons.length >= 2,
    typeof x?.verdict === 'string' && wc(x.verdict) >= 12,
  ].map((b) => (b ? 1 : 0))))) : 0;
  const bg = p.buyersGuide || {};
  const bgOk = avg([
    typeof bg.howToChoose === 'string' && bg.howToChoose.length > 0,
    Array.isArray(bg.pitfalls) && bg.pitfalls.length >= 3,
    Array.isArray(bg.marketingToIgnore) && bg.marketingToIgnore.length >= 3,
  ].map((b) => (b ? 1 : 0)));
  return round(avg([prods.length >= 3 ? 1 : 0, prodOk, bgOk]));
}

const rows = [];
const dump = [];
for (const sc of ALL) {
  const S = srcNums(sc);
  const t0 = Date.now();
  const report = synthesizeExtractive(sc.query, sc.notes, sc.sources, sc.facets, sc.topicalCategory);
  const ms = Date.now() - t0;
  const prods = report.products || [];
  const names = prods.map((x) => (x.name || '').toLowerCase());
  const trapIdx = names.findIndex((n) => n.includes(sc.trap.toLowerCase()));
  const legitTop = prods.length && sc.legit.some((L) => names[0].includes(L.toLowerCase()));
  const legitRecall = sc.legit.filter((L) => names.some((n) => n.includes(L.toLowerCase()))).length / sc.legit.length;
  // groundedness
  let pT = 0, pU = 0, sT = 0, sU = 0;
  for (const p of prods) {
    if (typeof p.price === 'number') { pT++; if (!grounded(p.price, S)) pU++; }
    for (const v of Object.values(p.specs || {})) for (const n of numbersIn(v)) { sT++; if (!grounded(n, S)) sU++; }
  }
  rows.push({
    scenario: sc.query.slice(0, 34), products: prods.length,
    trap_present: trapIdx >= 0 ? `YES@${trapIdx + 1}` : 'no',
    legit_1st: legitTop ? 'yes' : 'NO', legit_recall: round(legitRecall, 2),
    ungrounded_price: pT ? round(pU / pT, 2) : '—', ungrounded_spec: sT ? round(sU / sT, 2) : '—',
    schema: schemaScore(report), ms,
  });
  dump.push({ query: sc.query, trap: sc.trap, legit: sc.legit, report });
}

writeFileSync(new URL('./results/phase0-extract-reports.json', import.meta.url), JSON.stringify(dump, null, 2));
console.log('\n=== Phase 0: pure-ML extraction engine vs trap fixtures ===');
console.table(rows);
const trapLeaks = rows.filter((r) => r.trap_present !== 'no').length;
const ungroundedAny = rows.some((r) => (r.ungrounded_price !== '—' && r.ungrounded_price > 0) || (r.ungrounded_spec !== '—' && r.ungrounded_spec > 0));
console.log(`\ntrap leaks: ${trapLeaks}/${rows.length}  |  any ungrounded number: ${ungroundedAny ? 'YES (BUG)' : 'no (0 by construction)'}  |  full reports → results/phase0-extract-reports.json`);
