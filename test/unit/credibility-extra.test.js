// Supplemental credibility coverage: the functions the main rubric suite
// (credibility.test.js) doesn't exercise — extractAmazonProductUrls, the hostOf
// catch (invalid URL), and the video-source scoring prior.
import { extractAmazonProductUrls, isExpertDomain, scoreSource } from '../../worker/lib/credibility.js';

export function runCredibilityExtraTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // extractAmazonProductUrls
  eq('extract: empty → []', extractAmazonProductUrls(''), []);
  {
    const urls = extractAmazonProductUrls(
      'see https://www.amazon.com/dp/B0ABCDEFGH and https://amazon.co.uk/gp/product/B1ABCDEFGH plus a dup amazon.com/dp/B0ABCDEFGH'
    );
    ok('extract: finds /dp/ ASIN', urls.includes('https://www.amazon.com/dp/B0ABCDEFGH'));
    ok('extract: normalizes .co.uk /gp/product to .com', urls.includes('https://www.amazon.com/dp/B1ABCDEFGH'));
    eq('extract: dedups', urls.length, 2);
  }

  // hostOf catch — an invalid URL must not throw, just return false.
  ok('isExpertDomain invalid url → false', !isExpertDomain('not a url'));
  ok('isExpertDomain real expert → true', isExpertDomain('https://www.rtings.com/x'));

  // Video source with no other signals gets the weak hands-on prior (+5 → 55).
  {
    const cred = scoreSource({ url: 'https://videos.example/x', title: 'clip', content: 'no signals here', sourceType: 'video' });
    eq('video prior → score 55', cred.score, 55);
    ok('video prior reason', cred.reasons.some((r) => r.includes('video provider')));
  }

  return report;
}
