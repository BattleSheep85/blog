/**
 * Auth handlers + SSR account pages.
 * POST /api/auth/signup — create account, set session cookie
 * POST /api/auth/login  — verify password, set session cookie
 * POST /api/auth/logout — destroy session, clear cookie
 * GET  /account         — past searches (redirects to /login when signed out)
 * GET  /login           — sign in / create account page
 */

import {
    createUser, findUserByEmail, verifyPassword, validEmail, validPassword,
    createSession, destroySession, clearSessionCookie, getSessionUser, getUserSearches,
} from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { layout } from '../lib/html.js';
import { escapeHtml, displayQuery } from '../lib/utils.js';

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
    });
}

// Shared throttle for signup + login attempts: 10/hour/IP. Successful logins
// are rare enough per-IP that sharing the bucket with failures is fine.
async function authRateLimited(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const check = await checkRateLimit(env.KV, `auth:${ip}`, 10, 3600);
    return !check.allowed;
}

async function readCredentials(request) {
    let body;
    try { body = await request.json(); } catch { return null; }
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (password.length > 1000) return null; // guard against DoS via expensive hash
    return { email, password };
}

export async function handleSignup(request, env) {
    if (await authRateLimited(request, env)) {
        return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429);
    }
    const creds = await readCredentials(request);
    if (!creds) return jsonResponse({ error: 'Invalid request body' }, 400);
    if (!validEmail(creds.email)) return jsonResponse({ error: 'Enter a valid email address.' }, 400);
    if (!validPassword(creds.password)) return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);

    const existing = await findUserByEmail(env.DB, creds.email);
    if (existing) return jsonResponse({ error: 'An account with that email already exists. Sign in instead.' }, 409);

    let userId;
    try {
        userId = await createUser(env.DB, creds.email, creds.password);
    } catch (err) {
        // Two concurrent requests raced past the findUserByEmail check; the DB
        // UNIQUE constraint caught the second one. Surface the same 409 instead of 500.
        const msg = err instanceof Error ? err.message : String(err);
        if (/UNIQUE constraint failed/i.test(msg)) {
            return jsonResponse({ error: 'An account with that email already exists. Sign in instead.' }, 409);
        }
        throw err;
    }
    const session = await createSession(env.DB, userId);
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': session.cookie });
}

export async function handleLogin(request, env) {
    if (await authRateLimited(request, env)) {
        return jsonResponse({ error: 'Too many attempts. Try again later.' }, 429);
    }
    const creds = await readCredentials(request);
    if (!creds) return jsonResponse({ error: 'Invalid request body' }, 400);

    const user = await findUserByEmail(env.DB, creds.email);
    // Same message for unknown email and wrong password — no account enumeration.
    const failMsg = { error: 'Email or password is incorrect.' };
    if (!user) return jsonResponse(failMsg, 401);
    const ok = await verifyPassword(creds.password, user.password_hash);
    if (!ok) return jsonResponse(failMsg, 401);

    const session = await createSession(env.DB, user.id);
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': session.cookie });
}

