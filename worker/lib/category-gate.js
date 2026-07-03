// Shared category-relevance gate for synth validation and extract analysis.
// Drops cross-category leaks (a mouse in a bulbs query, a purifier in an air-fryer query).

const CAT_STOP = new Set([
  'best', 'the', 'and', 'for', 'with', 'under', 'top', 'over', 'from', 'your', 'our',
  'full', 'sized', 'size', 'layout', 'review', 'reviews', 'guide', 'cheap', 'budget',
  'good', 'great', 'new', 'this', 'that', 'percent', 'inch', 'inches', 'home',
]);

/** @returns {Set<string>} lowercased category + query terms (len ≥ 4, with naive plural flip). */
export function categoryTerms(topicalCategory, query) {
  const terms = new Set();
  const add = (w) => {
    const l = String(w).toLowerCase().replace(/[^a-z]/g, '');
    if (l.length >= 4 && !CAT_STOP.has(l)) {
      terms.add(l);
      terms.add(l.endsWith('s') ? l.slice(0, -1) : `${l}s`);
    }
  };
  for (const w of `${topicalCategory || ''} ${query || ''}`.split(/\s+/)) add(w);
  return terms;
}

// Product-type nouns pinning a different category. If one appears in the product name
// and is NOT a query category term, the pick belongs elsewhere.
export const FOREIGN_CATEGORY = new Set([
  'television', 'playstation', 'xbox', 'nintendo', 'console', 'macbook', 'laptop',
  'notebook', 'chromebook', 'iphone', 'ipad', 'tablet', 'smartphone', 'sneaker',
  'sneakers', 'treadmill', 'mattress', 'sofa', 'couch', 'blender', 'microwave',
  'refrigerator', 'fridge', 'dishwasher', 'games', 'mobile', 'tv',
  'mouse', 'trackpad', 'keyboard', 'webcam', 'printer', 'scanner', 'purifier',
  'humidifier', 'dehumidifier', 'vacuum', 'monitor', 'headphones', 'earbuds',
]);

function productContext(product) {
  const parts = [
    product?.name, product?.brand, product?.verdict, product?.bestFor,
    ...(Array.isArray(product?.pros) ? product.pros : []),
    ...(Array.isArray(product?.cons) ? product.cons : []),
  ];
  if (product?.specs && typeof product.specs === 'object') {
    parts.push(...Object.values(product.specs).filter((v) => typeof v === 'string'));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Whether a synthesized product belongs in the query's topical category.
 * Fail-open when no category terms are derivable (short/vague queries).
 */
export function productMatchesCategory(product, topicalCategory, query) {
  const terms = categoryTerms(topicalCategory, query);
  if (!terms.size) return true;

  const ctx = productContext(product);

  for (const raw of ctx.split(/[^a-z0-9]+/)) {
    const w = raw.replace(/[^a-z]/g, '');
    if (w.length >= 4 && FOREIGN_CATEGORY.has(w) && !terms.has(w)) return false;
  }

  for (const t of terms) {
    if (ctx.includes(t)) return true;
  }
  return false;
}

/** @param {Array<object>} products */
export function filterByCategory(products, topicalCategory, query) {
  if (!Array.isArray(products) || !products.length) return products;
  if (!topicalCategory && !query) return products;
  return products.filter((p) => productMatchesCategory(p, topicalCategory, query));
}
