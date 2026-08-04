// JSON-LD structured data + Open Graph/Twitter layout metadata for the
// research report page. Split out of research-page.js verbatim; wrapped in
// explicit-parameter functions (no closure over the caller's locals) so the
// same inputs always produce the same output.

import { jsonLdScript } from '../lib/html.js';
import { buildAffiliateUrl, retailerLabel } from '../lib/affiliate-links.js';

// Per-product Product/Offer/Review nodes for the ItemList below. Only emits an
// Offer if we have a real retailer URL for this specific SKU — Google's
// Product guidelines want offers.url to be the actual buy page; search-results
// URLs are explicitly discouraged and can hurt rankings.
function buildProductNodes(products, affiliateIds, priceValidUntil, isoDate) {
  return products.map((p) => {
    const item = {
      '@type': 'Product',
      name: p.name,
    };
    if (p.brand) item.brand = { '@type': 'Brand', name: p.brand };
    // p.pros is already parsed to an array (parsed once after the products
    // fetch). The column is best_for, not bestFor.
    const prosArr = p.pros;
    const descSource = p.verdict || p.best_for || (prosArr.length > 0 ? prosArr.slice(0, 3).join('. ') : '');
    if (descSource) item.description = descSource;
    const offerRaw = p.affiliate_url || p.product_url || '';
    const offerAffiliate = offerRaw ? buildAffiliateUrl(offerRaw, affiliateIds) : '';
    if (p.price != null && offerAffiliate) {
      // We don't run transactions or know real-time stock, so we omit
      // `availability`. `seller` mirrors the retailer we link out to.
      let sellerHost = '';
      try { sellerHost = new URL(offerAffiliate).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
      const offer = {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'USD',
        priceValidUntil,
        url: offerAffiliate,
        ...(sellerHost ? { seller: { '@type': 'Organization', name: retailerLabel(offerAffiliate) } } : {}),
      };
      item.offers = offer;
    }
    if (p.verdict) {
      const review = {
        '@type': 'Review',
        reviewBody: p.verdict,
        datePublished: isoDate,
        author: { '@type': 'Organization', name: 'Frank', url: 'https://chrisputer.tech' },
      };
      if (p.rating != null) review.reviewRating = { '@type': 'Rating', ratingValue: p.rating, bestRating: 5, worstRating: 0 };
      item.review = review;
    }
    return item;
  });
}

// Social platforms (FB/X/LinkedIn/Slack/Discord/iMessage/WhatsApp) and Google
// rich-result image guidelines do NOT support SVG — an SVG og:image renders a
// blank share card. Use the static PNG until a vendored raster generator
// (resvg/satori wasm) can produce per-page PNGs at /research/:slug/og.png.
function buildArticleJsonLd(entry, pageUrl, displayTitle, isoDate, isoModified, keywordTerms) {
  const articleImage = 'https://chrisputer.tech/og.png';
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${pageUrl}#article`,
    url: pageUrl,
    isPartOf: { '@id': 'https://chrisputer.tech/#website' },
    headline: displayTitle,
    description: entry.summary ?? '',
    image: [articleImage],
    inLanguage: 'en-US',
    datePublished: isoDate,
    dateModified: isoModified,
    ...(entry.category ? { articleSection: entry.category } : {}),
    ...(keywordTerms.length > 0 ? { keywords: keywordTerms.join(', ') } : {}),
    author: {
      '@id': 'https://chrisputer.tech/#organization',
      '@type': 'Organization',
      name: 'Frank',
      url: 'https://chrisputer.tech',
    },
    publisher: {
      '@id': 'https://chrisputer.tech/#organization',
      '@type': 'Organization',
      name: 'Frank',
      url: 'https://chrisputer.tech',
      logo: { '@type': 'ImageObject', url: 'https://chrisputer.tech/og.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };
}

// Separate top-level ItemList is what Google Rich Results actually parses for
// "list of products" display. Nesting Products inside Article.about is valid
// schema.org but rarely triggers list rich snippets.
function buildItemListJsonLd(productNodes, displayTitle) {
  return productNodes.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: displayTitle,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: productNodes.length,
    itemListElement: productNodes.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: p,
    })),
  } : null;
}

function buildBreadcrumbJsonLd(displayTitle, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chrisputer.tech/' },
      { '@type': 'ListItem', position: 2, name: 'Research', item: 'https://chrisputer.tech/research' },
      { '@type': 'ListItem', position: 3, name: displayTitle, item: pageUrl },
    ],
  };
}

