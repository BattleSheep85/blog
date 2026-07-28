// Price and budget constraint parsing and enforcement. Pure, zero imports.
//
// Honesty rationale: a shopper who types "under $500", or who picks a
// "$200-$500" clarification answer, has stated a real requirement. Before
// this module existed, that budget text was read ONLY to decide whether to
// ask a follow up question (worker/lib/classifier.js). Nothing stopped an
// over-cap product from still landing at rank #1. This module reads the cap,
// floor, or range out of the text, then applies it as a real filter on the
// ranked product list.

// Multiplies a "k" suffixed number into full dollars ("$1.5k" becomes 1500).
const K_SUFFIX_MULTIPLIER = 1000;

// A price filter never drops products below this many survivors. A strict
// budget that would leave one product, or none, renders as a broken page, so
// we ship the full honest list instead.
const MIN_SURVIVORS_AFTER_PRICE_FILTER = 2;

// Plain digits, optional comma grouping, optional decimal part. Matches
// "500", "1,500", and "19.99".
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const CURRENCY_WORD = String.raw`(?:dollars?|usd|bucks)\b`;

// Keyword sets for a stated ceiling or floor. Kept separate from "more than"
// below, so "no more than" (a ceiling) can never be read as "more than" (a
// floor).
const MAX_KEYWORDS = String.raw`(?:under|below|less\s+than|up\s+to|at\s+most|no\s+more\s+than|cheaper\s+than|max(?:imum)?)`;
const MIN_KEYWORDS = String.raw`(?:over|above|at\s+least|starting\s+at)`;

// A dash separated range: "$200-$500", "$200-500", or "$200 – $500"
// (en dash and em dash both appear in clarification answers). Only the first
// number needs its own dollar sign; the second borrows it.
const RANGE_DASH_RE = new RegExp(String.raw`\$(?<num1>${NUM})(?<k1>k)?\s*[-–—]\s*\$?(?<num2>${NUM})(?<k2>k)?`, 'gi');
const RANGE_TO_RE = new RegExp(String.raw`\$(?<num1>${NUM})(?<k1>k)?\s+to\s+\$?(?<num2>${NUM})(?<k2>k)?`, 'gi');
const RANGE_BETWEEN_RE = new RegExp(String.raw`\bbetween\s+\$(?<num1>${NUM})(?<k1>k)?\s+and\s+\$?(?<num2>${NUM})(?<k2>k)?`, 'gi');

// A ceiling stated as a keyword plus a dollar amount ("under $500"), a bare
// "<" sign, a dollar amount followed by "or less", or a keyword plus a
// number spelled out in words ("under 500 dollars").
const MAX_DOLLAR_RE = new RegExp(String.raw`\b${MAX_KEYWORDS}\s+\$(?<num>${NUM})(?<k>k)?`, 'gi');
const MAX_WORD_RE = new RegExp(String.raw`\b${MAX_KEYWORDS}\s+(?<num>${NUM})(?<k>k)?\s*${CURRENCY_WORD}`, 'gi');
const MAX_LT_RE = new RegExp(String.raw`<\s*\$(?<num>${NUM})(?<k>k)?`, 'gi');
const MAX_OR_LESS_RE = new RegExp(String.raw`\$(?<num>${NUM})(?<k>k)?\s+or\s+less\b`, 'gi');

// A floor stated as a keyword plus a dollar amount ("over $500"), or as a
// dollar amount followed by a plus sign ("$500+"). "More than" is its own
// pattern below, guarded so it never fires inside "no more than".
const MIN_DOLLAR_RE = new RegExp(String.raw`\b${MIN_KEYWORDS}\s+\$(?<num>${NUM})(?<k>k)?`, 'gi');
const MIN_MORE_THAN_RE = new RegExp(String.raw`\b(?<!no\s)more\s+than\s+\$(?<num>${NUM})(?<k>k)?`, 'gi');
const MIN_PLUS_RE = new RegExp(String.raw`\$(?<num>${NUM})(?<k>k)?\+`, 'gi');

