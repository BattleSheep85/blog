/**
 * GDPR / ePrivacy consent verification and first-party banner rendering.
 * Zero external dependencies, fail-closed to privacy protection.
 */

// 27 EU member states + 3 non-EU EEA states (IS, LI, NO) + UK (GB) + Switzerland (CH)
export const CONSENT_COUNTRIES = new Set([
  // EU 27
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  // EEA (non-EU)
  'IS', 'LI', 'NO',
  // UK & Switzerland
  'GB', 'CH',
]);

/**
 * Returns true when the visitor is in the EEA, the UK, or Switzerland.
 * Defaults to true (fail closed) when request.cf or country is missing.
 */
export function requiresConsent(request) {
  if (!request?.cf?.country) {
    return true; // Fail closed to privacy-protective branch
  }
  const country = String(request.cf.country).toUpperCase().trim();
  return CONSENT_COUNTRIES.has(country);
}

/**
 * Returns true when the visitor has explicitly accepted ads (ads_consent=1 cookie).
 */
export function hasAdsConsent(request) {
  if (!request?.headers) return false;
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie) return false;
  const m = cookie.match(/(?:^|;\s*)ads_consent=([^;]*)/);
  return m ? m[1].trim() === '1' : false;
}

/**
 * Returns true when the visitor has made any consent decision (ads_consent cookie exists).
 */
export function hasConsentCookie(request) {
  if (!request?.headers) return false;
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie) return false;
  return /(?:^|;\s*)ads_consent=/.test(cookie);
}

/**
 * Renders an accessible, zero-dependency first-party cookie consent banner.
 */
export function renderConsentBanner(nonce) {
  return `<aside id="consent-banner" role="region" aria-label="Cookie consent" style="position:fixed;bottom:0;left:0;right:0;background:#18181b;color:#f4f4f5;padding:1rem;box-shadow:0 -2px 10px rgba(0,0,0,0.2);z-index:9999;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;font-family:sans-serif;font-size:0.875rem">
  <p style="margin:0;flex:1 1 300px;line-height:1.4">We use cookies to serve ads that support this site. Do you accept ads?</p>
  <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
    <button type="button" id="consent-decline" style="background:transparent;color:#f4f4f5;border:1px solid #71717a;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;font-size:0.875rem">Decline</button>
    <button type="button" id="consent-accept" style="background:#2563eb;color:#fff;border:none;padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;font-weight:600;font-size:0.875rem">Accept ads</button>
  </div>
</aside>
<script nonce="${nonce}">
document.getElementById('consent-accept')?.addEventListener('click',function(){document.cookie='ads_consent=1; Path=/; Max-Age=15552000; SameSite=Lax; Secure';location.reload();});
document.getElementById('consent-decline')?.addEventListener('click',function(){document.cookie='ads_consent=0; Path=/; Max-Age=15552000; SameSite=Lax; Secure';location.reload();});
</script>`;
}
