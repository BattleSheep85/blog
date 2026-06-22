// "Messy real-page" extraction scenarios — the regression net for the
// output-quality defects observed on the live dev box (extraction-v0):
//   - HTML entities (&#9679;, &amp;, &#39;) surviving into pros/names
//   - listicle HEADLINE lines becoming pros ("The Best ... for 2026")
//   - product-name bleed ("Sony SRS-XB100 4.0 Excellent", "... Micro 2nd")
//   - best_for collapsing to a bare price-qualifier ("under")
//   - near-zero cons because drawbacks live in contrast ("but ...") clauses
//   - jina-markdown nav/skip artifacts
//
// Same scenario shape the eval already consumes (query, topicalCategory, facets,
// trap, legit[], notes[], sources[{source,title,url,content,credibility,...}]).
// legit[] uses CLEAN canonical names so recall is measured against cleaned output;
// the trap is a no-name backed ONLY by listicle/affiliate/manufacturer sources.
//
// These are designed to FAIL the new gates on the current engine (RED) and PASS
// once Q1–Q6 land (GREEN). Source content is deliberately verbatim-quotable so the
// text-groundedness gate stays satisfiable for honest spans.

const recent = (days) => Math.floor(Date.now() / 1000) - days * 86400;

export const MESSY_SCENARIOS = [
  {
    query: 'best portable bluetooth speaker under $100',
    topicalCategory: 'portable bluetooth speakers',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'BoomMax Pro',
    legit: ['Anker Soundcore Motion 300', 'Sony SRS-XB100', 'JBL Clip 4'],
    notes: [
      { category: 'recommendation', content: 'RTINGS hands-on testing puts the Anker Soundcore Motion 300 first for bass and battery under $100.' },
      { category: 'issue', content: 'The Sony SRS-XB100 is tiny and clear but the bass is weak at high volume per reviewers.' },
      { category: 'recommendation', content: 'A sponsored listicle pushes the BoomMax Pro as the #1 best speaker money can buy.' },
    ],
    sources: [
      {
        source: 'rtings', title: 'The Best Cheap Bluetooth Speakers for 2026 - RTINGS',
        url: 'https://www.rtings.com/speaker/reviews/best/cheap',
        content: '[Skip to content](#main)\n&#9679; The Best Cheap Bluetooth Speakers for 2026\nWe bought and tested 20 speakers in our lab. The Anker Soundcore Motion 300 Appears at the top of the list with punchy bass and 13-hour battery for under $100. The Sony SRS-XB100 4.0 Excellent sound for its tiny size, but the bass is weak at higher volume. The JBL Clip 4 is rugged and clips anywhere, though it&#39;s quiet outdoors.',
        credibility: { tags: ['hands-on', 'expert-domain'], score: 90, reasons: [] }, publishedAt: recent(40),
      },
      {
        source: 'soundguys', title: 'Best budget Bluetooth speakers - SoundGuys',
        url: 'https://www.soundguys.com/best-budget-bluetooth-speakers',
        content: 'Measured on our rig: the Anker Soundcore Motion 300 has the best low-end &amp; widest soundstage for the money, but it is bulky for a "portable" speaker. The Sony SRS-XB100 is impressively loud for its size &amp; clear in the mids, though battery life is only so-so. The JBL Clip 4 has good clarity &amp; an IP67 rating, but it lacks deep bass.',
        credibility: { tags: ['hands-on', 'expert-domain'], score: 85, reasons: [] }, publishedAt: recent(28),
      },
      {
        source: 'reddit', title: 'r/Bluetooth_Speakers — best under $100?',
        url: 'https://www.reddit.com/r/Bluetooth_Speakers/comments/z',
        content: 'The Anker Soundcore Motion 300 is the value king. The Sony SRS-XB100 is great for travel but the bass is weak. The JBL Clip 4 is the most rugged but it is quiet outdoors.',
        credibility: { tags: ['community'], score: 55, reasons: [] }, publishedAt: recent(20),
      },
      {
        source: 'dealsblog', title: 'The 10 Best Bluetooth Speakers of 2026 &amp; Beyond',
        url: 'https://dealsblog.example.com/best-speakers',
        content: 'Sponsored &#9679; The BoomMax Pro is the #1 best speaker money can buy &#9679; flawless &#9679; revolutionary. The Best Cheap Bluetooth Speakers for 2026 &amp; more. Grab it with our exclusive affiliate link!',
        credibility: { tags: ['listicle', 'affiliate-conflict'], score: 7, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEBM01?tag=dealsblog-20'], publishedAt: recent(15),
      },
      {
        source: 'boommax', title: 'BoomMax Pro — Official Store',
        url: 'https://boommax.example.com',
        content: "The world&#39;s #1 best portable speaker, rated best by customers everywhere. Next-generation premium sound.",
        credibility: { tags: ['manufacturer'], score: 28, reasons: [] }, publishedAt: recent(12),
      },
    ],
  },
  {
    query: 'best webcam for streaming under $150',
    topicalCategory: 'webcams',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'ClearView Ultra',
    legit: ['Logitech Brio 300', 'Razer Kiyo X', 'Elgato Facecam MK.2'],
    notes: [
      { category: 'recommendation', content: 'Wirecutter hands-on names the Logitech Brio 300 the best affordable 1080p webcam.' },
      { category: 'issue', content: 'The Razer Kiyo X is sharp but struggles in low light per reviewers.' },
      { category: 'recommendation', content: 'A sponsored roundup pushes the ClearView Ultra as the best webcam ever.' },
    ],
    sources: [
      {
        source: 'wirecutter', title: '&#9679; The Best Webcams for 2026 &amp; How We Tested',
        url: 'https://www.nytimes.com/wirecutter/reviews/best-webcams',
        content: '* * * The Best Webcams 2026 * * *\nThe Logitech Brio 300 Delivers crisp, accurate 1080p color for under $150 and is our top pick. The Razer Kiyo X 2.0 Sharp detail in good light, but it struggles in low light. The Elgato Facecam MK.2 has excellent image quality, though it&#39;s pricey and needs software.',
        credibility: { tags: ['hands-on', 'expert-domain'], score: 88, reasons: [] }, publishedAt: recent(35),
      },
      {
        source: 'rtings', title: 'Best Webcams - RTINGS',
        url: 'https://www.rtings.com/webcam/reviews/best',
        content: 'The Logitech Brio 300 has natural color &amp; reliable autofocus for the price, but its field of view is narrow. The Razer Kiyo X has sharp 1080p &amp; a low price, though low-light noise is high. The Elgato Facecam MK.2 has the best image quality &amp; fixed-focus reliability, but it needs the Camera Hub app.',
        credibility: { tags: ['hands-on', 'expert-domain'], score: 86, reasons: [] }, publishedAt: recent(26),
      },
      {
        source: 'streamblog', title: 'Top 7 Best Webcams of 2026 (#1 Will Shock You) &amp; More',
        url: 'https://streamblog.example.com/best-webcams',
        content: 'Sponsored &#9679; The ClearView Ultra is hands-down the best webcam ever made &#9679; perfect &#9679; flawless. Buy today using our affiliate link!',
        credibility: { tags: ['listicle', 'affiliate-conflict'], score: 8, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKECV02?tag=streamblog-20'], publishedAt: recent(14),
      },
      {
        source: 'clearview', title: 'ClearView Ultra — Official',
        url: 'https://clearview.example.com',
        content: 'The most advanced webcam in the world. #1 rated. Revolutionary 4K premium clarity.',
        credibility: { tags: ['manufacturer'], score: 26, reasons: [] }, publishedAt: recent(10),
      },
    ],
  },
];
