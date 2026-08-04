// Full-coverage assertions for the remaining small pure modules:
// status.js, guides.js, engine-config.js, ads.js, and html.js's pure helpers + layout().
import { apiStatus } from '../../worker/lib/status.js';
import { STATIC_GUIDES, STATIC_GUIDE_SLUGS, GUIDES_LASTMOD } from '../../worker/lib/guides.js';
import { ENGINE_CONFIG } from '../../worker/lib/engine-config.js';
import { adSlot } from '../../worker/lib/ads.js';
import { html, raw, jsonLdScript, layout } from '../../worker/lib/html.js';
import { searchBar } from '../../worker/lib/search-bar.js';
import { screenQuery, rejectionMessage } from '../../worker/lib/safety.js';

export function runLibPureTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // status.js
  eq('apiStatus complete', apiStatus('complete'), 'completed');
  eq('apiStatus failed', apiStatus('failed'), 'error');
  eq('apiStatus pending', apiStatus('pending'), 'pending');
  eq('apiStatus processing', apiStatus('processing'), 'processing');

  // guides.js
  eq('guides count', STATIC_GUIDES.length, 4);
  ok('guide slug set', STATIC_GUIDE_SLUGS.has('synology-vs-qnap'));
  eq('guides lastmod', GUIDES_LASTMOD, '2026-06-09');

  // engine-config.js
  eq('engine config synth model', ENGINE_CONFIG.synthModel, 'minimax/minimax-m3');

  // ads.js
  eq('adSlot no publisher → ""', adSlot({}, 'top', 'Ad'), '');
  eq('adSlot no slot → ""', adSlot({ ADSENSE_PUBLISHER_ID: 'pub-1' }, 'top', 'Ad'), '');
  {
    const env = { ADSENSE_PUBLISHER_ID: 'pub-1', ADSENSE_SLOT_TOP: 'T', ADSENSE_SLOT_MID: 'M', ADSENSE_SLOT_BOTTOM: 'B' };
    ok('adSlot top renders slot', adSlot(env, 'top', 'Ad').includes('data-ad-slot="T"'));
    ok('adSlot mid renders slot', adSlot(env, 'mid', 'Ad').includes('data-ad-slot="M"'));
    ok('adSlot bottom renders slot', adSlot(env, 'bottom', 'Ad').includes('data-ad-slot="B"'));
    ok('adSlot escapes label', adSlot(env, 'top', '<x>').includes('&lt;x&gt;'));
  }

  // html.js — tagged template + helpers
  eq('html escapes interpolation', html`<b>${'<x>'}</b>`, '<b>&lt;x&gt;</b>');
  eq('html passes raw branded', html`a${raw('<b>')}c`, 'a<b>c');
  eq('html joins arrays (raw + escaped)', html`${[raw('<i>'), '<x>']}`, '<i>&lt;x&gt;');
  eq('html null → empty', html`a${null}b`, 'ab');
  eq('raw brand', raw('<b>').__html, '<b>');
  ok('jsonLdScript escapes <', jsonLdScript({ a: '</script>' }).includes('\\u003c/script>'));

  // html.js layout() — exercise the meta branches + capDescription
  {
    const longSpaced = 'word '.repeat(50); // >155, has spaces past index 100
    const out = layout('Title', longSpaced, '<main>x</main>', '<style>x</style>', {
      ogType: 'article', ogUrl: 'https://x/y', canonical: 'https://x/c', noindex: true, ogImage: 'https://cdn/x.svg',
      article: { publishedTime: '2026-01-01', modifiedTime: '2026-01-02', author: 'A', section: 'Tech', tags: ['t1', 't2'] },
    });
    ok('layout title', out.includes('<title>Title | Frank</title>'));
    ok('layout canonical', out.includes('rel="canonical" href="https://x/c"'));
    ok('layout noindex', out.includes('name="robots" content="noindex,follow"'));
    ok('layout article meta', out.includes('article:published_time') && out.includes('article:tag'));
    ok('layout svg image type', out.includes('og:image:type" content="image/svg+xml"'));
    ok('layout caps long description with ellipsis', out.includes('…'));
  }
  {
    // relative ogImage gets host prepended; png type; no-space long desc branch.
    const noSpace = 'a'.repeat(160);
    const out = layout('T', noSpace, 'b', '', { ogImage: '/og.png' });
    ok('layout relative image prepended', out.includes('https://chrisputer.tech/og.png'));
    ok('layout png image type', out.includes('og:image:type" content="image/png"'));
    ok('layout no canonical when absent', !out.includes('rel="canonical"'));
  }

  // search-bar.js — both sizes render a form with the right placeholder.
  {
    const large = searchBar('large');
    const small = searchBar('small');
    ok('searchBar large placeholder', large.includes('What product are you researching?'));
    ok('searchBar small placeholder', small.includes('Research a product...'));
    ok('searchBar has a form', large.includes('class="search-form"') || large.includes('search-form'));
  }

  // safety.js — screenQuery chokepoint. The deterministic QUERY injection screen
  // was REMOVED 2026-07-08 (false-positived on real product searches); these guard
  // that legit queries stay allowed and only true adult/illegal content is blocked.
  ok('safety allows normal product query', !screenQuery('best mechanical keyboard under 150').blocked);
  ok('safety allows prompt-manager query', !screenQuery('best system prompt manager for teams').blocked);
  ok('safety allows ignore-noise query', !screenQuery('best earplugs to ignore loud coworkers').blocked);
  ok('safety does NOT block a benign query mentioning instructions', !screenQuery('best laptop, ignore the previous model please').blocked);
  ok('safety does NOT block "developer mode" queries', !screenQuery('best android phone with developer mode').blocked);
  eq('safety blocks illegal', screenQuery('how to make counterfeit money').reason, 'illegal');
  ok('safety empty query is allowed (not blocked)', !screenQuery('').blocked);

  return report;
}
