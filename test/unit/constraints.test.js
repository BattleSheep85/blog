// Assertions for the price/budget constraint parser and filter
// (worker/lib/constraints.js). Pure functions, zero deps. Run with
// `node scripts/run-tests.mjs`. These lock in the fix for the reported bug:
// a $600 product ranking #1 for a query stated as "under $500".

import { parsePriceConstraint, applyPriceConstraint } from '../../worker/lib/constraints.js';
import { validateResearchResult } from '../../worker/engine/validate.js';

// A full product for the applyPriceConstraint tests. Only `price` varies
// across most cases; the other fields are fixed so tests read cleanly.
function priced(name, price) {
  return { name, price };
}

// A full product for the end-to-end validateResearchResult path. Every
// product mentions "Headphones" so the category gate (which also runs when
// ctx.query is set) keeps them all, isolating the price gate as the only
// filter under test.
function headphone(name, price, rank) {
  return {
    name, brand: name.split(' ')[0], price, rating: 4.5, rank,
    pros: ['Comfortable fit', 'Clear sound'], cons: ['Costs more than average'],
    verdict: 'A solid pick for the stated use case overall.',
  };
}

export function runConstraintsTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) report.passed++;
    else { report.failed++; report.failures.push(`${name}: expected ${e}, got ${a}`); }
  };
  const ok = (name, cond) => eq(name, !!cond, true);

  // ── Ceiling phrases ("maxPrice") ──────────────────────────────────────────
  eq('under $500', parsePriceConstraint('under $500'), { minPrice: null, maxPrice: 500 });
  eq('below $500', parsePriceConstraint('below $500'), { minPrice: null, maxPrice: 500 });
  eq('less than $500', parsePriceConstraint('less than $500'), { minPrice: null, maxPrice: 500 });
  eq('up to $500', parsePriceConstraint('up to $500'), { minPrice: null, maxPrice: 500 });
  eq('at most $500', parsePriceConstraint('at most $500'), { minPrice: null, maxPrice: 500 });
  eq('max $500', parsePriceConstraint('max $500'), { minPrice: null, maxPrice: 500 });
  eq('maximum $500', parsePriceConstraint('maximum $500'), { minPrice: null, maxPrice: 500 });
  eq('no more than $500', parsePriceConstraint('no more than $500'), { minPrice: null, maxPrice: 500 });
  eq('$500 or less', parsePriceConstraint('$500 or less'), { minPrice: null, maxPrice: 500 });
  eq('cheaper than $500', parsePriceConstraint('cheaper than $500'), { minPrice: null, maxPrice: 500 });
  eq('<$500', parsePriceConstraint('<$500'), { minPrice: null, maxPrice: 500 });
  eq('< $500', parsePriceConstraint('< $500'), { minPrice: null, maxPrice: 500 });
  eq('under 500 dollars', parsePriceConstraint('under 500 dollars'), { minPrice: null, maxPrice: 500 });
  eq('under 500 usd', parsePriceConstraint('under 500 usd'), { minPrice: null, maxPrice: 500 });
  eq('under 500 bucks', parsePriceConstraint('under 500 bucks'), { minPrice: null, maxPrice: 500 });

  // ── Floor phrases ("minPrice") ────────────────────────────────────────────
  eq('over $500', parsePriceConstraint('over $500'), { minPrice: 500, maxPrice: null });
  eq('above $500', parsePriceConstraint('above $500'), { minPrice: 500, maxPrice: null });
  eq('more than $500', parsePriceConstraint('more than $500'), { minPrice: 500, maxPrice: null });
  eq('at least $500', parsePriceConstraint('at least $500'), { minPrice: 500, maxPrice: null });
  eq('$500+', parsePriceConstraint('$500+'), { minPrice: 500, maxPrice: null });
  eq('starting at $500', parsePriceConstraint('starting at $500'), { minPrice: 500, maxPrice: null });

  // "no more than" must never be misread as "more than". A MAX phrase must
  // never leak a floor. This is the overlap the two keyword sets must guard.
  eq('no more than is a ceiling, not a floor', parsePriceConstraint('no more than $500'), { minPrice: null, maxPrice: 500 });

  // ── Range phrases (both minPrice and maxPrice) ────────────────────────────
  eq('$200-$500', parsePriceConstraint('$200-$500'), { minPrice: 200, maxPrice: 500 });
  eq('$200-500', parsePriceConstraint('$200-500'), { minPrice: 200, maxPrice: 500 });
  eq('$200 to $500', parsePriceConstraint('$200 to $500'), { minPrice: 200, maxPrice: 500 });
  eq('between $200 and $500', parsePriceConstraint('between $200 and $500'), { minPrice: 200, maxPrice: 500 });
  eq('en dash range', parsePriceConstraint('$200 – $500'), { minPrice: 200, maxPrice: 500 });
  eq('em dash range', parsePriceConstraint('$200 — $500'), { minPrice: 200, maxPrice: 500 });

  // Reversed range swaps to a normal low/high order.
  eq('reversed range swaps min/max', parsePriceConstraint('$500-$200'), { minPrice: 200, maxPrice: 500 });

  // ── False-positive guards: a bare number with no currency marker is never a price ──
  eq('guard: "under 50 inch" is a size, not a price', parsePriceConstraint('best 4k tv under 50 inch'), { minPrice: null, maxPrice: null });
  eq('guard: "under 5 stars" is a rating, not a price', parsePriceConstraint('under 5 stars'), { minPrice: null, maxPrice: null });
  eq('guard: model code "XM5" is not a price', parsePriceConstraint('Sony WH-1000XM5'), { minPrice: null, maxPrice: null });

  // ── Number formats: comma grouping, decimals, k-suffix ────────────────────
  eq('comma-grouped thousands', parsePriceConstraint('under $1,500'), { minPrice: null, maxPrice: 1500 });
  eq('decimal price', parsePriceConstraint('$19.99 or less'), { minPrice: null, maxPrice: 19.99 });
  eq('decimal k-suffix', parsePriceConstraint('max $1.5k'), { minPrice: null, maxPrice: 1500 });
  eq('plain k-suffix', parsePriceConstraint('over $2k'), { minPrice: 2000, maxPrice: null });
  eq('k-suffix range', parsePriceConstraint('$1.5k-$2k'), { minPrice: 1500, maxPrice: 2000 });

  // ── Last match wins: a clarification answer appended after the query overrides it ──
  eq(
    'clarification range overrides an earlier query cap',
    parsePriceConstraint('best headphones under $500 $200-$300'),
    { minPrice: 200, maxPrice: 300 },
  );
  eq(
    'a later bare cap overrides an earlier range',
    parsePriceConstraint('best headphones $200-$300 under $500'),
    { minPrice: null, maxPrice: 500 },
  );

  // ── No price statement at all ─────────────────────────────────────────────
  eq('empty string', parsePriceConstraint(''), { minPrice: null, maxPrice: null });
  eq('no price language', parsePriceConstraint('best wireless headphones'), { minPrice: null, maxPrice: null });
  eq('non-string input', parsePriceConstraint(null), { minPrice: null, maxPrice: null });

  // ── applyPriceConstraint ───────────────────────────────────────────────────

  // Null price always survives, even while a real over-cap product is dropped.
  {
    const input = [priced('Unknown Price', null), priced('In Budget', 200), priced('Over Budget', 600)];
    const inputSnapshot = input.slice();
    const result = applyPriceConstraint(input, { minPrice: null, maxPrice: 500 });
    eq('null price survives, over-cap dropped', result.map((p) => p.name), ['Unknown Price', 'In Budget']);
    ok('input array reference unchanged', input.every((p, i) => p === inputSnapshot[i]));
    eq('input array length unchanged', input.length, 3);
  }

  // Fewer than 2 survivors: the whole list ships unfiltered rather than a
  // broken single-item report.
  {
    const input = [priced('A', 100), priced('B', 600), priced('C', 700)];
    const result = applyPriceConstraint(input, { minPrice: null, maxPrice: 500 });
    ok('below survivor floor returns the same reference', result === input);
    eq('below survivor floor keeps every product', result.map((p) => p.name), ['A', 'B', 'C']);
  }

  // No constraint at all: same reference back, no allocation.
  {
    const input = [priced('A', 100), priced('B', 200)];
    ok('no constraint returns same reference', applyPriceConstraint(input, { minPrice: null, maxPrice: null }) === input);
  }

  // Constraint present but nothing is actually over/under: same reference back.
  {
    const input = [priced('A', 100), priced('B', 200)];
    ok('nothing dropped returns same reference', applyPriceConstraint(input, { minPrice: null, maxPrice: 500 }) === input);
  }

  // A floor (minPrice) drops the underpriced item.
  {
    const input = [priced('Too Cheap', 50), priced('Fine', 400), priced('Also Fine', 900)];
    const result = applyPriceConstraint(input, { minPrice: 300, maxPrice: null });
    eq('floor drops underpriced item', result.map((p) => p.name), ['Fine', 'Also Fine']);
  }

  // Order is preserved, not re-sorted by price.
  {
    const input = [priced('Z', 50), priced('A', 600), priced('M', 100)];
    const result = applyPriceConstraint(input, { minPrice: null, maxPrice: 500 });
    eq('order preserved after filtering', result.map((p) => p.name), ['Z', 'M']);
  }

  // Non-number price (defensive: should never come from validate.js, which
  // always coerces price to a number or null, but the filter must not throw).
  {
    const input = [priced('String Price', '200'), priced('Real Price', 200), priced('Over', 900)];
    const result = applyPriceConstraint(input, { minPrice: null, maxPrice: 500 });
    eq('non-number price is never filtered', result.map((p) => p.name), ['String Price', 'Real Price']);
  }

  // Non-array / empty input is returned untouched.
  eq('non-array input untouched', applyPriceConstraint('nope', { minPrice: null, maxPrice: 500 }), 'nope');
  eq('empty array untouched', applyPriceConstraint([], { minPrice: null, maxPrice: 500 }), []);

  // ── End-to-end through validateResearchResult ─────────────────────────────
  {
    const result = validateResearchResult({
      summary: 'Headphones for everyday use.',
      category: 'Headphones',
      products: [
        headphone('Budget Buds Headphones', 200, 1),
        headphone('Mid Range Headphones', 300, 2),
        headphone('Solid Choice Headphones', 400, 3),
        headphone('Premium Elite Headphones', 600, 4),
      ],
    }, { query: 'best headphones under $500' });
    eq('e2e drops the over-cap product', result.products.some((p) => p.price === 600), false);
    eq('e2e keeps the three in-budget products', result.products.length, 3);
    eq('e2e renumbers ranks contiguously', result.products.map((p) => p.rank), [1, 2, 3]);
  }

  // A cap stated only in a clarification answer, not in the query itself,
  // still enforces (this is the actual reported bug: classifier.js read the
  // budget text only to decide whether to ask a question).
  {
    const result = validateResearchResult({
      summary: 'Headphones for everyday use.',
      category: 'Headphones',
      products: [
        headphone('Budget Buds Headphones', 200, 1),
        headphone('Mid Range Headphones', 300, 2),
        headphone('Premium Elite Headphones', 600, 3),
      ],
    }, { query: 'best headphones', clarifications: { budget: '$200-$500' } });
    eq('e2e clarification-only cap still enforces', result.products.map((p) => p.price), [200, 300]);
  }

  // Fail-open when ctx.query is absent (bench scripts parsing cached JSON
  // without query context). The price gate must not run at all.
  {
    const result = validateResearchResult({
      summary: 'Headphones for everyday use.',
      category: 'Headphones',
      products: [
        headphone('Budget Buds Headphones', 200, 1),
        headphone('Mid Range Headphones', 300, 2),
        headphone('Premium Elite Headphones', 600, 3),
      ],
    });
    eq('e2e fail-open with no ctx.query keeps all products', result.products.length, 3);
  }

  return report;
}
