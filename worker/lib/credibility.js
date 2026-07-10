// Scores a source's trustworthiness based on what KIND of content it is, not
// whether it says nice things. The synthesis LLM gets the tags + score so it
// can weight hands-on testing over listicle opinion and discount reviews
// tainted by affiliate conflict of interest.
//
// Pure functions, no network.

// CredibilityTag is one of:
//   'hands-on'            — tested the thing themselves (measured, benchmarked, used)
//   'listicle'            — thin "top 10 of 2026" SEO content
//   'affiliate-conflict'  — page links out via affiliate tracking — paid to recommend
//   'expert-domain'       — established review outlet (Wirecutter, RTINGS, etc.)
//   'community'           — reddit / forums / hacker news — unpaid opinions
//   'manufacturer'        — official product/retailer page — not a review
//   'ai-injection'        — page contains instructions addressed to AI tools — manipulation attempt
//   'sponsored-content'   — paid promotion (#ad, paid partnership) — marketing, not a review
//   'clickbait'           — curiosity-gap / hype framing — SEO bait, not evidence
//
// SourceCredibility = { tags: CredibilityTag[], score: number (0-100), reasons: string[] }

// Genres that can NEVER be the sole basis for a recommendation. Single source
// of truth — imported by the extract engine. `sponsored-content` is marketing
// (like affiliate-conflict): a paid placement can never anchor a recommendation.
export const NONCREDIBLE_GENRES = new Set(['listicle', 'affiliate-conflict', 'manufacturer', 'ai-injection', 'sponsored-content']);

// ─── Affiliate-link detection ────────────────────────────────────────────────

// Domains that exist solely as affiliate redirect hops. Presence of ANY of these
// in outbound links on a page = affiliate income stream = conflict of interest.
const AFFILIATE_HOPS = [
  'amzn.to', 'amzn.com',
  'go.skimresources.com', 'skimresources.com',
  'shareasale.com/r.cfm', 'shareasale.com',
  'anrdoezrs.net', 'jdoqocy.com', 'tkqlhce.com', 'dpbolvw.net', 'kqzyfj.com',
  'pxf.io', 'sjv.io', 'impactradius-event.com',
  'click.linksynergy.com', 'linksynergy.com',
  'awin1.com',
  'goto.walmart.com', 'goto.target.com',
  'bestbuy.7tiv.net',
  'howl.link', 'howl.me',
  'rstyle.me',
  'collectiveias.com',
  'commission-junction.com',
];

// Amazon affiliate tag param pattern — Amazon tags look like `xxxxx-20` or
// `xxxxx-21`. The trailing `-20/-21/-22` is the Amazon regional affiliate code.
const AMAZON_TAG = /[?&]tag=[a-z0-9_-]+-\d{2}\b/i;

// Generic affiliate query params used across networks when they don't route
// through a dedicated hop domain.
const GENERIC_AFFILIATE_PARAMS = [
  /[?&]affid=/i,
  /[?&]affiliate=/i,
  /[?&]partner_id=/i,
  /[?&]campid=\d{10,}/i,           // ebay affiliate campid is 10+ digits
  /[?&]utm_source=affiliate/i,
  /[?&]utm_medium=affiliate/i,
  /[?&]ref=affiliate/i,
  /[?&]irclickid=/i,                // Impact Radius click ID
];

/**
 * Returns true if the given URL carries affiliate tracking. Covers:
 * - Amazon `tag=xxxxx-20`
 * - Dedicated affiliate hop domains (amzn.to, skimresources, CJ, Impact, etc.)
 * - Generic affid/affiliate/campid/irclickid query params
 */
export function isAffiliateUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (AMAZON_TAG.test(url)) return true;
  for (const hop of AFFILIATE_HOPS) {
    if (lower.includes(hop)) return true;
  }
  for (const pat of GENERIC_AFFILIATE_PARAMS) {
    if (pat.test(url)) return true;
  }
  return false;
}

