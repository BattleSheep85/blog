// extract-gold-selection.mjs: the deterministic product-selection logic
// shared by extract-gold-gen.mjs (generation) and extract-gold-candidate-
// judge.mjs (judging), so both scripts pick the exact same 10 products in
// the exact same order without duplicating the selection code.

// mulberry32: small, fast, seedable PRNG (public-domain algorithm), same as
// synth-gold-gen.mjs so selection conventions match across gold benchmarks.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Category buckets, one per product-family, chosen for topical diversity
// across the 265 harvested products. Each bucket lists case-insensitive
// substrings matched against the record's product name.
export const CATEGORY_BUCKETS = {
  audio:            ['Sony WH-1000XM6', 'Bose QuietComfort Ultra', 'Sony WF-1000XM5', 'Galaxy Buds3 Pro', 'Ultimate Ears Boom', 'HW-Q990D'],
  tv_display:       ['Samsung QN90D', 'LG C4 OLED', 'Odyssey G7'],
  computing:        ['Surface Laptop', 'ThinkPad X1 Carbon', 'ROG Zephyrus', 'ROG Ally', 'iPad Air', 'T7 Shield', 'ZenWiFi', 'Keychron'],
  wearable_health:  ['Fitbit Charge', 'Garmin Forerunner', 'Renpho Smart Scale', 'Waterpik Aquarius'],
  kitchen:          ['Presto Pressure Cooker', 'Presto Salad Shooter'],
  cleaning:         ['Bespoke Jet Vacuum', 'Shark Navigator'],
  power_charging:   ['Anker 737', 'Belkin BoostCharge'],
  baby:             ["Dr. Brown's", 'Graco Pack N Play'],
  smart_home:       ['Roku Ultra', 'Google Nest Hub Max'],
  outdoor:          ['CamelBak Chute Mag'],
};
export const SEED = 42;

export function selectProducts(records, buckets, seed) {
  const rand = mulberry32(seed);
  const selected = [];
  for (const [bucketName, patterns] of Object.entries(buckets)) {
    const candidates = records.filter((r) =>
      patterns.some((p) => r.meta.product.toLowerCase().includes(p.toLowerCase())),
    );
    if (!candidates.length) throw new Error(`no harvested records for bucket "${bucketName}"`);
    // Bias toward substantial input blocks: sort by content length desc,
    // then draw (deterministically) from the longer half of the bucket so
    // shorter/thinner-content duplicates within a bucket lose out, but the
    // draw itself stays seeded/reproducible rather than always-the-longest.
    const byLenDesc = [...candidates].sort(
      (a, b) => b.messages[1].content.length - a.messages[1].content.length,
    );
    const pool = byLenDesc.slice(0, Math.max(1, Math.ceil(byLenDesc.length / 2)));
    const idx = Math.floor(rand() * pool.length);
    selected.push({ bucket: bucketName, record: pool[idx] });
  }
  return selected;
}
