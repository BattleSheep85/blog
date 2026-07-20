// Truth Audit pure-logic coverage: isMarketingEcho, applyStanceBackstops,
// buildClaimEvidence, topEvidenceForClaim — the deterministic backstop/join
// logic ported into worker/engine/verify.js (single source of truth, also
// used by benchmarks/verify-product.mjs).
import {
  isMarketingEcho,
  spanHasGenuineTestLanguage,
  applyStanceBackstops,
  buildClaimEvidence,
  topEvidenceForClaim,
  selectSourcesToHydrate,
} from '../../worker/engine/verify.js';

export function runVerifyTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  // ── isMarketingEcho ──────────────────────────────────────────────────────
  {
    ok(
      'isMarketingEcho: verbatim manufacturer copy matching the claim → true',
      isMarketingEcho('Ultra Long 50H Playtime', 'Ultra Long 50H Playtime'),
    );
    ok(
      'isMarketingEcho: span is a longer block containing the claim phrase → true',
      isMarketingEcho('Featuring Ultra Long 50H Playtime and ANC', 'Ultra Long 50H Playtime'),
    );
    eq(
      'isMarketingEcho: real test language, not just spec restatement → false',
      isMarketingEcho('we measured 10.5h of playback in our test', 'Ultra Long 50H Playtime'),
      false,
    );
    eq('isMarketingEcho: too-short span is never a meaningful echo', isMarketingEcho('50H', 'Ultra Long 50H Playtime'), false);
    eq('isMarketingEcho: too-short claim is never a meaningful echo', isMarketingEcho('some longer span text here', 'ANC'), false);
  }

  // ── spanHasGenuineTestLanguage ───────────────────────────────────────────
  {
    ok('spanHasGenuineTestLanguage: "we measured" → true', spanHasGenuineTestLanguage('we measured 10.5h in our test'));
    ok('spanHasGenuineTestLanguage: "after testing" → true', spanHasGenuineTestLanguage('after testing for a week, battery held up'));
    eq('spanHasGenuineTestLanguage: plain spec restatement → false', spanHasGenuineTestLanguage('Ultra Long 50H Playtime'), false);
  }

  // ── applyStanceBackstops ─────────────────────────────────────────────────
  {
    eq(
      'applyStanceBackstops: manufacturer-tagged support → neutral',
      applyStanceBackstops({ stance: 'support', span: 'we measured 10.5h', tags: ['manufacturer'] }, 'battery lasts 10.5h'),
      'neutral',
    );
    eq(
      'applyStanceBackstops: sponsored-tagged support → neutral',
      applyStanceBackstops({ stance: 'support', span: 'we measured 10.5h', tags: ['sponsored-content'] }, 'battery lasts 10.5h'),
      'neutral',
    );
    eq(
      'applyStanceBackstops: span-echo support (no test language) → neutral',
      applyStanceBackstops({ stance: 'support', span: 'Ultra Long 50H Playtime', tags: ['hands-on'] }, 'Ultra Long 50H Playtime'),
      'neutral',
    );
    eq(
      'applyStanceBackstops: genuine hands-on measured span → stays support',
      applyStanceBackstops({ stance: 'support', span: 'we measured ~10.5 h of playback in our battery test', tags: ['hands-on'] }, 'battery lasts 10.5 hours'),
      'support',
    );
    eq(
      'applyStanceBackstops: never upgrades an existing neutral',
      applyStanceBackstops({ stance: 'neutral', span: 'we measured 10.5h', tags: [] }, 'battery lasts 10.5h'),
      'neutral',
    );
    eq(
      'applyStanceBackstops: never touches an existing contradict',
      applyStanceBackstops({ stance: 'contradict', span: 'we measured only 6h', tags: ['manufacturer'] }, 'battery lasts 10.5h'),
      'contradict',
    );
  }

  // ── buildClaimEvidence ───────────────────────────────────────────────────
  {
    const claim = { id: 'c1', text: 'battery lasts 10.5 hours', type: 'spec' };
    const scoredEvidence = [
      { url: 'https://expert.com/review', title: 'Expert Review', content: '...', credibility: 90, independence: 70, tags: ['hands-on', 'expert-domain'] },
      { url: 'https://mfg.com/spec', title: 'Spec Page', content: '...', credibility: 40, independence: 10, tags: ['manufacturer'] },
      { url: 'https://unmatched.com/page', title: 'Unmatched', content: '...', credibility: 60, independence: 50, tags: [] },
    ];
    const stanceRows = [
      { url: 'https://expert.com/review', stance: 'support', span: 'we measured ~10.5 h of playback in our battery test' },
      { url: 'https://mfg.com/spec', stance: 'support', span: 'Ultra Long 10.5H Playtime' },
      { url: 'https://not-in-evidence.com', stance: 'support', span: 'irrelevant' },
    ];

    const result = buildClaimEvidence(claim, scoredEvidence, stanceRows);

    eq('buildClaimEvidence: drops rows with no matching scored-evidence url', result.length, 2);
    eq(
      'buildClaimEvidence: joined urls are exactly the matched ones',
      result.map((r) => r.url).sort(),
      ['https://expert.com/review', 'https://mfg.com/spec'],
    );

    const expertRow = result.find((r) => r.url === 'https://expert.com/review');
    eq('buildClaimEvidence: genuine hands-on measurement stays support', expertRow.stance, 'support');
    eq('buildClaimEvidence: carries credibility/independence/tags from scored evidence', expertRow.credibility, 90);
    eq('buildClaimEvidence: carries the span from the stance row', expertRow.span, 'we measured ~10.5 h of playback in our battery test');

    const mfgRow = result.find((r) => r.url === 'https://mfg.com/spec');
    eq('buildClaimEvidence: manufacturer support downgraded to neutral via backstop', mfgRow.stance, 'neutral');

    eq('buildClaimEvidence: unmatched scored-evidence item (no stance row) is absent', result.some((r) => r.url === 'https://unmatched.com/page'), false);

    // Empty inputs are handled gracefully.
    eq('buildClaimEvidence: empty stance rows → empty result', buildClaimEvidence(claim, scoredEvidence, []), []);
    eq('buildClaimEvidence: non-array stance rows → empty result', buildClaimEvidence(claim, scoredEvidence, null), []);
  }

  // ── topEvidenceForClaim ──────────────────────────────────────────────────
  {
    const handsOnExpert = { url: 'https://a.com', credibility: 90, independence: 70, tags: ['hands-on', 'expert-domain'] };
    const manufacturer = { url: 'https://b.com', credibility: 50, independence: 100, tags: ['manufacturer'] };
    const listicle = { url: 'https://c.com', credibility: 50, independence: 50, tags: ['listicle'] };
    const sponsored = { url: 'https://d.com', credibility: 60, independence: 50, tags: ['sponsored-content'] };
    const communitySrc = { url: 'https://e.com', credibility: 55, independence: 60, tags: ['community'] };

    const evidence = [manufacturer, listicle, sponsored, handsOnExpert, communitySrc];
    const ranked = topEvidenceForClaim(evidence);

    eq('topEvidenceForClaim: ranks the hands-on expert source first (highest verificationWeight)', ranked[0].url, 'https://a.com');
    eq('topEvidenceForClaim: default n keeps all 5 when under the cap', ranked.length, 5);

    const limited = topEvidenceForClaim(evidence, 2);
    eq('topEvidenceForClaim: respects a custom n', limited.length, 2);
    eq('topEvidenceForClaim: n=2 still leads with the strongest source', limited[0].url, 'https://a.com');

    // Does not mutate the input array.
    const original = [...evidence];
    topEvidenceForClaim(evidence, 3);
    eq('topEvidenceForClaim: does not mutate the input array', evidence.map((e) => e.url), original.map((e) => e.url));
  }

  // ── selectSourcesToHydrate ────────────────────────────────────────────────
  {
    const thinA = { url: 'https://a.com', content: 'short snippet' }; // < 800 chars
    const thinB = { url: 'https://b.com', content: 'x'.repeat(100) };
    const thinC = { url: 'https://c.com', content: 'y'.repeat(200) };
    const rich = { url: 'https://d.com', content: 'z'.repeat(2000) }; // >= 800 chars
    const noContent = { url: 'https://e.com' }; // no `content` at all — treated as thin

    eq(
      'selectSourcesToHydrate: picks only the thin sources, in order',
      selectSourcesToHydrate([rich, thinA, thinB]).map((s) => s.url),
      ['https://a.com', 'https://b.com'],
    );

    eq(
      'selectSourcesToHydrate: respects the max cap',
      selectSourcesToHydrate([thinA, thinB, thinC], { max: 2 }).map((s) => s.url),
      ['https://a.com', 'https://b.com'],
    );

    eq('selectSourcesToHydrate: empty input → empty output', selectSourcesToHydrate([]), []);

    eq('selectSourcesToHydrate: all-rich input → empty output', selectSourcesToHydrate([rich]), []);

    eq(
      'selectSourcesToHydrate: a source with no content is treated as thin',
      selectSourcesToHydrate([noContent]).map((s) => s.url),
      ['https://e.com'],
    );

    const input = [thinA, rich, thinB];
    const result = selectSourcesToHydrate(input);
    ok('selectSourcesToHydrate: returns a new array, not the input reference', result !== input);

    eq(
      'selectSourcesToHydrate: a custom thinChars threshold is honored',
      selectSourcesToHydrate([thinC], { thinChars: 100 }).map((s) => s.url),
      [], // thinC is 200 chars, above a 100-char threshold — not thin under that threshold
    );
  }

  return report;
}
