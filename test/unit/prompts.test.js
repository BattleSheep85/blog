// Coverage + regression guard for the pure prompt builders. The synthesis-prompt
// assertions also lock in the load-bearing honesty/quality rules (brand-quality,
// open-source inclusion, rank-tracks-quality) so an accidental edit can't silently
// drop them.
import { buildAgentPrompt, buildSynthesisPrompt } from '../../worker/engine/prompts.js';
import { getTierConfig } from '../../worker/lib/tiers.js';

const CONFIG = getTierConfig('full');

export function runPromptsTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const ok = (name, c) => { if (c) report.passed++; else { report.failed++; report.failures.push(name); } };

  // buildAgentPrompt — with facets and with the null-facets default branch.
  {
    const p = buildAgentPrompt('best nas', CONFIG, { is_buyable: true, recency_sensitive: true });
    ok('agent: includes query', p.includes('best nas'));
    ok('agent: includes budget', p.includes(`${CONFIG.maxSearches} searches`));
    ok('agent: credibility guidance', p.includes('SOURCE CREDIBILITY'));
  }
  ok('agent: null facets does not throw', typeof buildAgentPrompt('q', CONFIG, null) === 'string');
  // All six facet-focus blocks active at once → every branch of facetFocusBlocks.
  {
    const p = buildAgentPrompt('q', CONFIG, {
      is_buyable: true, needs_location: true, is_experience: true,
      is_content: true, is_service: true, is_comparative: true,
    });
    ok('agent: buyable block', p.includes('BUYABLE PRODUCT focus'));
    ok('agent: location block', p.includes('LOCATION-AWARE focus'));
    ok('agent: experience block', p.includes('EXPERIENCE/PLACE focus'));
    ok('agent: content block', p.includes('CONTENT/MEDIA focus'));
    ok('agent: service block', p.includes('SERVICE/PROFESSIONAL focus'));
    ok('agent: comparative block', p.includes('COMPARATIVE focus'));
  }
  // No facets active → no focus-areas section.
  ok('agent: no focus block when all facets off', !buildAgentPrompt('q', CONFIG, {
    is_buyable: false, needs_location: false, is_experience: false,
    is_content: false, is_service: false, is_comparative: false,
  }).includes('FOCUS AREAS'));

  // buildSynthesisPrompt — core content + the quality rules.
  {
    const notes = [{ category: 'top', content: 'Synology is well-reviewed' }];
    const sources = [{
      source: 'web', title: 'NAS Review', url: 'https://rtings.com/x',
      content: 'hands-on testing of the DS224+ '.repeat(10),
      amazonUrls: ['https://www.amazon.com/dp/B0ABCDEFGH'],
    }];
    const p = buildSynthesisPrompt('best nas', notes, sources, CONFIG, { recency_sensitive: false, is_buyable: true }, 'NAS', {});
    ok('synth: includes topical category', p.includes('topical category is "NAS"'));
    ok('synth: brand-quality rule present', p.includes('PRODUCT/BRAND QUALITY'));
    ok('synth: marketplace-churn guidance', p.includes('marketplace-churn'));
    ok('synth: open-source rule present', p.includes('OPEN-SOURCE / SELF-HOSTED'));
    ok('synth: rank-tracks-quality rule', p.includes('RANK MUST TRACK QUALITY'));
    // The actual extracted-URL block has unique text; "VERIFIED AMAZON PRODUCT
    // URLS" alone also appears in the static schema, so match the block body.
    ok('synth: verified amazon block when amazonUrls present', p.includes('extracted from source content — USE these'));
    ok('synth: includes note content', p.includes('Synology is well-reviewed'));
  }

  // Recency filtering: a stale dated source is dropped and announced.
  {
    const nowSec = Math.floor(Date.now() / 1000);
    const sources = [
      { source: 'web', title: 'Old', url: 'https://x/old', content: 'old', publishedAt: nowSec - 800 * 86400 },
      { source: 'web', title: 'Fresh', url: 'https://x/new', content: 'new', publishedAt: nowSec - 10 * 86400 },
    ];
    const p = buildSynthesisPrompt('q here', [], sources, CONFIG, { recency_sensitive: true }, '', {});
    ok('synth: announces dropped stale sources', p.includes('stale source') && p.includes('dropped'));
    ok('synth: keeps the fresh source', p.includes('https://x/new'));
  }

  // No amazonUrls → no verified-amazon block.
  {
    const p = buildSynthesisPrompt('q here', [], [{ source: 'web', title: 'T', url: 'https://x', content: 'c' }], CONFIG, { recency_sensitive: false }, '', {});
    ok('synth: no amazon block without amazonUrls', !p.includes('extracted from source content — USE these'));
  }

  // null facets → effectiveFacets default branch (no throw, buyable hint).
  ok('synth: null facets uses defaults', typeof buildSynthesisPrompt('q here', [], [], CONFIG, null, '', {}) === 'string');

  // Mixed dated/undated sources exercise every branch of the recency sort
  // comparator (dated-vs-dated, undated-sinks-below-dated, both-undated).
  {
    const nowSec = Math.floor(Date.now() / 1000);
    const sources = [
      { source: 'web', title: 'Undated A', url: 'https://x/u1', content: 'a' },
      { source: 'web', title: 'Dated New', url: 'https://x/d2', content: 'b', publishedAt: nowSec - 5 * 86400 },
      { source: 'web', title: 'Undated B', url: 'https://x/u3', content: 'c' },
      { source: 'web', title: 'Dated Old', url: 'https://x/d4', content: 'd', publishedAt: nowSec - 100 * 86400 },
    ];
    const p = buildSynthesisPrompt('q here', [], sources, CONFIG, { recency_sensitive: false }, '', {});
    ok('synth: dated source ranks before undated', p.indexOf('https://x/d2') < p.indexOf('https://x/u1'));
  }

  return report;
}