// Turns matched digit text plus a "k" flag into a plain number. Returns null
// when the digits do not form a real number. This should not happen given
// the regexes above, but parsed text from a query string is never trusted
// blindly.
function toPrice(digits, hasK) {
  const value = Number.parseFloat(String(digits).replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return hasK ? value * K_SUFFIX_MULTIPLIER : value;
}

// Runs one pattern over the text and turns each match into a constraint hit,
// tagged with its position so the caller can later pick the last one.
function collectMatches(text, pattern, toResult) {
  const hits = [];
  for (const match of text.matchAll(pattern)) {
    const result = toResult(match.groups || {});
    if (result) hits.push({ index: match.index, ...result });
  }
  return hits;
}

const maxResult = (groups) => {
  const price = toPrice(groups.num, Boolean(groups.k));
  return price === null ? null : { minPrice: null, maxPrice: price };
};

const minResult = (groups) => {
  const price = toPrice(groups.num, Boolean(groups.k));
  return price === null ? null : { minPrice: price, maxPrice: null };
};

const rangeResult = (groups) => {
  const a = toPrice(groups.num1, Boolean(groups.k1));
  const b = toPrice(groups.num2, Boolean(groups.k2));
  if (a === null || b === null) return null;
  // A reversed range ("$500-$200") still names the same span, so the low end
  // is always reported as minPrice and the high end as maxPrice.
  return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
};

/**
 * Reads a budget ceiling, floor, or range out of free text.
 *
 * Honesty rationale: "under $500" or a "$200-$500" clarification answer is a
 * real requirement, not decoration. Returns {minPrice: null, maxPrice: null}
 * for text with no price statement, so callers can treat that as "no
 * constraint" with no special case.
 *
 * A number only counts as a price when it carries a currency marker: a
 * dollar sign right before it, or the word "dollars", "dollar", "usd", or
 * "bucks" right after it. Without that marker, a bare number is just a
 * number. This is what stops "under 50 inch", "under 5 stars", and a model
 * code like "XM5" from ever being read as a price.
 *
 * When more than one price statement appears in the text, the last one
 * wins. Clarification answers are appended after the original query, so a
 * clarification answer overrides an earlier statement in the query itself.
 *
 * @param {string} text - the query, optionally followed by clarification text
 * @returns {{minPrice: number|null, maxPrice: number|null}}
 */
export function parsePriceConstraint(text) {
  if (typeof text !== 'string' || !text.trim()) return { minPrice: null, maxPrice: null };

  const hits = [
    ...collectMatches(text, RANGE_DASH_RE, rangeResult),
    ...collectMatches(text, RANGE_TO_RE, rangeResult),
    ...collectMatches(text, RANGE_BETWEEN_RE, rangeResult),
    ...collectMatches(text, MAX_DOLLAR_RE, maxResult),
    ...collectMatches(text, MAX_WORD_RE, maxResult),
    ...collectMatches(text, MAX_LT_RE, maxResult),
    ...collectMatches(text, MAX_OR_LESS_RE, maxResult),
    ...collectMatches(text, MIN_DOLLAR_RE, minResult),
    ...collectMatches(text, MIN_MORE_THAN_RE, minResult),
    ...collectMatches(text, MIN_PLUS_RE, minResult),
  ];
  if (hits.length === 0) return { minPrice: null, maxPrice: null };

  const last = hits.reduce((latest, hit) => (hit.index >= latest.index ? hit : latest));
  return { minPrice: last.minPrice, maxPrice: last.maxPrice };
}

/**
 * Filters a ranked product list down to a stated price range.
 *
 * Honesty rationale: a $600 product must never sit at rank #1 for a search
 * stated as "under $500". At the same time, a product with no known price is
 * not proof that it is over budget, so an honest "price not found" pick is
 * never punished as a budget violation. A ceiling or floor is only applied
 * while at least two products would still be left, so a strict budget can
 * never collapse a whole category down to a broken one-product report.
 *
 * Pure. Never changes `products` or any product inside it. Returns the same
 * array reference when no product is actually dropped.
 *
 * @param {Array<object>} products
 * @param {{minPrice: number|null, maxPrice: number|null}} constraint
 * @returns {Array<object>}
 */
export function applyPriceConstraint(products, constraint) {
  if (!Array.isArray(products) || products.length === 0) return products;
  const minPrice = constraint?.minPrice ?? null;
  const maxPrice = constraint?.maxPrice ?? null;
  if (minPrice === null && maxPrice === null) return products;

  const hasPrice = (p) => typeof p?.price === 'number' && Number.isFinite(p.price);
  const overCap = (p) => maxPrice !== null && hasPrice(p) && p.price > maxPrice;
  const underFloor = (p) => minPrice !== null && hasPrice(p) && p.price < minPrice;

  const inRange = products.filter((p) => !overCap(p) && !underFloor(p));
  if (inRange.length === products.length) return products;
  return inRange.length >= MIN_SURVIVORS_AFTER_PRICE_FILTER ? inRange : products;
}
