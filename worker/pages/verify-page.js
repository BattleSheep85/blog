/**
 * Product-verification pages: the /verify entry form and the /verify/:slug
 * status + report page. Mirrors worker/pages/clarify.js's minimal, dependency-
 * free style and reuses the shared `layout()` shell so verification pages are
 * styled consistently with /research/:slug. Additive-only — no ranking-page
 * behavior is touched.
 */

import { layout } from '../lib/html.js';
import { escapeHtml, displayQuery, isValidHttpsUrl, parseJsonSafe } from '../lib/utils.js';
import { getResearchBySlug } from '../lib/db.js';
import { buildAffiliateUrl, retailerLabel, resolveAmazonTag } from '../lib/affiliate-links.js';

/**
 * GET /verify — the product-entry form.
 */
export function renderVerifyEntryPage() {
    const body = `<div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 text-caption text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">Verify a product</span>
</nav>

<h1 class="mb-2 font-serif text-h1 font-semibold text-ink">Verify a product&rsquo;s claims</h1>
<p class="mb-8 text-body text-ink-2">Tell us a product. We check what it claims about itself against independent sources — specs, reviews, warranty terms — and score how well the claims hold up.</p>

<form id="verify-form" class="verify-form">
<label for="verify-product" class="mb-2 block text-body-sm font-semibold text-ink">Product</label>
<input type="text" id="verify-product" name="product" required minlength="3" maxlength="200" placeholder="e.g. Anker Soundcore Liberty 4 NC" class="mb-4 w-full rounded-lg border border-line bg-surface-1 px-3 py-2.5 font-sans text-body text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent/25">
<button type="submit" id="verify-submit" class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-strong px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover">Verify it</button>
</form>

<div id="verify-status" class="mt-8" role="status" aria-live="polite"></div>
</div>

<script nonce="__CSP_NONCE__">
(function(){
  var form = document.getElementById('verify-form');
  var statusBox = document.getElementById('verify-status');
  var submitBtn = document.getElementById('verify-submit');
  if (!form) return;

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Verifying…' : 'Verify it';
  }

  function showMessage(text, isError) {
    statusBox.innerHTML = '';
    var p = document.createElement('p');
    p.className = isError ? 'text-body-sm text-trust-low' : 'text-body-sm text-ink-2';
    p.textContent = text;
    statusBox.appendChild(p);
  }

  function renderUrlPrompt(reportId, product, message) {
    statusBox.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'rounded-lg border border-line bg-surface-1 p-4';
    var msg = document.createElement('p');
    msg.className = 'mb-3 text-body-sm text-ink-2';
    msg.textContent = message || 'We couldn\\'t find that product\\'s page — paste its Amazon / Best Buy / Walmart / manufacturer URL.';
    var urlForm = document.createElement('form');
    urlForm.className = 'flex flex-wrap gap-2';
    var input = document.createElement('input');
    input.type = 'url';
    input.required = true;
    input.placeholder = 'https://...';
    input.className = 'min-w-[14rem] flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-sans text-body-sm text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent/25';
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'rounded-lg bg-accent-strong px-4 py-2 text-body-sm font-semibold text-white hover:bg-accent-hover';
    btn.textContent = 'Continue';
    urlForm.appendChild(input);
    urlForm.appendChild(btn);
    wrap.appendChild(msg);
    wrap.appendChild(urlForm);
    statusBox.appendChild(wrap);

    urlForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitVerify({ reportId: reportId, productUrl: input.value.trim(), product: product });
    });
  }

  function poll(reportId, slug, product) {
    fetch('/api/verify/' + encodeURIComponent(reportId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status === 'needs_input' || data.needsUrl) {
          setBusy(false);
          renderUrlPrompt(reportId, product, data.message);
          return;
        }
        if (data.status === 'completed') {
          showMessage('Done. Opening your report…', false);
          window.location.href = '/verify/' + (data.slug || slug);
          return;
        }
        if (data.status === 'error') {
          setBusy(false);
          showMessage('Verification failed — please try again.', true);
          return;
        }
        setTimeout(function () { poll(reportId, slug, product); }, 2000);
      })
      .catch(function () {
        setTimeout(function () { poll(reportId, slug, product); }, 3000);
      });
  }

  function submitVerify(payload) {
    setBusy(true);
    showMessage('Submitting…', false);
    fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          setBusy(false);
          showMessage(data.error, true);
          return;
        }
        showMessage('Queued. Checking on it…', false);
        poll(data.id, data.slug, payload.product);
      })
      .catch(function () {
        setBusy(false);
        showMessage('Could not reach the server. Please try again.', true);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var product = document.getElementById('verify-product').value.trim();
    if (product.length < 3) return;
    submitVerify({ product: product });
  });
})();
</script>`;

    return layout(
        'Verify a product',
        'Check a product\'s claims against independent sources and get an honest verdict.',
        body,
        '<meta name="robots" content="noindex, nofollow">',
        { ogUrl: 'https://chrisputer.tech/verify' },
    );
}

