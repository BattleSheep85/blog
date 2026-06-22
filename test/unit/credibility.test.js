// Assertions for the credibility rubric (the PRD §2 trust-weight table,
// encoded as ~55 concrete cases). Run with:
//
//   node scripts/run-tests.mjs
//
// No test framework — pure functions, pure assertions, zero deps. Tests
// import the real module, so they exercise the actual shipped code.

import {
  isAffiliateUrl,
  hasAffiliateLinks,
  isHandsOn,
  isListicle,
  isExpertDomain,
  isCommunityDomain,
  isManufacturerDomain,
  scoreSource,
  formatCredibilityBadge,
} from '../../worker/lib/credibility.js';

// TestReport = { passed: number, failed: number, failures: string[] }
// Case = [name, actual, expected]

function deepEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  return false;
}

function run(cases) {
  const report = { passed: 0, failed: 0, failures: [] };
  for (const [name, actual, expected] of cases) {
    if (deepEq(actual, expected)) {
      report.passed++;
    } else {
      report.failed++;
      report.failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  return report;
}

export function runCredibilityTests() {
  const cases = [
    // ── isAffiliateUrl ────────────────────────────────────────────────────
    ['amazon-tag-20', isAffiliateUrl('https://amazon.com/dp/B08XYZ?tag=battlesheep0a-20'), true],
    ['amazon-tag-21', isAffiliateUrl('https://amazon.com/dp/B08XYZ?tag=random-21'), true],
    ['amazon-plain-no-tag', isAffiliateUrl('https://amazon.com/dp/B08XYZ'), false],
    ['amzn-to-short', isAffiliateUrl('https://amzn.to/3xyzABC'), true],
    ['skimresources', isAffiliateUrl('https://go.skimresources.com/?id=12345&url=https://amazon.com'), true],
    ['commission-junction-anrdoezrs', isAffiliateUrl('https://www.anrdoezrs.net/click-12345-67890'), true],
    ['impact-pxf-io', isAffiliateUrl('https://wirecutter.pxf.io/c/123/456/789'), true],
    ['linksynergy', isAffiliateUrl('https://click.linksynergy.com/deeplink?id=X&mid=1234'), true],
    ['ebay-campid', isAffiliateUrl('https://ebay.com/itm/12345?campid=5338123456'), true],
    ['irclickid', isAffiliateUrl('https://example.com/product?irclickid=abc123def'), true],
    ['clean-url', isAffiliateUrl('https://rtings.com/tv/reviews/lg/c4-oled'), false],
    ['empty-url', isAffiliateUrl(''), false],

    // ── hasAffiliateLinks (content scan) ──────────────────────────────────
    ['content-has-amzn-to',
      hasAffiliateLinks('Check it out: https://amzn.to/3abc and more info below.'),
      true],
    ['content-has-tag-param',
      hasAffiliateLinks('[Buy on Amazon](https://amazon.com/dp/B0ABC?tag=mysite-20)'),
      true],
    ['content-has-skim',
      hasAffiliateLinks('Pricing: https://go.skimresources.com/?url=example.com'),
      true],
    ['content-clean',
      hasAffiliateLinks('Read more at https://rtings.com/tv/reviews/sony-a95l — no commerce.'),
      false],
    ['content-empty', hasAffiliateLinks(''), false],

    // ── isHandsOn ─────────────────────────────────────────────────────────
    ['hands-on-tested', isHandsOn('We tested this monitor for 6 weeks in our lab.'), true],
    ['hands-on-measured', isHandsOn('We measured peak brightness at 1200 nits.'), true],
    ['hands-on-been-using', isHandsOn("I've been using this mouse for three months."), true],
    ['hands-on-benchmark', isHandsOn('Our benchmark results show 15% faster render times.'), true],
    ['hands-on-after-6-months', isHandsOn('After 6 months of daily use, the coating peeled.'), true],
    ['hands-on-teardown', isHandsOn('Our teardown revealed a cheaper capacitor.'), true],
    ['no-hands-on-marketing', isHandsOn('The revolutionary new flagship is here.'), false],
    ['no-hands-on-listicle', isHandsOn('Here are the top 10 monitors of 2026.'), false],

    // ── isListicle ────────────────────────────────────────────────────────
    ['listicle-top10-of', isListicle('Top 10 Gaming Monitors of 2026', ''), true],
    ['listicle-best-for', isListicle('Best Laptops for Students in 2026', ''), true],
    ['listicle-n-best', isListicle('15 Best Coffee Makers You Can Buy', ''), true],
    ['not-listicle-review', isListicle('LG C4 OLED Review: The King Returns', ''), false],
    ['not-listicle-analysis', isListicle('Why the M4 MacBook Air is Apple\'s Best', ''), false],

    // ── Domain classification ─────────────────────────────────────────────
    ['expert-rtings', isExpertDomain('https://www.rtings.com/tv/reviews/lg/c4'), true],
    ['expert-wirecutter', isExpertDomain('https://www.nytimes.com/wirecutter/reviews/best-monitors/'), true],
    ['expert-toms', isExpertDomain('https://tomshardware.com/gpus/rtx-5090-review'), true],
    ['not-expert', isExpertDomain('https://some-blog.com/best-tvs-2026'), false],

    ['community-reddit', isCommunityDomain('https://www.reddit.com/r/buildapc/comments/xyz'), true],
    ['community-hn', isCommunityDomain('https://news.ycombinator.com/item?id=12345'), true],
    ['not-community', isCommunityDomain('https://rtings.com/tv'), false],

    ['manufacturer-amazon', isManufacturerDomain('https://amazon.com/dp/B08XYZ'), true],
    ['manufacturer-apple', isManufacturerDomain('https://apple.com/macbook-pro/'), true],
    ['not-manufacturer', isManufacturerDomain('https://rtings.com'), false],

    // ── scoreSource composite ─────────────────────────────────────────────
  ];

  // Composite scoring — full objects, checked as sub-assertions.
  const handsOnExpert = scoreSource({
    url: 'https://rtings.com/tv/reviews/sony-a95l',
    title: 'Sony A95L OLED TV Review',
    content: 'We tested the Sony A95L for 2 weeks. Our measurements show 1450 nits peak brightness.',
    sourceType: 'web',
  });
  cases.push(['composite-handsOnExpert-score-high', handsOnExpert.score >= 85, true]);
  cases.push(['composite-handsOnExpert-tags-include-handsOn', handsOnExpert.tags.includes('hands-on'), true]);
  cases.push(['composite-handsOnExpert-tags-include-expertDomain', handsOnExpert.tags.includes('expert-domain'), true]);
  cases.push(['composite-handsOnExpert-no-affiliate', handsOnExpert.tags.includes('affiliate-conflict'), false]);

  const listicleAffiliate = scoreSource({
    url: 'https://some-blog.com/best-gaming-monitors-2026',
    title: 'Top 10 Best Gaming Monitors of 2026',
    content: 'These are our picks. [Buy now on Amazon](https://amazon.com/dp/B0ABC?tag=blog-20)',
    sourceType: 'web',
  });
  cases.push(['composite-listicleAffiliate-score-low', listicleAffiliate.score <= 10, true]);
  cases.push(['composite-listicleAffiliate-tags-include-listicle', listicleAffiliate.tags.includes('listicle'), true]);
  cases.push(['composite-listicleAffiliate-tags-include-conflict', listicleAffiliate.tags.includes('affiliate-conflict'), true]);

  const redditPost = scoreSource({
    url: 'https://www.reddit.com/r/monitors/comments/xyz/my_lg_c4_after_6_months',
    title: 'My LG C4 after 6 months of use',
    content: 'Been using it daily. After 6 months the burn-in is minimal, here is what I measured.',
    sourceType: 'web',
  });
  cases.push(['composite-reddit-has-hands-on', redditPost.tags.includes('hands-on'), true]);
  cases.push(['composite-reddit-has-community', redditPost.tags.includes('community'), true]);

  const manufacturerPage = scoreSource({
    url: 'https://apple.com/shop/buy-mac/macbook-pro',
    title: 'Buy MacBook Pro — Apple',
    content: 'The most advanced Mac notebook ever.',
    sourceType: 'web',
  });
  cases.push(['composite-manufacturer-flagged', manufacturerPage.tags.includes('manufacturer'), true]);
  cases.push(['composite-manufacturer-low-score', manufacturerPage.score <= 40, true]);

  // Video source with affiliate description — simulates a YouTube review.
  const videoAffiliate = scoreSource({
    url: 'https://youtube.com/watch?v=abc123',
    title: 'LG C4 Review - Best OLED of 2026?',
    content: 'Video overview\n\n[description]\nBuy the LG C4: https://amzn.to/3xyzABC\nUse code SAVE20.',
    sourceType: 'video',
  });
  cases.push(['composite-video-affiliate-flagged', videoAffiliate.tags.includes('affiliate-conflict'), true]);
  cases.push(['composite-video-affiliate-low-score', videoAffiliate.score <= 20, true]);

  // Format badge sanity.
  const badge = formatCredibilityBadge(handsOnExpert);
  cases.push(['badge-contains-score', badge.includes('[score='), true]);
  cases.push(['badge-contains-handsOn', badge.includes('[hands-on]'), true]);

  return run(cases);
}
