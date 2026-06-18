// Assertions for the result quality gate (worker/engine/validate.js). Pure
// functions, zero deps — run with `node scripts/run-tests.mjs`. These lock in
// the "no junk pick ranks high" behavior: the synth's own sub-3/5 editorial
// rating is the marketplace-churn-brand signal, and such picks are dropped while
// ≥3 better picks remain, without ever punishing honest null ratings or cheap-
// but-reputable budget brands.

import { applyQualityGate, MIN_RATING, validateResearchResult } from './validate.js';
import { isChurnBrand } from '../lib/brand-quality.js';
import { fossLeadersFor } from '../lib/foss-leaders.js';

// Minimal product factory — only the fields the gate reads. `brand` defaults to
// the first word of the name (so churn detection has something to match) but can
// be overridden.
function prod(name, rating, rank, brand) {
  return { name, rating, rank, brand: brand === undefined ? name.split(' ')[0] : brand };
}

// A fully-formed product for the end-to-end validateResearchResult path.
function fullProd(name, rating, rank) {
  return {
    name, brand: name.split(' ')[0], rating, rank,
    pros: ['a', 'b', 'c'], cons: ['x', 'y'],
    verdict: 'A reasonable pick for the stated use case overall.',
  };
}

function names(list) {
  return list.map((p) => p.name);
}
function ranks(list) {
  return list.map((p) => p.rank);
}

export function runValidateTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) report.passed++;
    else { report.failed++; report.failures.push(`${name}: expected ${e}, got ${a}`); }
  };

  // The reported bug: Coofandy ★2.5 ranked #3 above better picks. The gate must
  // drop it (3 stronger picks remain) and renumber ranks contiguously.
  {
    const gated = applyQualityGate([
      prod('Buck Mason', 4.0, 1),
      prod('Flint and Tinder', 3.5, 2),
      prod('Coofandy', 2.5, 3),
      prod('Abercrombie', 4.0, 4),
    ]);
    eq('drops sub-floor junk pick', names(gated), ['Buck Mason', 'Flint and Tinder', 'Abercrombie']);
    eq('renumbers ranks contiguously', ranks(gated), [1, 2, 3]);
  }

  // Thin category: when dropping would leave < 3, keep everything (a usable
  // comparison beats an empty page).
  {
    const gated = applyQualityGate([
      prod('Cheap A', 2.5, 1),
      prod('Cheap B', 2.0, 2),
      prod('Cheap C', 2.8, 3),
    ]);
    eq('keeps all when <3 would survive', names(gated), ['Cheap A', 'Cheap B', 'Cheap C']);
  }

  // Honest null ratings ("too thin to score") are NEVER dropped — we don't
  // punish the synth for abstaining.
  {
    const gated = applyQualityGate([
      prod('Rated High', 4.5, 1),
      prod('Unrated One', null, 2),
      prod('Unrated Two', null, 3),
      prod('Bad Pick', 2.0, 4),
    ]);
    eq('null ratings survive, sub-floor dropped', names(gated), ['Rated High', 'Unrated One', 'Unrated Two']);
  }

  // Exactly the floor (3.0) survives — a legit basic brand like Old Navy must
  // not be filtered. Strict less-than is the contract.
  {
    const gated = applyQualityGate([
      prod('Good A', 4.0, 1),
      prod('Old Navy', MIN_RATING, 2),
      prod('Junk', MIN_RATING - 0.1, 3),
      prod('Good B', 4.1, 4),
    ]);
    eq('floor-rated pick survives, just-below dropped', names(gated), ['Good A', 'Old Navy', 'Good B']);
  }

  // We do NOT re-sort by rating: the synth's holistic order (intent fit, price)
  // is preserved among survivors. A lower-rated pick the synth ranked first
  // stays first.
  {
    const gated = applyQualityGate([
      prod('Best Fit', 4.0, 1),
      prod('Higher Rated', 4.8, 2),
    ]);
    eq('preserves synth order (no rating re-sort)', names(gated), ['Best Fit', 'Higher Rated']);
  }

  // Out-of-order rank fields are normalized to the synth's rank intent, then
  // renumbered 1..n.
  {
    const gated = applyQualityGate([
      prod('Second', 4.0, 2),
      prod('First', 4.5, 1),
    ]);
    eq('orders by rank field then renumbers', names(gated), ['First', 'Second']);
    eq('renumbered after reorder', ranks(gated), [1, 2]);
  }

  // Denylist: a known churn brand is dropped even with a GAMED-high rating
  // (the whole point of the denylist — the rating floor can't catch these).
  {
    const gated = applyQualityGate([
      prod('Patagonia Hoody', 4.5, 1, 'Patagonia'),
      prod('Coofandy Shirt', 4.6, 2, 'Coofandy'),
      prod('Smartwool Tee', 4.4, 3, 'Smartwool'),
      prod('REI Hoodie', 4.3, 4, 'REI Co-op'),
    ]);
    eq('drops churn brand despite gamed-high rating', names(gated), ['Patagonia Hoody', 'Smartwool Tee', 'REI Hoodie']);
  }

  // Denylist is unconditional — drops a churn brand even if it takes the list
  // below 3 (an all-junk query then yields an honest non-result downstream).
  {
    const gated = applyQualityGate([
      prod('Good A', 4.0, 1, 'Patagonia'),
      prod('Junk', 4.9, 2, 'Coofandy'),
      prod('Good B', 4.1, 3, 'Smartwool'),
    ]);
    eq('churn drop is unconditional (may go below 3)', names(gated), ['Good A', 'Good B']);
  }

  // isChurnBrand normalization: case + spacing + punctuation insensitive.
  eq('churn match: exact', isChurnBrand('Coofandy'), true);
  eq('churn match: uppercase', isChurnBrand('COOFANDY'), true);
  eq('churn match: spaced + punctuated', isChurnBrand('Coo-Fandy'), true);
  eq('legit brand not churn', isChurnBrand('Patagonia'), false);
  eq('legit short electronics brand not churn', isChurnBrand('LG'), false);
  eq('empty brand not churn', isChurnBrand(''), false);

  // FOSS-leaders allowlist: photo-backup queries must inject Immich (the exact
  // reported recall gap); non-matching queries inject nothing.
  eq('foss: photo backup includes Immich', fossLeadersFor('best photo backup software for android').includes('Immich'), true);
  eq('foss: photo+video backup includes PhotoPrism', fossLeadersFor('best photo and video backup or appliance').includes('PhotoPrism'), true);
  eq('foss: media server includes Jellyfin', fossLeadersFor('best home media server').includes('Jellyfin'), true);
  eq('foss: unrelated query injects nothing', fossLeadersFor('best linen shirts for men'), []);
  eq('foss: empty query safe', fossLeadersFor(''), []);

  // Empty / non-array input is returned untouched (no throw).
  eq('empty array untouched', applyQualityGate([]), []);

  // End-to-end through validateResearchResult: the junk pick is gone from the
  // shipped products and ranks are contiguous.
  {
    const result = validateResearchResult({
      summary: 'Shirts for hot weather.',
      category: 'Apparel',
      products: [
        fullProd('Buck Mason Linen', 4.0, 1),
        fullProd('Flint Tinder Tee', 3.5, 2),
        fullProd('Coofandy Crew', 2.5, 3),
        fullProd('Abercrombie Boxy', 4.0, 4),
      ],
    });
    eq('e2e drops junk pick', result.products.some((p) => p.name === 'Coofandy Crew'), false);
    eq('e2e keeps 3 good picks', result.products.length, 3);
    eq('e2e ranks contiguous', ranks(result.products), [1, 2, 3]);
  }

  return report;
}
