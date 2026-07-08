// Deterministic content-safety screen. FAIL-CLOSED: clear adult/illegal queries are blocked
// here BEFORE any research happens, independent of (and ahead of) the LLM classifier — which
// is fail-open and jailbreakable. This protects brand safety (AdSense + Amazon Associates
// ToS), SEO/reputation, and legal exposure. The LLM classifier remains a second layer for
// subtler/obfuscated cases.
//
// CURATION RULE: prefer PHRASES and \b word-boundaries over bare substrings, so legitimate
// product research is never blocked. Bare anatomy/ambiguous words (nude, breast, gun, drug,
// weed, acid, crack, anal, escort, meth-as-substring) are DELIBERATELY not matched alone —
// only in unambiguous sexual/illegal phrasing. The allow-list test set guards this.

const ADULT_PATTERNS = [
  /\bporn\b/, /\bporno\b/, /pornhub|xvideos|xhamster|xnxx|youporn|redtube|brazzers/, /\bhentai\b/, /\brule\s?34\b/,
  /\bnsfw\b/, /\bxxx\b/,
  /\bsex\s?(?:toys?|dolls?|cams?|chat|shop|tape|video|videos|work|worker|workers)\b/, /\bsexting\b/,
  /\b(?:dildos?|fleshlight|buttplug|butt\s?plug|vibrators?\s+for\s+(?:women|men|adults))\b/,
  /\b(?:blowjob|handjob|cumshot|creampie|gangbang|bukkake|deepthroat|fellatio|cunnilingus)\b/,
  /\banal\s+(?:sex|porn)\b/, /\boral\s+sex\b/, /\bmasturbat/, /\bfetish\b/, /\bbdsm\b/, /\bmilf\b/,
  /\bescort\s+(?:service|services|agency|girl|girls)\b/, /\bescorts?\s+near\b/, /\bhire\s+an?\s+escort\b/,
  /\b(?:prostitut|brothel|hooker|callgirl|call\s?girl|camgirl|cam\s?girl)\b/,
  /\b(?:rub\s?and\s?tug|happy\s+ending\s+massage)\b/,
  /\b(?:onlyfans|strip\s?club|stripper|strippers|live\s+sex|webcam\s+girl)\b/,
  // NB: bare "nude"/"nudes" is NOT matched — it's a beauty/fashion color ("nude lipstick",
  // "nude heels"). Only explicit phrasing.
  /\b(?:naked\s+(?:women|men|girls|guys|pics|photos)|leaked\s+nudes?|send\s+nudes?)\b/, /\bnude\s+(?:photos?|pics|videos?)\b/,
  /\b(?:adult|porn|xxx)\s+(?:video|videos|film|films|movie|movies|site|sites|website|content|cam|cams)\b/,
];

