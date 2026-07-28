/**
 * Pre-research clarifying-questions interstitial.
 *
 * After the classifier accepts a query and returns clarifying_questions, the
 * worker renders this page instead of kicking off the pipeline. The user
 * picks chips (or types free-text), hits Run. The form GETs /research/new
 * with the original query and one clarify_<key> param per question.
 * handleNewResearch sees the clarify_* params, skips this page, and starts
 * research with the answers threaded through.
 */

import { layout } from '../lib/html.js';
import { escapeHtml, displayQuery } from '../lib/utils.js';
import { RESEARCH_ETA } from '../lib/engine-config.js';

function renderQuestion(q, idx) {
    const inputName = `clarify_${escapeHtml(q.key)}`;
    const chips = (q.suggested_answers || []).map((a, i) => {
        const id = `q${idx}_a${i}`;
        const escaped = escapeHtml(a);
        return `<label class="chip" for="${id}">
<input type="radio" id="${id}" name="${inputName}" value="${escaped}" data-chip>
<span>${escaped}</span>
</label>`;
    }).join('');
    return `<fieldset class="clarify-field mb-6 border-0 p-0">
<legend class="mb-2.5 font-sans text-body font-semibold text-ink">${escapeHtml(q.question)}</legend>
<div class="chip-row mb-2 flex flex-wrap gap-2">
${chips}
</div>
<input type="text" name="${inputName}_custom" placeholder="Or type your own answer" maxlength="80" data-custom aria-label="${escapeHtml(q.question)} — custom answer" class="w-full border border-line bg-surface-1 px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25">
</fieldset>`;
}

/**
 * Render the clarify interstitial. `questions` is the classifier's
 * clarifying_questions array (each: { key, question, suggested_answers }).
 */
export function renderClarifyPage(query, questions, env) {
    const prettyQuery = displayQuery(query);
    // One research depth for every run: a single label and time estimate.
    const researchLabel = 'Deep research';
    const researchTime = `about ${RESEARCH_ETA}`;

    const body = `<div class="grid-bg border-b border-line">
<div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 font-mono text-[11px] uppercase tracking-widest text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">Quick questions</span>
</nav>

<p class="font-mono text-[11px] uppercase tracking-widest text-ink-3">Instrument &middot; Calibration questions</p>
<h1 class="mt-2 mb-2 font-serif text-h1 font-semibold text-ink">A couple of questions first</h1>
<p class="mb-1 text-body text-ink-2">Researching <strong class="font-serif italic text-accent">&ldquo;${escapeHtml(prettyQuery)}&rdquo;</strong> as <strong class="text-ink">${researchLabel}</strong> (${researchTime}).</p>
<p class="mb-8 text-body-sm text-ink-3">Your answers steer the pick. Skip any question to let the research engine choose defaults.</p>

<form action="/research/new" method="GET" class="clarify-form" id="clarify-form">
<input type="hidden" name="q" value="${escapeHtml(query)}">
${questions.map(renderQuestion).join('')}

<div class="mt-4 flex flex-wrap gap-2">
<button type="submit" class="inline-flex min-w-[10rem] flex-1 items-center justify-center gap-2 bg-accent-strong px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover">Run ${escapeHtml(researchLabel)} research &#9656;</button>
<button type="submit" name="skip_clarify" value="1" class="inline-flex items-center gap-2 border border-line bg-surface-1 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:border-ink-3">Skip &mdash; research as-is</button>
</div>
</form>
</div>
</div>

<script nonce="__CSP_NONCE__">
(function(){
  // Custom-text override: typing in the free-text box clears the chip selection
  // for that question so the custom value wins on submit. Keeps form semantics
  // clean without needing JS-side value merging.
  document.querySelectorAll('.clarify-form fieldset').forEach(function(fs){
    var custom = fs.querySelector('input[data-custom]');
    if(!custom) return;
    custom.addEventListener('input', function(){
      if(custom.value.trim().length > 0){
        fs.querySelectorAll('input[data-chip]').forEach(function(r){ r.checked = false; });
      }
    });
    // If a chip is picked, clear any custom text so it doesn't accidentally
    // ride along to the server (server picks the _custom suffix over the chip
    // when both are present).
    fs.querySelectorAll('input[data-chip]').forEach(function(r){
      r.addEventListener('change', function(){
        if(r.checked && custom.value.trim().length > 0) custom.value = '';
      });
    });
  });
})();
</script>`;

    return layout(
        'Quick questions',
        `A few clarifying questions before we research "${prettyQuery}".`,
        body,
        '<meta name="robots" content="noindex, nofollow">',
        { ogUrl: `https://chrisputer.tech/research/new?q=${encodeURIComponent(query)}` },
    );
}

/**
 * Extract user-supplied clarifications from the URL searchParams. Scans the
 * params directly for any clarify_<key> (or clarify_<key>_custom) — doesn't need
 * the classifier to tell us the keys, which matters when the classifier fails
 * open between the interstitial render and the form submit. The _custom suffix
 * wins over the chip value when both are present. Max 5 entries; keys are
 * snake_case <=40 chars, values <=80 chars.
 */
export function extractClarifications(url) {
    const raw = {};
    for (const [name, value] of url.searchParams.entries()) {
        if (!name.startsWith('clarify_')) continue;
        const stripped = name.slice('clarify_'.length);
        const isCustom = stripped.endsWith('_custom');
        const key = (isCustom ? stripped.slice(0, -'_custom'.length) : stripped)
            .toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
        if (!key) continue;
        if (!raw[key]) raw[key] = {};
        const trimmed = value.trim().slice(0, 80);
        if (!trimmed) continue;
        if (isCustom) raw[key].custom = trimmed;
        else raw[key].chip = trimmed;
    }
    const out = {};
    let i = 0;
    for (const [key, { chip, custom }] of Object.entries(raw)) {
        if (i >= 5) break;
        const value = (custom && custom.length > 0) ? custom : chip;
        if (value && value.length > 0) {
            out[key] = value;
            i++;
        }
    }
    return out;
}
