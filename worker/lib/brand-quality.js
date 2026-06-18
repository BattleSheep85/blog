// Known marketplace-churn brands — no-name Amazon/eBay/Walmart-marketplace
// sellers with no independent brand identity, the "Chinese rip-off dump" junk a
// savvy buyer avoids. Picks under these brands are HARD-DROPPED from rankings
// regardless of their (often gamed) star rating, since for these the rating
// floor in validate.js can't be trusted.
//
// DESIGN — deliberately conservative + evidence-driven. A wrong entry silently
// removes a brand from every ranking, so this list holds ONLY brands genuinely
// notorious as marketplace-only fast-fashion/generic churn. It is intentionally
// APPAREL-FOCUSED: electronics/tools churn is left to the editorial rating floor
// so we never false-positive a legit short-name brand (LG, HP, MSI, TCL, AOC,
// DJI, Anker, …). Grow this list from real user reports + click data, not guesses.
//
// Normalization: compared case-insensitively with all non-alphanumerics stripped,
// so "Co Fandy", "COOFANDY", and "coofandy" all match the 'coofandy' entry.
const CHURN_BRANDS = new Set([
  'coofandy',     // confirmed from user report (men's Amazon-native fast fashion)
  'lexiart',
  'runcati',
  'makemechic',
  'sweatyrocks',
  'floerns',
  'milumia',
  'verdusa',
  'romwe',        // SHEIN-family fast fashion
  'zeagoo',
  'allegrak',     // "Allegra K" — Amazon-native apparel house brand
  'lallc',
]);

function normalizeBrand(brand) {
  if (!brand || typeof brand !== 'string') return '';
  return brand.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True if `brand` is a known marketplace-churn brand that should be excluded
 * from rankings outright. Empty/unknown brands are NOT churn (return false) —
 * absence of a brand is handled elsewhere, and we never guess.
 */
export function isChurnBrand(brand) {
  const norm = normalizeBrand(brand);
  if (!norm) return false;
  return CHURN_BRANDS.has(norm);
}

// Exposed for tests / introspection.
export const CHURN_BRAND_COUNT = CHURN_BRANDS.size;