/**
 * GET /verify/:slug — status/poll page while processing, minimal report once
 * complete. Returns null when no row matches the slug (caller 404s).
 */
export async function renderVerifyResultPage(slug, env) {
    const row = await getResearchBySlug(env.DB, slug);
    if (!row || row.kind !== 'verification') return null;

    if (row.status === 'complete') {
        return await renderCompleteReport(row, env);
    }

    return renderProcessingPage(row);
}

function renderProcessingPage(row) {
    const prettyProduct = displayQuery(row.query);
    const isNeedsInput = row.status === 'needs_input';

    const body = `<div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 text-caption text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<a href="/verify" class="hover:text-ink">Verify</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">${escapeHtml(prettyProduct)}</span>
</nav>

<h1 class="mb-2 font-serif text-h1 font-semibold text-ink">Verifying &ldquo;${escapeHtml(prettyProduct)}&rdquo;</h1>

<div id="processing" class="mt-6 rounded-lg border border-line bg-surface-1 p-5">
<div class="mb-1 flex items-center gap-3">
<div class="spinner" style="width:1.5rem;height:1.5rem;border-width:2px;margin:0;flex-shrink:0"></div>
<p id="verify-status-text" class="text-body-sm text-ink-2">${isNeedsInput ? 'Waiting for a product URL…' : 'Checking claims against independent sources…'}</p>
</div>
</div>

<div id="verify-url-prompt" class="mt-6"${isNeedsInput ? '' : ' style="display:none"'}>
${isNeedsInput ? renderUrlPromptMarkup(row.preview) : ''}
</div>

<script nonce="__CSP_NONCE__">
(function(){
  var reportId = ${JSON.stringify(row.id)};
  var slug = ${JSON.stringify(row.slug)};
  var product = ${JSON.stringify(row.query)};
  var needsInput = ${isNeedsInput ? 'true' : 'false'};

  function poll() {
    fetch('/api/verify/' + encodeURIComponent(reportId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.status === 'needs_input' || data.needsUrl) {
          if (!needsInput) {
            needsInput = true;
            document.getElementById('verify-status-text').textContent = 'Waiting for a product URL…';
            var promptBox = document.getElementById('verify-url-prompt');
            promptBox.style.display = '';
            promptBox.innerHTML = ${JSON.stringify('')};
            renderPrompt(data.message);
          }
          setTimeout(poll, 3000);
          return;
        }
        if (data.status === 'completed') {
          window.location.href = '/verify/' + (data.slug || slug);
          return;
        }
        if (data.status === 'error') {
          document.getElementById('verify-status-text').textContent = 'Verification failed — please try again.';
          return;
        }
        setTimeout(poll, 2000);
      })
      .catch(function () { setTimeout(poll, 3000); });
  }

  function renderPrompt(message) {
    var box = document.getElementById('verify-url-prompt');
    box.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'rounded-lg border border-line bg-surface-1 p-4';
    var msg = document.createElement('p');
    msg.className = 'mb-3 text-body-sm text-ink-2';
    msg.textContent = message || 'We couldn\\'t find that product\\'s page — paste its URL to continue.';
    var urlForm = document.createElement('form');
    urlForm.className = 'flex flex-wrap gap-2';
    var input = document.createElement('input');
    input.type = 'url';
    input.required = true;
    input.placeholder = 'https://...';
    input.className = 'min-w-[14rem] flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-sans text-body-sm text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent/25';
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'rounded-lg bg-accent-strong px-4 py-2 text-body-sm font-semibold text-white hover:bg-accent-hover';
    btn.textContent = 'Continue';
    urlForm.appendChild(input);
    urlForm.appendChild(btn);
    wrap.appendChild(msg);
    wrap.appendChild(urlForm);
    box.appendChild(wrap);

    urlForm.addEventListener('submit', function (e) {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: reportId, product: product, productUrl: input.value.trim() }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.error) {
            btn.disabled = false;
            btn.textContent = 'Continue';
            msg.textContent = data.error;
            return;
          }
          document.getElementById('verify-status-text').textContent = 'Checking claims against independent sources…';
          box.style.display = 'none';
          needsInput = false;
          poll();
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Continue';
        });
    });
  }

  if (needsInput) renderPrompt(${JSON.stringify(row.preview || '')});
  setTimeout(poll, needsInput ? 3000 : 1500);
})();
</script>
</div>`;

    return {
        html: layout(
            `Verifying ${prettyProduct}`,
            `Checking "${prettyProduct}"'s claims against independent sources.`,
            body,
            '<meta name="robots" content="noindex, nofollow">',
            { ogUrl: `https://chrisputer.tech/verify/${row.slug}` },
        ),
        lastModified: row.created_at,
    };
}

