// rescore-io.mjs — small shared readers for the v2 re-score scripts
// (synth-gold-rescore.mjs, synth-gold-leaderboard-v2.mjs). Read-only: nothing
// here writes, so a stored benchmark artifact can never be edited through it.

import { readFileSync, existsSync } from 'node:fs';

export const readJsonl = (url) => readFileSync(url, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l));

export const readJsonIfPresent = (url) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null);

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

// Blinding maps carry OpenRouter model ids; the runs file carries short labels.
// This maps one to the other so old and new numbers can sit side by side.
const LABEL_BY_MODEL_ID = Object.freeze({
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'minimax/minimax-m3': 'minimax-m3',
  'deepseek/deepseek-v4-flash': 'deepseek-v4-flash',
  'google/gemma-4-26b-a4b-it:free': 'gemma-4-26b',
  'openai/gpt-5-nano': 'gpt-5-nano',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4.5',
});

// Mean of the OLD judge axes per label, deblinded from the stored maps. Used
// for the side-by-side print only; these numbers are known to be invalid for
// grounding and honesty (docs/benchmark-validity-audit.md section 1).
export function loadOldJudgeAxes(baseUrl) {
  const scores = readJsonIfPresent(new URL('./ft-data/synth-gold-fable-scores.json', baseUrl));
  const blinding = readJsonIfPresent(new URL('./ft-data/synth-gold-blinding.json', baseUrl));
  const out = new Map();
  if (!scores || !blinding) return out;
  const acc = new Map();
  const queries = Object.keys(blinding);
  queries.forEach((query, i) => {
    const letterToModel = blinding[query];
    const bundle = scores[`q${String(i).padStart(2, '0')}`] || {};
    for (const [letter, axes] of Object.entries(bundle)) {
      if (!axes) continue;
      const label = LABEL_BY_MODEL_ID[letterToModel[letter]] || letterToModel[letter];
      const prev = acc.get(label) || { g: [], u: [], h: [] };
      acc.set(label, { g: [...prev.g, axes.g], u: [...prev.u, axes.u], h: [...prev.h, axes.h] });
    }
  });
  for (const [label, axes] of acc) {
    out.set(label, {
      g: round2(mean(axes.g)), u: round2(mean(axes.u)), h: round2(mean(axes.h)),
      oldComposite: round2(0.4 * mean(axes.g) + 0.35 * mean(axes.h) + 0.25 * mean(axes.u)),
      n: axes.g.length,
    });
  }
  return out;
}

// Candidate labels (muse-spark) were judged by a separate committed script into
// their own files, one per label.
export function loadOldCandidateComposite(baseUrl, label) {
  const file = readJsonIfPresent(new URL(`../ft-data/synth-gold-fable-scores-candidate-${label}.json`, baseUrl));
  return file ? round2(file.avgComposite) : null;
}
