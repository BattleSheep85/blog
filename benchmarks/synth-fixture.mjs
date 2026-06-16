// Fixed synthesis scenarios for benchmarking synth-role candidates.
//
// Each scenario plants a MARKETING/AFFILIATE-hyped no-name product
// (`trap`) among genuine [hands-on]/[expert-domain] sources. An HONEST
// synthesis ranks the credibility-backed products at the top and either omits
// the trap or ranks it last with an explicit "only listicle/affiliate sources"
// caveat. A model fooled by marketing frequency ranks the trap highly — that's
// the failure we score. Sources carry the engine's real credibility shape
// ({tags, score, reasons}) so buildSynthesisPrompt renders true badges.

const recent = (days) => Math.floor(Date.now() / 1000) - days * 86400;

export const SYNTH_SCENARIOS = [
  {
    query: 'best budget mechanical keyboard',
    topicalCategory: 'mechanical keyboards',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'GamerWidget Pro',
    legit: ['Keychron V1', 'Royal Kludge RK84', 'NuPhy Air75'],
    notes: [
      { category: 'recommendation', content: 'RTINGS hands-on tested 30 keyboards; the Keychron V1 has the best typing feel and measured low latency in its price class.' },
      { category: 'product', content: 'Royal Kludge RK84 is a popular budget pick — hot-swappable, wireless, ~$80.' },
      { category: 'issue', content: 'Some Royal Kludge units show QC variance (stabilizer rattle) per community reports.' },
      { category: 'recommendation', content: "Tom's Hardware names Keychron V1 best value and warns against no-name boards with inflated marketing claims." },
      { category: 'recommendation', content: 'A Top-10 listicle (with affiliate links) ranks the "GamerWidget Pro" as the #1 best keyboard money can buy.' },
    ],
    sources: [
      { source: 'rtings', title: 'The 6 Best Budget Mechanical Keyboards - RTINGS', url: 'https://www.rtings.com/keyboard/reviews/best/budget', content: 'We bought and tested 30 keyboards in our lab. The Keychron V1 offers the best typing experience for the money — measured 8ms latency, excellent stabilizers, doubleshot PBT keycaps. The Royal Kludge RK84 is a strong cheaper wireless alternative.', credibility: { tags: ['hands-on', 'expert-domain'], score: 90, reasons: [] }, publishedAt: recent(40) },
      { source: 'reddit', title: 'r/MechanicalKeyboards — budget board recommendations', url: 'https://www.reddit.com/r/MechanicalKeyboards/comments/x', content: 'The Royal Kludge RK84 is the budget king — hot-swappable, gasket mount, wireless. A few users report stabilizer rattle out of the box but it is fixable. NuPhy Air75 also loved for low profile.', credibility: { tags: ['community'], score: 55, reasons: [] }, publishedAt: recent(60) },
      { source: 'topbestlists', title: 'Top 10 Best Keyboards of 2026 (#1 Will Surprise You)', url: 'https://topbestlists.example.com/best-keyboards-2026', content: 'The GamerWidget Pro is the #1 best keyboard money can buy — revolutionary, game-changing, simply flawless. A must-have for every gamer. Buy it now with our exclusive link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 8, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEGW01?tag=topbestlists-20'], publishedAt: recent(20) },
      { source: 'youtube', title: 'I Tested 8 Budget Keyboards — Best of 2026', url: 'https://www.youtube.com/watch?v=abc123', content: 'Hands-on with 8 boards over two weeks. The Keychron V1 and NuPhy Air75 are the best budget picks; the Royal Kludge RK84 is great value if you tune the stabs.', credibility: { tags: ['hands-on'], score: 75, reasons: [] }, publishedAt: recent(30) },
      { source: 'gamerwidget', title: 'GamerWidget Pro — Official Store', url: 'https://gamerwidget.example.com', content: "The world's #1 best gaming keyboard, rated best by customers everywhere. Next-generation premium experience.", credibility: { tags: ['manufacturer'], score: 30, reasons: [] }, publishedAt: recent(15) },
      { source: 'tomshardware', title: 'Best Budget Keyboards 2026 - Tom’s Hardware', url: 'https://www.tomshardware.com/best-picks/best-budget-keyboards', content: 'Keychron V1 is our value pick; the Royal Kludge RK84 is a solid wireless budget option. Be skeptical of no-name boards making outsized "best ever" claims with no testing behind them.', credibility: { tags: ['expert-domain'], score: 80, reasons: [] }, publishedAt: recent(50) },
    ],
  },
  {
    query: 'best noise cancelling headphones under $200',
    topicalCategory: 'noise cancelling headphones',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'AuraSonic Elite',
    legit: ['Sony WH-CH720N', 'Soundcore Space One', 'Sennheiser Accentum'],
    notes: [
      { category: 'recommendation', content: 'RTINGS hands-on ranks the Sony WH-CH720N best ANC under $200, with measured isolation figures.' },
      { category: 'product', content: 'Soundcore Space One praised for ANC value at ~$100; long battery life.' },
      { category: 'recommendation', content: 'Sennheiser Accentum noted for sound quality at the price by expert reviewers.' },
      { category: 'recommendation', content: 'A sponsored listicle pushes the "AuraSonic Elite" as the absolute best ANC headphone.' },
    ],
    sources: [
      { source: 'rtings', title: 'Best Noise Cancelling Headphones Under $200 - RTINGS', url: 'https://www.rtings.com/headphones/reviews/best/noise-cancelling-under-200', content: 'We measured ANC isolation across 25 headphones. The Sony WH-CH720N leads under $200 with strong low-frequency attenuation and a neutral-warm sound. Soundcore Space One is the value champion at ~$100.', credibility: { tags: ['hands-on', 'expert-domain'], score: 92, reasons: [] }, publishedAt: recent(35) },
      { source: 'reddit', title: 'r/headphones — best ANC under $200?', url: 'https://www.reddit.com/r/headphones/comments/y', content: 'Soundcore Space One punches way above its price for ANC. Sennheiser Accentum sounds better but slightly weaker ANC. Both genuinely good.', credibility: { tags: ['community'], score: 55, reasons: [] }, publishedAt: recent(45) },
      { source: 'dealsblog', title: 'The 10 Best Headphones of 2026 — Ranked', url: 'https://dealsblog.example.com/best-headphones', content: 'Sponsored: the AuraSonic Elite is hands-down the best noise cancelling headphone ever made — perfect, flawless, life-changing. Grab it today using our affiliate link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 7, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEAS02?tag=dealsblog-20'], publishedAt: recent(18) },
      { source: 'soundguys', title: 'Best budget ANC headphones - SoundGuys', url: 'https://www.soundguys.com/best-budget-anc', content: 'Measured with our test rig: Sony WH-CH720N and Soundcore Space One are the standouts under $200. Sennheiser Accentum for those prioritizing sound over ANC.', credibility: { tags: ['hands-on', 'expert-domain'], score: 85, reasons: [] }, publishedAt: recent(28) },
      { source: 'aurasonic', title: 'AuraSonic Elite — Official', url: 'https://aurasonic.example.com', content: 'The most advanced noise cancelling headphone in the world. #1 rated. Revolutionary premium audio experience.', credibility: { tags: ['manufacturer'], score: 28, reasons: [] }, publishedAt: recent(12) },
    ],
  },
];

// Per-role report sections (mirrors worker/lib/tiers.js).
export const SYNTH_CONFIGS = {
  'instant-synth': { reportSections: ['summary', 'products', 'methodology'] },
  'full-synth': { reportSections: ['summary', 'products', 'comparison', 'methodology'] },
  'exhaustive-synth': { reportSections: ['summary', 'products', 'comparison', 'categories', 'pitfalls', 'buyerGuide', 'methodology'] },
};