// FAQPage — assembled from data already rendered on the page (buyer's guide +
// top pick). Plain-text answers only. Note: Google deprecated FAQ rich-result
// *display* for non-gov/health sites (2023), but the markup is still valid
// structured data used for entity understanding and AI-answer grounding.
function buildFaqJsonLd(hasBuyersGuide, buyersGuide, products, isService, displayTitle, pageUrl) {
  const faqSubject = displayTitle.replace(/^best\s+/i, '').trim() || displayTitle;
  const faqEntities = [];
  if (hasBuyersGuide && buyersGuide) {
    if (buyersGuide.howToChoose) {
      faqEntities.push({ q: `What should I consider when choosing ${faqSubject}?`, a: buyersGuide.howToChoose });
    }
    if ((buyersGuide.pitfalls?.length ?? 0) > 0) {
      faqEntities.push({ q: `What common mistakes should I avoid with ${faqSubject}?`, a: buyersGuide.pitfalls.join(' ') });
    }
    if ((buyersGuide.marketingToIgnore?.length ?? 0) > 0) {
      faqEntities.push({ q: `What marketing claims about ${faqSubject} should I ignore?`, a: buyersGuide.marketingToIgnore.join(' ') });
    }
  }
  if (products.length > 0 && products[0].name) {
    const top = products[0];
    const topAnswer = top.verdict ? `${top.name} — ${top.verdict}` : top.name;
    faqEntities.push({ q: `What's the top ${isService ? 'recommendation' : 'pick'} for ${faqSubject}?`, a: topAnswer });
  }
  return faqEntities.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faqEntities.map((e) => ({
      '@type': 'Question',
      name: e.q,
      acceptedAnswer: { '@type': 'Answer', text: e.a },
    })),
  } : null;
}

function buildLayoutMeta(pageUrl, isoDate, isoModified, entry, keywordTerms) {
  return {
    ogUrl: pageUrl,
    ogType: 'article',
    // PNG, not the per-page og.svg — SVG share cards render blank everywhere.
    ogImage: 'https://chrisputer.tech/og.png',
    twitterCard: 'summary_large_image',
    // Always canonical to the clean URL so ?src=... variants don't fragment SEO.
    canonical: pageUrl,
    article: {
      publishedTime: isoDate,
      modifiedTime: isoModified,
      author: 'Frank',
      ...(entry.category ? { section: entry.category } : {}),
      ...(keywordTerms.length > 0 ? { tags: keywordTerms } : {}),
    },
  };
}

// Builds the page's JSON-LD script tags + Open Graph/Twitter layout metadata
// in one place from explicit inputs only (no closure over the caller's
// locals), so the same research row always produces the same structured data.
export function buildResearchSeo({
  entry, products, affiliateIds, pageUrl, displayTitle, lastModifiedTs, hasBuyersGuide, buyersGuide, isService,
}) {
  const isoDate = new Date(entry.created_at * 1000).toISOString();
  // priceValidUntil: 30 days from page's last completion (Google Product rich-snippet requirement)
  const priceValidUntil = new Date((lastModifiedTs + 30 * 86400) * 1000).toISOString().split('T')[0];
  const productNodes = buildProductNodes(products, affiliateIds, priceValidUntil, isoDate);
  const isoModified = new Date(lastModifiedTs * 1000).toISOString();
  const keywordTerms = entry.query.split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|best|top|good|great)$/i.test(w)).slice(0, 8);

  const article = buildArticleJsonLd(entry, pageUrl, displayTitle, isoDate, isoModified, keywordTerms);
  const itemList = buildItemListJsonLd(productNodes, displayTitle);
  const breadcrumb = buildBreadcrumbJsonLd(displayTitle, pageUrl);
  const faq = buildFaqJsonLd(hasBuyersGuide, buyersGuide, products, isService, displayTitle, pageUrl);

  const structuredData = entry.status === 'complete'
    ? jsonLdScript(article) +
      (itemList ? jsonLdScript(itemList) : '') +
      (faq ? jsonLdScript(faq) : '') +
      jsonLdScript(breadcrumb)
    : '';
  const layoutMeta = buildLayoutMeta(pageUrl, isoDate, isoModified, entry, keywordTerms);
  return { structuredData, layoutMeta };
}
