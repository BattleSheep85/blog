// The hidden, unlinked `/frank` page. The keyboard-listener JS for the
// site-wide easter eggs (Konami code, typed "frank" trigger, devtools
// console message) lives in `public/js/frank-egg.js` and is loaded via a
// script tag in worker/lib/html.js `layout()` + public/index.html. Delete
// this file, public/js/frank-egg.js, the FRANK_EGG_SCRIPT_TAG in
// worker/lib/html.js, the matching tag in public/index.html, and the
// /frank route in worker/index.js to fully remove the feature.

import { layout } from '../lib/html.js';

const FRANK_BODY = `<div class="mx-auto max-w-2xl px-6 py-16 md:py-24">
<h1 class="font-serif text-h1 font-semibold text-ink">Frank</h1>
<div class="mt-8 space-y-4 font-mono text-sm leading-relaxed text-ink-2">
<p>Frank's Code:<br>
Always cite the source.<br>
Never invent a spec.<br>
Say I don't know when that is the truth.<br>
This is, roughly, the way.</p>
<p>No, Frank does not wear beskar. Budget did not allow it.</p>
<p>Frank is not a real person. Frank is a stack of language models wearing a nice sweater. He reads a lot, though.</p>
<p>If you are reading this, you found a page nothing on the site links to. That is the whole point. Go outside sometime. Or do not, this was pretty fun too.</p>
</div>
</div>`;

// Rendered on demand by the /frank route in worker/index.js. Never linked
// from anywhere else on the site, never in the sitemap, always noindex.
export function renderFrankPage() {
  return layout(
    'Frank',
    'A hidden page. You found it fair and square.',
    FRANK_BODY,
    '<meta name="robots" content="noindex, nofollow">',
  );
}
