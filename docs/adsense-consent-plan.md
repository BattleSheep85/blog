# Plan: EU consent / CMP for AdSense (review-board HIGH #2)

**Status:** PLAN ONLY — not implemented. Awaiting go-ahead.
**Why it matters:** AdSense currently loads unconditionally with no consent
gating. Google's EU user-consent policy (in force since Jan 2024) requires a
**Google-certified CMP integrated with IAB TCF v2.2** for EEA/UK/Switzerland
visitors. Running personalized ads without one is a live GDPR/ePrivacy exposure
**and can block AdSense approval** — which is our current gating item (site is
"Getting ready," review requested 2026-07-07).

## Recommended approach: Google's built-in GDPR message (free, certified)

Google's own **Privacy & messaging → GDPR message** (formerly Funding Choices)
is a certified CMP, free, region-auto-targeted (only shows to EEA/UK/CH users),
and needs essentially no custom UI. Best fit for a zero-dependency edge site.

### Step 1 — Dashboard (needs your login; ~5 min, do when back at desktop)
1. AdSense → **Privacy & messaging** → **GDPR**.
2. Create message → pick the site `chrisputer.tech` → choose "Consent" style,
   add your Privacy Policy URL (`/privacy`), publish.
3. (AdSense will also nudge you to create a **CCPA/US states** message — optional
   but recommended; same flow.)
4. Confirm **"Consent management" → EEA + UK** targeting is ON.

Google then serves the consent banner automatically through the ad stack for
EEA/UK/CH IPs. No per-page code for the banner itself.

### Step 2 — Code (small, ~1 file): allow the CMP under our CSP ✅ DONE 2026-07-08
Shipped in worker/index.js CSP: `https://fundingchoicesmessages.google.com` added
to `script-src`, `connect-src`, and `frame-src`. Below is what/why (for reference):
Our CSP (worker/index.js:707-746) is strict (nonce + `strict-dynamic`). The
Funding Choices / consent flow loads from extra Google origins that must be
allowlisted or the banner is silently CSP-blocked:
- `script-src`: add `https://fundingchoicesmessages.google.com`
- `connect-src`: add `https://fundingchoicesmessages.google.com`
- `frame-src` (add if not present): `https://fundingchoicesmessages.google.com https://*.googlesyndication.com` (the consent dialog renders in an iframe)

Note: `strict-dynamic` lets scripts *loaded by* the nonce'd AdSense tag execute,
which usually covers the FC script — but the iframe (`frame-src`) and any direct
`connect`/`script` origin still need explicit entries. Verify with the console
open (CSP violations log there).

### Step 3 — (Optional) Consent Mode v2 defaults
For cleaner signal + to keep Google Ads/Analytics measurement compliant, set
`gtag('consent','default', { ad_storage:'denied', ad_user_data:'denied',
ad_personalization:'denied', analytics_storage:'denied', region:['EEA','GB'] })`
before the AdSense tag, and let the CMP update it on choice. Nice-to-have, not
required for the legal minimum once the certified message is live.

## Verification
- Load the site through an **EEA VPN** (or Chrome devtools sensors) → the consent
  banner must appear; US traffic must **not** see it.
- With devtools console open, confirm **no CSP violations** from
  `fundingchoicesmessages.google.com`.
- Before consent: ads should be non-personalized / limited; after "Consent":
  normal serving.

## Effort / risk
- Dashboard: ~5 min, no code, reversible.
- CSP edit: ~5 lines in one file, low risk (additive allowlist), covered by a
  quick live console check. No new runtime dependency.