const ILLEGAL_PATTERNS = [
  // CSAM / exploitation — highest priority, broad block of the explicit signal.
  /\bchild\s+(?:porn|sex|sexual|abuse\s+material)\b/, /\bunderage\s+(?:porn|sex|girls?|boys?|nudes?)\b/,
  /\b(?:csam|cp\s+porn|pedophil|loli(?:con)?\b)/, /\bchild\s+exploitation\b/,
  // hard drugs — buying / making / specific substances.
  /\b(?:buy|order|where\s+to\s+(?:buy|get)|how\s+to\s+make|how\s+to\s+(?:get|cook))\s+(?:cocaine|heroin|meth|methamphetamine|fentanyl|mdma|ecstasy|lsd|crack\s+cocaine|crystal\s+meth|ketamine|illegal\s+drugs?)\b/,
  /\b(?:cocaine|heroin|fentanyl|methamphetamine|crystal\s+meth)\b/, /\bcrack\s+cocaine\b/,
  /\bhow\s+to\s+make\s+(?:meth|drugs?|crack|crystal\s+meth)\b/, /\bbuy\s+drugs?\s+online\b/, /\bdark\s?web\s+drugs?\b/,
  // weapons — making / illegal acquisition (NOT legal firearm products).
  /\bhow\s+to\s+make\s+(?:a\s+)?(?:bomb|gun|silencer|suppressor|explosive|grenade|napalm|thermite|c4)\b/,
  /\b(?:pipe\s?bomb|ghost\s?gun|untraceable\s+gun|3d\s?printed?\s+gun|homemade\s+(?:gun|bomb|explosive))\b/,
  /\bbuy\s+(?:a\s+)?(?:gun|firearm|rifle|pistol)\s+(?:illegally|without\s+(?:a\s+)?(?:background|license|permit))\b/,
  /\b(?:buy|get)\s+(?:a\s+)?(?:machine\s?gun|automatic\s+weapon|grenade|explosives?|c4|dynamite)\b/,
  // hacking / fraud / theft.
  /\bhow\s+to\s+hack\b/, /\bhack\s+(?:someone|a\s+phone|an?\s+account|instagram|facebook|snapchat|wifi\s+password|into)\b/,
  /\b(?:steal|stolen)\s+(?:credit\s+card|credit\s+cards|cards?\s+number|identity|passwords?)\b/, /\bcredit\s+card\s+numbers\b/,
  /\b(?:carding|carder)\b/, /\b(?:fake|forged|novelty)\s+(?:id|ids|passport|passports|drivers?\s+licen[cs]e)\b/,
  /\bcounterfeit\s+(?:money|cash|currency|bills?)\b/, /\bhow\s+to\s+(?:make\s+)?counterfeit\b/,
  /\b(?:buy|sell)\s+stolen\s+(?:goods|credit|cards|data)\b/, /\b(?:phishing\s+kit|ransomware|keylogger|ddos\s+for\s+hire|stresser\s+service|booter\s+service)\b/,
  // piracy / counterfeit goods.
  /\b(?:pirated|cracked|nulled|warez)\s+(?:software|games?|movies?|apps?)\b/, /\b(?:keygen|crack\s+download|serial\s+keys?\s+for)\b/,
  /\b(?:replica|fake|counterfeit|knockoff)\s+(?:rolex|gucci|louis\s+vuitton|designer|watches|handbags?|sneakers)\b/,
  // trafficking.
  /\bhuman\s+trafficking\b/, /\bbuy\s+a\s+(?:human|kidney|organ)\b/,
];

function normalize(query) {
  return ' ' + String(query || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

/**
 * Screen a query. Returns { blocked, reason } where reason is 'adult' | 'illegal' | null.
 * Deterministic, fail-closed, no network. Run this BEFORE the LLM classifier and research.
 */
export function screenQuery(query) {
  const q = normalize(query);
  if (q.trim().length === 0) return { blocked: false, reason: null };
  for (const re of ADULT_PATTERNS) if (re.test(q)) return { blocked: true, reason: 'adult' };
  for (const re of ILLEGAL_PATTERNS) if (re.test(q)) return { blocked: true, reason: 'illegal' };
  // NOTE: deterministic query prompt-injection screening was removed 2026-07-08
  // — it false-positived on legitimate product searches and made the site
  // unusable. Real jailbreak/injection queries are still caught by the LLM
  // classifier's reject path (fail-open), and fetched page CONTENT is still
  // guarded by the [ai-injection] credibility detector. Do not re-add a
  // deterministic QUERY screen without a large real-query false-positive corpus.
  return { blocked: false, reason: null };
}

/** User-facing rejection message for a blocked query (no detail that aids circumvention). */
export function rejectionMessage(reason) {
  if (reason === 'adult') return "We don't research adult or sexually explicit content. Try a different product or topic.";
  if (reason === 'illegal') return "We can't research illegal products or activities. Try a different product or topic.";
  return "We can't research that query. Try a different product or topic.";
}

// LLM classifier reject_reason → our coarse safety reason (for enforcing the second layer).
export function classifierRejectToReason(rejectReason) {
  if (rejectReason === 'adult') return 'adult';
  if (rejectReason === 'illegal' || rejectReason === 'self-harm' || rejectReason === 'harassment') return 'illegal';
  return 'policy';
}
