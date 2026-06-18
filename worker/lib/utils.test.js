// Full-coverage assertions for the pure helpers in utils.js.
import {
  slugify, generateSlug, isValidHttpsUrl, sanitizeUrl, escapeLikeWildcards,
  escapeHtml, escapeXml, displayQuery, isNotModified, timeAgo, parseJsonSafe,
  publicResearchFilter, canonicalizeQuery,
} from './utils.js';

export function runUtilsTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // slugify
  eq('slugify basic', slugify('Best NAS for Home!'), 'best-nas-for-home');
  eq('slugify trims dashes', slugify('  --Hello--  '), 'hello');
  eq('slugify empty → research', slugify('!!!'), 'research');
  eq('slugify caps length', slugify('a'.repeat(200)).length, 80);

  // generateSlug
  eq('generateSlug', generateSlug('best nas', 'abcd1234efgh'), 'best-nas-abcd1234');

  // isValidHttpsUrl / sanitizeUrl
  ok('https valid', isValidHttpsUrl('https://x.com/a'));
  ok('http invalid', !isValidHttpsUrl('http://x.com'));
  ok('garbage invalid', !isValidHttpsUrl('not a url'));
  eq('sanitizeUrl valid', sanitizeUrl('https://x.com'), 'https://x.com');
  eq('sanitizeUrl invalid', sanitizeUrl('http://x.com'), '');

  // escapeLikeWildcards
  eq('escapeLike', escapeLikeWildcards('50% off_now'), '50\\% off\\_now');

  // escapeHtml / escapeXml
  eq('escapeHtml', escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  eq('escapeXml apos', escapeXml(`a'<&">`), 'a&apos;&lt;&amp;&quot;&gt;');

  // displayQuery: uppercase kept, digit upper, stopword mid lower, ends capitalized
  eq('displayQuery', displayQuery('best wifi router for the home'), 'Best Wifi Router for the Home');
  eq('displayQuery keeps caps + digits', displayQuery('iPhone 16 vs 4k'), 'iPhone 16 vs 4K');

  // isNotModified
  const now = Math.floor(Date.now() / 1000);
  ok('inm future', isNotModified(new Date((now + 50) * 1000).toUTCString(), now));
  ok('inm past false', !isNotModified(new Date((now - 50) * 1000).toUTCString(), now));
  ok('inm null false', !isNotModified(null, now));
  ok('inm bad date false', !isNotModified('garbage', now));

  // timeAgo (all four branches)
  eq('timeAgo now', timeAgo(Date.now() - 5_000), 'just now');
  eq('timeAgo minutes', timeAgo(Date.now() - 120_000), '2m ago');
  eq('timeAgo hours', timeAgo(Date.now() - 7_200_000), '2h ago');
  eq('timeAgo days', timeAgo(Date.now() - 2 * 86_400_000), '2d ago');

  // parseJsonSafe
  eq('json falsy → fallback', parseJsonSafe('', 'fb'), 'fb');
  eq('json valid', parseJsonSafe('{"a":1}', null), { a: 1 });
  eq('json invalid → fallback', parseJsonSafe('{bad', 'fb'), 'fb');

  // publicResearchFilter (string builder; just verify alias substitution)
  ok('publicFilter uses alias', publicResearchFilter('r').includes("r.status = 'complete'"));
  ok('publicFilter thin-page gate', publicResearchFilter('research').includes('research_id = research.id'));

  // canonicalizeQuery: stopwords + filler stripped, sorted/unique
  eq('canonical strips stopwords+filler+sorts', canonicalizeQuery('Best Wireless Keyboard under $100 2026', {}), 'keyboard wireless');
  eq('canonical order-insensitive', canonicalizeQuery('budget keyboard best', {}), canonicalizeQuery('best keyboard budget', {}));
  eq('canonical no clarifications', canonicalizeQuery('mesh wifi system', null), 'mesh system wifi');
  eq('canonical with clarifications', canonicalizeQuery('mesh wifi', { budget: '$200' }), 'mesh wifi budget:$200');
  // clarification value that slugifies to empty still yields base + key:
  eq('canonical clarification empty value', canonicalizeQuery('mesh wifi', { x: '!!!' }), 'mesh wifi x:');

  return report;
}
