// Vendored gazetteers (DATA). A generic list of REAL consumer/tech/software brands
// (helps candidate precision — and note that fabricated "trap" brands are, by
// definition, NOT real brands, so this legitimately favors real products) + a
// publisher/source stoplist + generic non-product Title-Case stopwords. Phase-0
// proof subset; expand from logged data later. No dependencies.

export const BRANDS = new Set([
  // electronics / peripherals
  'sony', 'samsung', 'apple', 'bose', 'sennheiser', 'soundcore', 'anker', 'jbl', 'beats',
  'keychron', 'nuphy', 'logitech', 'razer', 'corsair', 'ducky', 'leopold', 'hhkb', 'akko',
  'dell', 'lg', 'asus', 'acer', 'hp', 'lenovo', 'msi', 'gigabyte', 'benq', 'viewsonic',
  'crucial', 'sandisk', 'samsung', 'western digital', 'wd', 'seagate', 'kingston', 'teamgroup',
  'nvidia', 'amd', 'intel', 'roborock', 'eufy', 'irobot', 'roomba', 'shark', 'dyson', 'tineco',
  'garmin', 'fitbit', 'whoop', 'polar', 'suunto',
  // home / furniture
  'steelcase', 'herman miller', 'hon', 'ikea', 'autonomous', 'uplift', 'flexispot', 'secretlab',
  'lodge', 'instant pot', 'ninja', 'cosori', 'breville', 'cuisinart', 'kitchenaid', 'vitamix',
  // photo
  'canon', 'nikon', 'fujifilm', 'panasonic', 'gopro', 'dji',
  // software / saas
  'mailchimp', 'convertkit', 'kit', 'brevo', 'mailerlite', 'sendinblue', 'hubspot', 'klaviyo',
  'notion', 'airtable', 'slack', 'zoom', 'figma', 'canva',
  // royal kludge etc (two-word brands matched separately)
  'royal kludge', 'tp-link', 'ugreen', 'synology', 'qnap',
]);

// Source/publisher names — never a product candidate.
export const PUBLISHERS = new Set([
  'rtings', 'wirecutter', 'tom', "tom's hardware", 'toms hardware', 'ars technica', 'the verge',
  'engadget', 'cnet', 'pcmag', 'pc gamer', 'soundguys', 'storagereview', 'gamers nexus',
  'hardware unboxed', 'reddit', 'hacker news', 'hackernews', 'youtube', 'amazon', 'google',
  'best buy', 'walmart', 'target', 'newegg', 'tripadvisor', 'yelp', 'emailtooltester',
  'ergonomicstrends', 'dealsblog', 'techdeals', 'saasdeals', 'topbestlists', 'topchairs',
  'official store', 'official',
]);

// Generic Title-Case words that start/are noise, not products.
export const STOPWORDS = new Set([
  'the', 'best', 'top', 'a', 'an', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'under', 'vs',
  'our', 'we', 'i', 'buy', 'review', 'reviews', 'guide', 'guides', 'tested', 'testing', 'lab',
  'budget', 'value', 'pick', 'picks', 'sponsored', 'affiliate',
  'official', 'store', 'new', 'use', 'every', 'this', 'that', 'it', 'they', 'their',
]);
// NOTE: 'pro'/'max'/'ultra'/'elite'/'plus' are deliberately NOT stopwords — they are
// legitimate model-name suffixes (Shark AI Ultra, eufy X8 Pro). The brand-or-code
// keep-rule filters fluff instead.
