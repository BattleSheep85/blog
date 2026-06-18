// Vendored sentiment + cue lexicons for the pure-ML extraction engine (Phase 0).
// DATA, not a package — hand-curated, product-review-focused. Expandable; this is a
// proof subset (a few hundred terms) sufficient to validate the approach on the
// bench fixtures + typical review prose. No dependencies.

// VADER-style valence (-4..+4). Product-review vocabulary, lowercased single tokens.
export const VALENCE = {
  // positive
  excellent: 3.2, great: 3.0, best: 3.4, amazing: 3.1, superb: 3.3, outstanding: 3.2,
  fantastic: 3.1, perfect: 3.0, love: 2.6, loved: 2.6, loves: 2.4, favorite: 2.3,
  recommend: 2.0, recommended: 2.1, reliable: 2.2, durable: 2.4, sturdy: 2.1, solid: 1.9,
  comfortable: 2.2, comfy: 2.0, premium: 1.6, smooth: 1.8, fast: 2.0, quick: 1.7,
  responsive: 1.9, quiet: 1.9, crisp: 1.6, sharp: 1.5, bright: 1.3, accurate: 2.0,
  precise: 1.9, value: 1.8, affordable: 1.7, cheap: 0.4, bargain: 1.8, worth: 1.6,
  impressive: 2.4, impressed: 2.2, strong: 1.8, powerful: 1.8, efficient: 1.9,
  versatile: 1.7, easy: 1.6, intuitive: 1.8, seamless: 1.9, gorgeous: 2.4, sleek: 1.7,
  lightweight: 1.2, portable: 1.2, rugged: 1.6, robust: 1.8, clean: 1.2, balanced: 1.4,
  good: 1.6, nice: 1.3, decent: 0.8, capable: 1.3, standout: 2.2, leads: 1.4, wins: 1.6,
  // negative
  bad: -1.9, poor: -2.1, terrible: -3.0, awful: -3.0, horrible: -3.1, worst: -3.2,
  disappointing: -2.3, disappointed: -2.3, mediocre: -1.6, lacking: -1.6, weak: -1.6,
  flimsy: -2.2, cheaply: -1.8, fragile: -2.0, breaks: -2.1, broken: -2.2, defective: -2.6,
  unreliable: -2.4, buggy: -2.0, glitchy: -1.9, slow: -1.8, sluggish: -1.9, laggy: -1.9,
  loud: -1.4, noisy: -1.6, uncomfortable: -2.0, bulky: -1.3, heavy: -0.8, hot: -0.9,
  overheats: -2.0, throttles: -1.8, throttle: -1.6, rattle: -1.5, rattles: -1.5,
  wobbly: -1.7, creaky: -1.6, mushy: -1.3, dim: -1.2, washed: -1.2, inaccurate: -2.0,
  overpriced: -2.2, expensive: -1.0, pricey: -1.0, frustrating: -2.1, annoying: -1.8,
  inconsistent: -1.7, variance: -1.0, complaints: -1.6, issue: -1.0, issues: -1.2,
  problem: -1.3, problems: -1.5, fails: -2.0, failure: -2.1, dies: -1.8, leak: -1.6,
  mediocre_hdr: -1.2, downside: -1.2, drawback: -1.4, gripe: -1.1, concern: -0.9,
  worse: -1.6, lacks: -1.5, missing: -1.2, limited: -1.0, weaker: -1.3, strict: -0.8,
  subpar: -2.0, underwhelming: -2.0, struggles: -1.6, cramped: -1.5, stiff: -1.2,
  plasticky: -1.6, choppy: -1.4, tinny: -1.5, harsh: -1.3, finicky: -1.5, clunky: -1.5,
  dated: -1.2, shallow: -1.1, mediocre: -1.6, wind: -0.3, rough: -1.1, truncated: -1.0,
  incomplete: -1.3, small: -0.7, tight: -0.6, fills: -0.5,
};

// Negators flip polarity of the next few tokens.
export const NEGATORS = new Set(['not', 'no', "n't", 'never', 'without', 'lacks', 'lack', 'cannot', "can't", 'hardly', 'barely', 'rarely', 'fails', 'avoid']);
// Intensifiers scale the next sentiment word.
export const INTENSIFIERS = { very: 1.4, really: 1.3, extremely: 1.6, incredibly: 1.6, super: 1.4, highly: 1.3, especially: 1.2, particularly: 1.2, remarkably: 1.4, '': 1 };
// Marketing/hype words — used to FILTER fluff and to seed marketingToIgnore.
export const MARKETING = new Set(['revolutionary', 'gamechanging', 'game-changing', 'flawless', 'next-generation', 'nextgen', 'premium', 'cutting-edge', 'best-in-class', 'world-class', 'unrivaled', 'unmatched', 'ultimate', 'must-have', 'life-changing', 'perfect', '#1', 'number-one']);

// Cue phrases that signal a buyer's-guide-worthy sentence in a source.
export const CUES = {
  howToChoose: [/\blook for\b/i, /\bconsider\b/i, /\bwhat (?:actually )?matters\b/i, /\bpay attention to\b/i, /\bkey (?:spec|feature|factor)/i, /\bprioriti[sz]e\b/i, /\bdepends on\b/i, /\bchoose .* if\b/i],
  pitfalls: [/\bavoid\b/i, /\bwatch out\b/i, /\bbe (?:wary|skeptical|careful)\b/i, /\bcommon mistake\b/i, /\bdon't\b/i, /\bbeware\b/i, /\bpitfall\b/i, /\bgotcha\b/i],
  marketingToIgnore: [/\bmarketing\b/i, /\bhype\b/i, /\bignore\b/i, /\bgimmick\b/i, /\bdoesn't matter\b/i, /\boutsized .* claim/i, /\binflated\b/i, /\bbuzzword/i],
};