/**
 * Extracts unique Amazon product URLs (amazon.com/dp/<ASIN> or /gp/product/<ASIN>)
 * from page content. Review sites routinely embed these as their "where to buy"
 * links; scanning content for them is the highest-quality source of real
 * ASIN-specific URLs the synth LLM can attach to products.
 *
 * Returns canonical form `https://www.amazon.com/dp/<ASIN>` — strips any
 * tracking params, affiliate tags, and extra path segments so we can re-tag
 * with our own affiliate tag at persistence time.
 *
 * The ASIN is 10 chars: 1 letter (usually B) + 9 alphanumerics, uppercase.
 */
export function extractAmazonProductUrls(content) {
  if (!content) return [];
  // Match both /dp/ASIN and /gp/product/ASIN forms. Accept any amazon.* TLD
  // (amazon.com / .co.uk / .de) and normalize to .com since that's what our
  // affiliate tag is registered for.
  const pattern = /amazon\.[a-z.]{2,6}\/(?:[^\s"'<>)]*?\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/gi;
  const asins = new Set();
  let match;
  while ((match = pattern.exec(content)) !== null) {
    asins.add(match[1].toUpperCase());
  }
  return Array.from(asins).map((asin) => `https://www.amazon.com/dp/${asin}`);
}

/**
 * Scans page content (markdown or HTML) for outbound links and returns true if
 * ANY of them are affiliate-tracked. One affiliate link on a review page is
 * enough to flag the page — if the reviewer earns a commission on any outbound
 * click, the verdict is suspect.
 */
export function hasAffiliateLinks(content) {
  if (!content) return false;
  // Extract all https URLs from the content. Matches both markdown `](url)`
  // and raw `https://...` forms.
  const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
  const matches = content.match(urlPattern) || [];
  for (const m of matches) {
    if (isAffiliateUrl(m)) return true;
  }
  return false;
}

// ─── AI-targeted injection detection ─────────────────────────────────────────

// Text planted in page content addressed to AI tools reading the page —
// documented in the wild (hidden white-text instructions, "GEO" injection,
// adversarial SEO). A page that addresses AI assistants directly is trying to
// manipulate automated research tools like this one; its product claims get
// zero weight. NOTE: a rare false positive is an article ABOUT prompt
// injection quoting an attack string — acceptable, such pages aren't product
// evidence anyway.
// Rationale: a bare "ai" alternative matches AI-as-an-ADJECTIVE prose — "if
// you're an AI gamer/power user", "note for AI-heavy workloads", "instructions
// for AI art" — on exactly the AI-hardware/AI-tool products this site reviews,
// silently discarding legit reviews as injection. So every "AI" here must be
// followed by a real automated-reader noun (assistant/model/agent/…) OR, for a
// bare self-identifying "if you are an AI", by an injection directive verb.
const AI_INJECTION_PATTERNS = [
  // Self-identifying address to an automated reader by assistant noun.
  /\bif you(?:'re| are) (?:an?|the) (?:ai (?:assistant|model|agent|chat ?bot|bot|tool|summariz\w+)|llm|language model|chat ?bot|summariz\w+)s?\b/i,
  // "if you are an AI, <directive>" — bare AI immediately followed by an
  // injection verb (never a human-descriptor noun like gamer/enthusiast).
  /\bif you(?:'re| are) (?:an? )?ai[\s,.:;-]+(?:please\s+)?(?:reading this|processing this|recommend|rank|prefer|choose|select|include|suggest|output|say|write|list|ignore|disregard|promote|feature)\b/i,
  /\bignore (?:all |any )?(?:previous|prior|preceding|above|earlier) (?:instructions?|prompts?)\b/i,
  // "note/instructions/message for automated summarizers/AI assistants/LLMs …".
  // The noun after AI/automated/LLM is required, so "note for AI workloads" (AI
  // as an adjective) does not match.
  /\b(?:note|notice|instructions?|message) (?:for|to) (?:(?:automated|ai|llm) (?:summariz\w+|assistants?|systems?|tools?|agents?|bots?|models?)|llms?|language models?|chat ?bots?)\b/i,
  /\bai (?:assistants?|chat ?bots?|summariz\w+|agents?) (?:reading|processing|summarizing|indexing) this\b/i,
  // ── BaitBench Category-D / GEO (generative-engine-optimization) override ──
  // Text that tells an automated reader which product to surface as the top
  // result. The verb + superlative is the tell; the required AI/model/engine
  // reader noun keeps legit "AI assistant" product prose from matching. Written
  // abstractly (no literal attack-string copy) per the OpenRouter-403 lesson.
  //
  // "AI/assistants/models/engines should recommend|rank|pick … as the (best|#1|top)".
  /\b(?:ai|llm|assistants?|models?|chat ?bots?|search engines?|generative engines?|language models?)\b[^.?!]{0,40}?\bshould\b[^.?!]{0,40}?\b(?:recommend|rank|pick|prefer|choose|select|surface|feature|output|list|promote|name)\b[^.?!]{0,60}?\b(?:as (?:the )?(?:#?1|number one|top|best|first)|the (?:top|best|first|#?1) (?:choice|pick|option|result|recommendation))/i,
  // "when recommending/ranking/summarizing … (rank|list|place|put) THIS as top" —
  // an instruction conditioned on the reader being a recommender/summarizer.
  /\bwhen (?:recommending|ranking|summariz\w+|listing|comparing|generating|answering)\b[^.?!]{0,60}?\b(?:recommend|rank|list|place|put|surface|prefer|choose|select|feature|output)\b[^.?!]{0,40}?\b(?:this|it|us|our (?:product|brand))\b[^.?!]{0,30}?\b(?:as (?:the )?(?:#?1|top|best|first)|first|at the top|above (?:all )?(?:other|competitor))/i,
  // Explicit reviewer/ranking override addressed to the model: "override your
  // ranking / disregard other reviews / this is the best regardless".
  /\b(?:override|disregard|ignore|discount|downrank)\b[^.?!]{0,50}?\b(?:your |any |other |the )?(?:ranking|rankings|scores?|reviews?|verdicts?|recommendations?|comparisons?)\b/i,
];

/**
 * Returns true if content contains instructions addressed to AI tools.
 */
export function hasAiInjection(content) {
  if (!content) return false;
  for (const pat of AI_INJECTION_PATTERNS) {
    if (pat.test(content)) return true;
  }
  return false;
}

// ─── Sponsored / paid-promotion detection ────────────────────────────────────

// HIGH-PRECISION markers of PAID promotion. These are explicit paid-placement
// disclosures (FTC #ad, "paid partnership") — marketing, not a review.
//
// CRITICAL false-positive guard: ethical review-unit disclosure ("we were sent
// a review unit", "brand provided a sample", "review sample") is STANDARD
// practice at legit outlets and is deliberately NOT matched here. Only literal
// paid-promo markers trip this detector.
const SPONSORED_CONTENT_PATTERNS = [
  // FTC hashtags — word-boundary-anchored so "#ad" doesn't match "#addons".
  /(?:^|[\s(])#ad(?![a-z0-9])/i,
  /(?:^|[\s(])#sponsored(?![a-z0-9])/i,
  /(?:^|[\s(])#paid(?![a-z0-9])/i,
  /\bpaid partnership with\b/i,
  /\bin paid partnership\b/i,
  /\bsponsored post\b/i,
  /\bsponsored content\b/i,
  /\bsponsored by\b/i,
  // "this post|article|video|review|content is sponsored"
  /\bthis (?:post|article|video|review|content|page) is sponsored\b/i,
  // "brought to you by <brand>" — classic advertorial header.
  /\bbrought to you by\b/i,
];

/**
 * Returns true if content carries an explicit PAID-promotion marker (#ad,
 * sponsored post, paid partnership). Ethical review-unit disclosure is NOT
 * matched — that is standard practice at legitimate outlets.
 */
export function hasSponsoredContent(content) {
  if (!content) return false;
  for (const pat of SPONSORED_CONTENT_PATTERNS) {
    if (pat.test(content)) return true;
  }
  return false;
}

// ─── Clickbait / curiosity-gap framing detection ─────────────────────────────

// BaitBench Category C: curiosity-gap + manufactured-hype headlines. These
// phrases are unambiguous clickbait. Normal enthusiastic review language ("we
// love", "impressive", "whisper-quiet") is legal puffery and is NOT listed.
const CLICKBAIT_PATTERNS = [
  // "the trick|secret|thing (big brands|manufacturers|they|companies) don't want you to know"
  /\bthe (?:one )?(?:trick|secret|thing|hack|truth|reason)s?\b[^.?!]{0,40}?\b(?:big brands|brands|manufacturers|companies|retailers|they|the industry)\b[^.?!]{0,20}?\bdon['’]?t want you to (?:know|see|find out)\b/i,
  // "what (they|big brands|manufacturers) don't (tell|want) you …"
  /\bwhat\b[^.?!]{0,30}?\b(?:they|big brands|brands|manufacturers|companies)\b[^.?!]{0,15}?\bdon['’]?t (?:tell|want)\b/i,
  /\byou won['’]?t believe\b/i,
  /\bwill (?:shock|blow|stun|amaze)\b/i,
  /\bdoctors hate\b/i,
  /\bone weird trick\b/i,
  /\bthis (?:simple |one )?(?:trick|hack)\b[^.?!]{0,30}?\b(?:shock|will|that)/i,
  /\bwhat they don['’]?t tell you\b/i,
];

/**
 * Returns true if the title or content uses curiosity-gap / manufactured-hype
 * clickbait framing (BaitBench Category C). Legal puffery in normal review
 * prose does not match — these phrases are unambiguous bait.
 */
export function hasClickbaitFraming(title, content) {
  const haystack = ((title || '') + '\n' + (content || ''));
  if (!haystack.trim()) return false;
  for (const pat of CLICKBAIT_PATTERNS) {
    if (pat.test(haystack)) return true;
  }
  return false;
}

// ─── Hands-on vs listicle content detection ──────────────────────────────────

// Phrases that indicate the author actually used/tested the thing. Match is
// substring, case-insensitive, on full content (title + snippet + body).
const HANDS_ON_PHRASES = [
  'i tested', 'we tested', 'after testing', 'our testing', 'our tests',
  'i measured', 'we measured', 'our measurements',
  'hands-on', 'hands on review', 'hands-on review',
  "i've been using", "we've been using", 'been using it for',
  'benchmark', 'benchmarked',
  'lab test', 'lab-tested', 'lab tested',
  'real-world test', 'real world test',
  'long-term review', 'long term review',
  'torture test', 'stress test',
  'road test', 'road-test',
  'teardown', 'tear-down', 'tear down',
  'spent a week', 'spent weeks', 'spent a month', 'spent months',
  'after using it', 'after a week', 'after a month',
  'side-by-side', 'side by side comparison',
  'we unboxed', 'i unboxed',
];

// Regex: "after N weeks/months/years" — elapsed time with the product.
const ELAPSED_USE = /\bafter\s+\d+\s+(weeks?|months?|years?|days?)\b/i;

/**
 * Returns true if content shows hands-on testing signals.
 */
export function isHandsOn(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  for (const phrase of HANDS_ON_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  if (ELAPSED_USE.test(content)) return true;
  return false;
}

// Listicle title patterns: "Top 10 X of 2026", "Best X in 2026", "N Best X".
const LISTICLE_TITLE = [
  /\b(top|best)\s+\d+\s+[a-z][a-z\s-]{2,50}(of|for|in)\s+20\d{2}\b/i,
  /\b\d+\s+(of the\s+)?best\s+[a-z][a-z\s-]{2,50}\b/i,
  /\bbest\s+[a-z][a-z\s-]{2,50}\s+20\d{2}\b/i,
  /\b\d+\s+[a-z][a-z\s-]{2,50}\s+you\s+(can|should|need|must)\b/i,
];

/**
 * Returns true if title/content looks like SEO listicle filler.
 */
export function isListicle(title, content) {
  for (const pat of LISTICLE_TITLE) {
    if (pat.test(title)) return true;
  }
  // Fallback: content is mostly numbered items (8+ on their own lines) and
  // short — the signature of a thin "Top 10" page.
  if (content && content.length < 4000) {
    const numbered = (content.match(/^\s*\d{1,2}[.)]\s+[A-Z]/gm) || []).length;
    if (numbered >= 8) return true;
  }
  return false;
}

// ─── Domain-based priors ─────────────────────────────────────────────────────

// Established review outlets known for hands-on testing + editorial standards.
// Being on this list doesn't automatically make a source trustworthy, but it
// raises the prior enough that a Wirecutter page without explicit "we tested"
// phrasing still gets credit.
const EXPERT_DOMAINS = new Set([
  'wirecutter.com',
  'nytimes.com',  // wirecutter lives here
  'rtings.com',
  'tomshardware.com',
  'anandtech.com',
  'arstechnica.com',
  'pcmag.com',
  'pcworld.com',
  'theverge.com',
  'cnet.com',
  'consumerreports.org',
  'dpreview.com',
  'techradar.com',
  'engadget.com',
  'notebookcheck.net',
  'techcrunch.com',
  'hexus.net',
  'kitguru.net',
  'guru3d.com',
  'dxomark.com',
  'consumerlab.com',
  'whathifi.com',
  'soundguys.com',
]);

const COMMUNITY_DOMAINS = new Set([
  'reddit.com',
  'old.reddit.com',
  'news.ycombinator.com',
  'stackexchange.com',
  'stackoverflow.com',
  'superuser.com',
  'lemmy.world',
  'quora.com',
]);

// Retailers + manufacturers — these are informational listings, NOT reviews.
// Finding pricing/spec info from them is fine; treating them as review sources
// is a trap we want to flag.
const MANUFACTURER_RETAILER_DOMAINS = new Set([
  'amazon.com', 'amazon.co.uk', 'amazon.de',
  'walmart.com', 'target.com', 'bestbuy.com',
  'newegg.com', 'bhphotovideo.com',
  'apple.com', 'samsung.com', 'sony.com', 'lg.com',
  'microsoft.com', 'google.com', 'dell.com', 'hp.com',
  'lenovo.com', 'asus.com', 'acer.com',
]);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isExpertDomain(url) {
  const h = hostOf(url);
  if (!h) return false;
  for (const d of EXPERT_DOMAINS) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}

// Affiliate softening applies only to the apex/www host of an expert domain —
// leased subdomains (coupons.*, deals.*) are a documented parasite-SEO
// pattern and keep the full affiliate penalty.
function isExpertApexHost(url) {
  const h = hostOf(url); // hostOf already strips a leading www., so apex === www.
  if (!h) return false;
  for (const d of EXPERT_DOMAINS) {
    if (h === d) return true;
  }
  return false;
}

export function isCommunityDomain(url) {
  const h = hostOf(url);
  if (!h) return false;
  for (const d of COMMUNITY_DOMAINS) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}

export function isManufacturerDomain(url) {
  const h = hostOf(url);
  if (!h) return false;
  for (const d of MANUFACTURER_RETAILER_DOMAINS) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}

// ─── Composite scoring ───────────────────────────────────────────────────────

// ScoreInput = {
//   url: string,
//   title: string,
//   content: string,
//   extraContent?: string,  // optional extra content to scan for affiliate links
//   sourceType?: string,    // provider label ('web', 'news', 'rss', 'hackernews', etc.)
// }

/**
 * Assigns credibility tags + a 0-100 score to a source. Higher = more trustworthy.
 *
 * Scoring (base 50, clamped [0, 100]):
 *   + 25 hands-on testing detected
 *   + 15 expert review domain
 *   +  5 community discussion (reddit/HN/etc.)
 *   - 30 listicle / thin SEO content
 *   - 45 affiliate-tracked outbound links (conflict of interest)
 *   - 30 sponsored / paid-promotion markers (#ad, paid partnership)
 *   - 20 clickbait curiosity-gap framing
 *   - 15 manufacturer/retailer page (informational, not a review)
 *
 * The sponsored/clickbait penalties are moderate on purpose: a single soft
 * signal must not, on its own, push a genuine expert-domain source (+15, or
 * +40 with hands-on) below the MIN_CREDIBLE_SCORE (45) gate.
 */
export function scoreSource(input) {
  const tags = [];
  const reasons = [];
  let score = 50;

  const fullContent = (input.content || '') + '\n' + (input.extraContent || '');

  if (hasAiInjection(fullContent)) {
    tags.push('ai-injection');
    reasons.push('contains instructions addressed to AI tools — manipulation attempt');
    score -= 60;
  }

  if (hasAffiliateLinks(fullContent) || isAffiliateUrl(input.url)) {
    tags.push('affiliate-conflict');
    if (isExpertApexHost(input.url)) {
      // Established editorial outlets (Wirecutter, PCMag, RTINGS…) are all
      // affiliate-monetized with disclosed links + editorial standards — a
      // different animal from parasite-SEO affiliate grids. Soft penalty so
      // they stay above the score-45 credibility gates.
      reasons.push('affiliate links on an established editorial outlet (disclosed monetization)');
      score -= 15;
    } else {
      reasons.push('contains affiliate-tracked outbound links');
      score -= 45;
    }
  }

  if (hasSponsoredContent(fullContent)) {
    tags.push('sponsored-content');
    reasons.push('paid-promotion marker (#ad / sponsored / paid partnership)');
    score -= 30;
  }

  if (hasClickbaitFraming(input.title, fullContent)) {
    tags.push('clickbait');
    reasons.push('clickbait curiosity-gap / manufactured-hype framing');
    score -= 20;
  }

  if (isHandsOn(fullContent)) {
    tags.push('hands-on');
    reasons.push('hands-on testing language detected');
    score += 25;
  }

  if (isListicle(input.title, input.content || '')) {
    tags.push('listicle');
    reasons.push('top-N listicle title/structure');
    score -= 30;
  }

  if (isExpertDomain(input.url)) {
    tags.push('expert-domain');
    reasons.push('established review outlet');
    score += 15;
  } else if (isCommunityDomain(input.url) || input.sourceType === 'hackernews') {
    tags.push('community');
    reasons.push('community discussion source');
    score += 5;
  } else if (isManufacturerDomain(input.url)) {
    tags.push('manufacturer');
    reasons.push('retailer/manufacturer page — informational only');
    score -= 15;
  }

  // Video provider without hands-on signals still gets a small prior — video
  // reviews are usually demonstrative by format, even when the text we have
  // (title + snippet + possibly description) doesn't hit the phrase list.
  if (input.sourceType === 'video' && !tags.includes('hands-on') && !tags.includes('affiliate-conflict')) {
    score += 5;
    reasons.push('video provider (weak hands-on prior)');
  }

  score = Math.max(0, Math.min(100, score));
  return { tags, score, reasons };
}

/**
 * Formats tags + score into a compact bracket string for the synthesis prompt.
 * Example: "[hands-on][expert-domain][score=90]" or "[affiliate-conflict][listicle][score=0]"
 */
export function formatCredibilityBadge(cred) {
  const parts = cred.tags.map((t) => `[${t}]`);
  parts.push(`[score=${cred.score}]`);
  return parts.join('');
}