// Server-side fallback markup for the URL prompt (progressive enhancement —
// the inline script above re-renders it via renderPrompt on first paint, but
// this ensures something usable shows even if JS is briefly slow to run).
function renderUrlPromptMarkup(message) {
    return `<div class="rounded-lg border border-line bg-surface-1 p-4">
<p class="mb-3 text-body-sm text-ink-2">${escapeHtml(message || "We couldn't find that product's page — paste its Amazon / Best Buy / Walmart / manufacturer URL.")}</p>
</div>`;
}

// Verdict pill styling per claim status. Uses only compiled Tailwind
// utilities (custom trust-* palette) — no new classes, no CSS rebuild.
const VERDICT_PILL = {
    verified: { label: 'Verified', bg: 'bg-trust-high-bg', text: 'text-trust-high' },
    'partially-verified': { label: 'Partially verified', bg: 'bg-trust-medium-bg', text: 'text-trust-medium' },
    unsubstantiated: { label: 'Unsubstantiated', bg: 'bg-surface-2', text: 'text-ink-3' },
    contradicted: { label: 'Contradicted', bg: 'bg-trust-low-bg', text: 'text-trust-low' },
};

function verdictPill(status) {
    return VERDICT_PILL[status] || { label: 'Unknown', bg: 'bg-surface-2', text: 'text-ink-3' };
}

// Overall score band -> trust color, per the brief's thresholds.
function scoreBandClasses(score) {
    const n = Number(score) || 0;
    if (n >= 80) return { bg: 'bg-trust-high-bg', text: 'text-trust-high' };
    if (n >= 60) return { bg: 'bg-trust-high-bg', text: 'text-trust-high' };
    if (n >= 40) return { bg: 'bg-trust-medium-bg', text: 'text-trust-medium' };
    if (n >= 20) return { bg: 'bg-trust-low-bg', text: 'text-trust-low' };
    return { bg: 'bg-trust-low-bg', text: 'text-trust-low' };
}

// Claim status -> sort rank for the "worst first" ledger ordering: a reader
// scanning top-to-bottom sees the problems before the confirmations.
const STATUS_SORT_RANK = {
    contradicted: 0,
    unsubstantiated: 1,
    'partially-verified': 2,
    verified: 3,
};

function claimTypeLabel(type) {
    const map = { spec: 'Spec', warranty: 'Warranty', marketing: 'Marketing', support: 'Support' };
    return map[type] || 'Claim';
}

// Independence/conflict tags -> short human chip labels. Anything not in this
// map is dropped rather than rendering a raw internal tag name.
const EVIDENCE_TAG_CHIPS = {
    'affiliate-conflict': 'affiliate',
    'sponsored-content': 'sponsored',
    'seeded-unit': 'seeded unit',
    'incentivized-review': 'incentivized',
    'nda-embargo': 'NDA/embargo',
    manufacturer: 'manufacturer',
};

function evidenceTagChips(tags) {
    const list = Array.isArray(tags) ? tags : [];
    return list
        .map((t) => EVIDENCE_TAG_CHIPS[t])
        .filter(Boolean)
        .map((label) => `<span class="ml-2 inline-block rounded-full bg-surface-2 px-2 py-1 text-caption text-ink-3">${escapeHtml(label)}</span>`)
        .join('');
}

function evidenceHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function truncateSpan(span, max = 160) {
    const s = String(span || '').trim();
    if (!s) return '';
    return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

// One evidence row (supporting or contradicting). `direction` is 'support' or
// 'contradict' — controls the arrow glyph + color accent.
function renderEvidenceRow(item, direction) {
    if (!item) return '';
    const host = evidenceHost(item.url);
    const hostHtml = isValidHttpsUrl(item.url)
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer nofollow" class="font-semibold text-ink hover:text-accent">${escapeHtml(host)}</a>`
        : `<span class="font-semibold text-ink">${escapeHtml(host)}</span>`;
    const arrow = direction === 'support'
        ? '<span aria-hidden="true" class="text-trust-high">&uarr;</span>'
        : '<span aria-hidden="true" class="text-trust-low">&darr;</span>';
    const cred = Number.isFinite(item.credibility) ? Math.round(item.credibility) : null;
    const indep = Number.isFinite(item.independence) ? Math.round(item.independence) : null;
    const scoreHtml = (cred != null || indep != null)
        ? `<span class="ml-2 text-caption text-ink-3">cred ${escapeHtml(String(cred ?? '—'))} / indep ${escapeHtml(String(indep ?? '—'))}</span>`
        : '';
    const span = truncateSpan(item.span);
    return `<li class="flex items-start gap-2 py-1.5">
${arrow}
<div class="flex-1">
<div class="flex flex-wrap items-center">${hostHtml}${scoreHtml}${evidenceTagChips(item.tags)}</div>
${span ? `<p class="mt-1 text-body-sm text-ink-2">&ldquo;${escapeHtml(span)}&rdquo;</p>` : ''}
</div>
</li>`;
}

function renderClaimCard(claim) {
    const pill = verdictPill(claim.status);
    const confidencePct = Number.isFinite(claim.confidence) ? Math.round(claim.confidence * 100) : null;
    const supporting = (claim.supporting || []).slice(0, 3);
    const contradicting = (claim.contradicting || []).slice(0, 2);
    const hasEvidence = supporting.length > 0 || contradicting.length > 0;

    const evidenceHtml = hasEvidence
        ? `<ul class="mt-3 border-t border-line pt-4">
${supporting.map((s) => renderEvidenceRow(s, 'support')).join('')}
${contradicting.map((c) => renderEvidenceRow(c, 'contradict')).join('')}
</ul>`
        : '';

    const unsubstantiatedNote = claim.status === 'unsubstantiated'
        ? `<p class="mt-3 text-body-sm text-ink-3">No independent source corroborated this — it appears only in the maker&rsquo;s own materials.</p>`
        : '';

    return `<li class="mb-4 rounded-lg border border-line bg-surface-1 p-5">
<div class="flex flex-wrap items-center gap-2">
<span class="inline-flex items-center rounded-full ${pill.bg} px-2.5 py-1 text-caption font-semibold ${pill.text}">${escapeHtml(pill.label)}</span>
<span class="rounded-full bg-surface-2 px-2 py-1 text-caption text-ink-3">${escapeHtml(claimTypeLabel(claim.claimType || claim.type))}</span>
${confidencePct != null ? `<span class="text-caption text-ink-3">confidence ${escapeHtml(String(confidencePct))}%</span>` : ''}
<span class="text-caption text-ink-3">${escapeHtml(String(claim.independentCount ?? 0))} independent source${claim.independentCount === 1 ? '' : 's'}</span>
</div>
<p class="mt-2 text-body text-ink">${escapeHtml(claim.text)}</p>
${unsubstantiatedNote}
${evidenceHtml}
</li>`;
}

function sortedClaims(claims) {
    return [...claims].sort((a, b) => {
        const ra = STATUS_SORT_RANK[a.status] ?? 99;
        const rb = STATUS_SORT_RANK[b.status] ?? 99;
        return ra - rb;
    });
}

function renderVerdictHeader(prettyProduct, overall, claimCount, evidenceCount) {
    const band = scoreBandClasses(overall.score);
    return `<div class="rounded-lg border border-line bg-surface-1 p-6">
<div class="flex flex-wrap items-center gap-4">
<span class="inline-flex items-center gap-2 rounded-full ${band.bg} px-4 py-2 text-body-sm font-semibold ${band.text}">${escapeHtml(overall.label || 'Unknown')} &middot; ${escapeHtml(String(overall.score ?? 0))}/100</span>
</div>
<p class="mt-3 text-body-sm text-ink-2">We audited ${escapeHtml(String(claimCount))} of ${escapeHtml(prettyProduct)}&rsquo;s claims against ${escapeHtml(String(evidenceCount))} independent evidence source${evidenceCount === 1 ? '' : 's'}.</p>
</div>`;
}

function renderMethodology() {
    return `<details class="mt-8 rounded-lg border border-line bg-surface-1 p-5">
<summary class="cursor-pointer text-body-sm font-semibold text-ink">How this Truth Audit works</summary>
<div class="mt-3 text-body-sm text-ink-2">
<p>Every verdict is evidence-weighted by source credibility × reviewer independence. A claim only earns &ldquo;Verified&rdquo; when at least two independent sources confirm it through their own testing or measurement — echoing the manufacturer&rsquo;s marketing does not count.</p>
<p class="mt-2">Sources tagged as affiliate-conflicted, sponsored, incentivized, or manufacturer-owned are down-weighted or excluded from corroboration, even when they repeat the same claim.</p>
</div>
</details>`;
}

// Buy CTA for the subject product itself. Uses the same buildAffiliateUrl/
// retailerLabel path as research-page.js's resolveProductCtas so the link
// behavior (host allowlist, tag injection, https-only) is identical.
function renderBuyCta(productUrl, env) {
    if (!productUrl || !isValidHttpsUrl(productUrl)) return '';
    const ids = { amazonTag: resolveAmazonTag(env) };
    const affiliateUrl = buildAffiliateUrl(productUrl, ids);
    if (!affiliateUrl || !isValidHttpsUrl(affiliateUrl)) return '';
    const label = `Buy on ${retailerLabel(affiliateUrl)}`;
    return `<div class="mt-8 rounded-lg border border-line bg-surface-1 p-5">
<a href="${escapeHtml(affiliateUrl)}" target="_blank" rel="noopener noreferrer nofollow sponsored" class="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-strong px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover">${escapeHtml(label)} <span aria-hidden="true">&#8599;</span></a>
<p class="mt-3 text-caption text-ink-3">We may earn a commission on purchases made through links on this page. Verdicts above are produced from independent evidence analysis and are never influenced by affiliate relationships.</p>
</div>`;
}

async function renderCompleteReport(row, env) {
    const prettyProduct = displayQuery(row.query);
    const result = parseJsonSafe(row.result, {});
    const claims = Array.isArray(result.claims) ? result.claims : [];
    const overall = result.overall || { score: row.overall_score ?? 0, label: row.overall_verdict || 'Unknown' };
    const evidenceCount = Number.isFinite(result.evidenceCount) ? result.evidenceCount : 0;
    const productUrl = result.productUrl || row.subject_url || '';

    const ledgerHtml = claims.length
        ? `<ul class="mt-4">
${sortedClaims(claims).map(renderClaimCard).join('')}
</ul>`
        : `<p class="mt-4 text-body-sm text-ink-3">No individual claims were recorded for this run.</p>`;

    const body = `<div class="mx-auto max-w-2xl px-6 py-12 md:py-16">
<nav aria-label="Breadcrumb" class="mb-6 text-caption text-ink-3">
<a href="/" class="hover:text-ink">Home</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<a href="/verify" class="hover:text-ink">Verify</a>
<span aria-hidden="true" class="mx-1.5">/</span>
<span class="text-ink-2">${escapeHtml(prettyProduct)}</span>
</nav>

<h1 class="mb-4 font-serif text-h1 font-semibold text-ink">${escapeHtml(prettyProduct)}</h1>

${renderVerdictHeader(prettyProduct, overall, claims.length, evidenceCount)}

<h2 class="mt-10 mb-2 font-serif text-h3 font-semibold text-ink">Claim ledger</h2>
${ledgerHtml}

${renderMethodology()}

${renderBuyCta(productUrl, env)}

<!-- TODO(2d): alternatives section -->
</div>`;

    return {
        html: layout(
            prettyProduct,
            row.summary || `Verification report for ${prettyProduct}.`,
            body,
            '',
            { ogUrl: `https://chrisputer.tech/verify/${row.slug}`, canonical: `https://chrisputer.tech/verify/${row.slug}` },
        ),
        lastModified: row.completed_at || row.created_at,
    };
}