export async function handleLogout(request, env) {
    const user = await getSessionUser(request, env);
    if (user) {
        await destroySession(env.DB, user.tokenHash).catch(() => { /* best-effort */ });
    }
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

// --- SSR pages ----------------------------------------------------------------

const AUTH_PAGE_SCRIPT = `<script nonce="__CSP_NONCE__">
(function(){
  function wire(formId, endpoint){
    var form=document.getElementById(formId);
    if(!form)return;
    var msg=form.querySelector('[data-msg]');
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var email=(form.querySelector('input[name=email]').value||'').trim();
      var password=form.querySelector('input[name=password]').value||'';
      if(msg)msg.textContent='Working\\u2026';
      fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,password:password})})
        .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
        .then(function(res){
          if(res.ok&&res.d&&res.d.ok){window.location.href='/account';return}
          if(msg)msg.textContent=(res.d&&res.d.error)||'Something went wrong.';
        })
        .catch(function(){if(msg)msg.textContent='Network error. Try again.'});
    });
  }
  wire('login-form','/api/auth/login');
  wire('signup-form','/api/auth/signup');
  document.querySelectorAll('[data-auth-tab]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var target=btn.dataset.authTab;
      document.querySelectorAll('[data-auth-panel]').forEach(function(p){p.classList.toggle('hidden',p.dataset.authPanel!==target)});
      document.querySelectorAll('[data-auth-tab]').forEach(function(b){
        var active=b.dataset.authTab===target;
        b.classList.toggle('border-accent',active);b.classList.toggle('text-ink',active);
        b.classList.toggle('border-transparent',!active);b.classList.toggle('text-ink-3',!active);
      });
    });
  });
})();
</script>`;

function authForm(id, submitLabel, autocompletePw) {
    return `<form id="${id}" class="flex flex-col gap-4">
<label class="flex flex-col gap-1.5 text-body-sm text-ink-2">Email
<input type="email" name="email" required maxlength="254" autocomplete="email" class="rounded-lg border border-line bg-bg px-3 py-2.5 font-sans text-body text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent/25" placeholder="you@example.com">
</label>
<label class="flex flex-col gap-1.5 text-body-sm text-ink-2">Password
<input type="password" name="password" required minlength="8" maxlength="200" autocomplete="${autocompletePw}" class="rounded-lg border border-line bg-bg px-3 py-2.5 font-sans text-body text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-accent/25" placeholder="At least 8 characters">
</label>
<button type="submit" class="rounded-lg bg-accent-strong px-4 py-2.5 font-sans text-body-sm font-semibold text-white transition-colors hover:bg-accent-hover">${submitLabel}</button>
<p data-msg role="status" aria-live="polite" class="min-h-[1.25rem] text-body-sm text-trust-low"></p>
</form>`;
}

export async function renderLoginPage(request, env) {
    const user = await getSessionUser(request, env);
    if (user) {
        return Response.redirect(new URL('/account', request.url).toString(), 302);
    }
    const body = `<div class="container mx-auto max-w-md px-6 py-16">
<h1 class="font-serif text-h1 font-semibold text-ink">Your account</h1>
<p class="mt-2 text-body text-ink-2">Sign in to keep a history of everything you've researched.</p>
<div class="mt-8 rounded-xl border border-line bg-surface-1 p-6 shadow-card">
<div class="mb-6 flex border-b border-line" role="tablist">
<button type="button" data-auth-tab="login" class="border-b-2 border-accent px-4 py-2 text-body-sm font-semibold text-ink">Sign in</button>
<button type="button" data-auth-tab="signup" class="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-ink-3">Create account</button>
</div>
<div data-auth-panel="login">${authForm('login-form', 'Sign in', 'current-password')}</div>
<div data-auth-panel="signup" class="hidden">${authForm('signup-form', 'Create account', 'new-password')}</div>
</div>
<p class="mt-4 text-caption text-ink-3">We only use your email for sign-in and the research notifications you ask for. No spam, ever.</p>
</div>`;
    const html = layout('Sign in', 'Sign in to TrueRank to see your past research.', body, '<meta name="robots" content="noindex, follow">' + AUTH_PAGE_SCRIPT, { canonical: 'https://chrisputer.tech/login' });
    return html;
}

const ACCOUNT_PAGE_SCRIPT = `<script nonce="__CSP_NONCE__" src="/js/history.js"></script>
<script nonce="__CSP_NONCE__">
(function(){
  var btn=document.getElementById('logout-btn');
  if(btn){
    btn.addEventListener('click',function(){
      fetch('/api/auth/logout',{method:'POST'}).then(function(){window.location.href='/'}).catch(function(){window.location.href='/'});
    });
  }
  var el=document.getElementById('account-history-list');
  var raw=document.getElementById('account-history-data');
  if(el&&raw&&window.TrueRankHistory){
    try{
      var items=JSON.parse(raw.textContent||'[]');
      TrueRankHistory.render(el,{items:items,emptyMessage:'No searches yet. Run a research query from the home page and it will show up here.'});
    }catch(e){}
  }
})();
</script>`;

export async function renderAccountPage(request, env) {
    const user = await getSessionUser(request, env);
    if (!user) {
        return Response.redirect(new URL('/login', request.url).toString(), 302);
    }
    const searches = await getUserSearches(env.DB, user.id, 50);
    const historyJson = JSON.stringify(
        searches
            .filter((s) => s.slug)
            .map((s) => ({
                slug: s.slug,
                query: displayQuery(s.query),
                ts: s.created_at * 1000,
            })),
    ).replace(/</g, '\\u003c');

    const body = `<div class="container mx-auto max-w-5xl px-6 py-16">
<div class="flex flex-wrap items-start justify-between gap-4">
<div>
<h1 class="font-serif text-h1 font-semibold text-ink">Your research</h1>
<p class="mt-2 text-body text-ink-2">Signed in as <strong class="text-ink">${escapeHtml(user.email)}</strong></p>
</div>
<button id="logout-btn" type="button" class="rounded-lg border border-line bg-surface-1 px-4 py-2 text-body-sm font-semibold text-ink transition-colors hover:bg-surface-2">Sign out</button>
</div>
<script type="application/json" id="account-history-data">${historyJson}</script>
<div id="account-history-list" class="mt-8" aria-live="polite"></div>
</div>`;
    return layout('Your research', 'Your past TrueRank searches.', body, '<meta name="robots" content="noindex, follow">' + ACCOUNT_PAGE_SCRIPT, { canonical: 'https://chrisputer.tech/account' });
}
