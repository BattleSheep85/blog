// Full-coverage assertions for affiliate-links.js (pure URL tagging).
import { buildAffiliateUrl, buildAmazonSearchFallback, retailerLabel } from '../../worker/lib/affiliate-links.js';

export function runAffiliateLinksTests() {
  const report = { passed: 0, failed: 0, failures: [] };
  const eq = (name, a, e) => {
    const A = JSON.stringify(a), E = JSON.stringify(e);
    if (A === E) report.passed++; else { report.failed++; report.failures.push(`${name}: expected ${E}, got ${A}`); }
  };
  const ok = (name, c) => eq(name, !!c, true);

  const IDS = { amazonTag: 'mytag-20', walmartImpact: 'W1', targetImpact: 'T1', bestbuyImpact: 'BB1', neweggImpact: 'NE1', bhphoto: 'BH1' };

  // buildAffiliateUrl — rejections
  eq('empty url → ""', buildAffiliateUrl('', IDS), '');
  eq('http url → ""', buildAffiliateUrl('http://amazon.com/dp/B0', IDS), '');
  eq('amazon search /s → ""', buildAffiliateUrl('https://amazon.com/s?k=nas', IDS), '');
  eq('amazon /b → ""', buildAffiliateUrl('https://amazon.com/b?node=1', IDS), '');
  eq('amzn.to → ""', buildAffiliateUrl('https://amzn.to/abc', IDS), '');
  eq('a.co → ""', buildAffiliateUrl('https://a.co/abc', IDS), '');
  eq('walmart search → ""', buildAffiliateUrl('https://walmart.com/search?q=x', IDS), '');
  eq('target search → ""', buildAffiliateUrl('https://target.com/s/x', IDS), '');
  eq('bestbuy search → ""', buildAffiliateUrl('https://bestbuy.com/site/searchpage.jsp?st=x', IDS), '');
  eq('unknown host → ""', buildAffiliateUrl('https://randomblog.com/p', IDS), '');

  // buildAffiliateUrl — tagging
  ok('amazon /dp tagged', buildAffiliateUrl('https://www.amazon.com/dp/B000', IDS).includes('tag=mytag-20'));
  eq('amazon empty tag strips tag', buildAffiliateUrl('https://amazon.com/dp/B0?tag=old-20', { amazonTag: '' }), 'https://amazon.com/dp/B0');
  ok('walmart impact wraps', buildAffiliateUrl('https://walmart.com/ip/123', IDS).startsWith('https://goto.walmart.com/c/W1/'));
  ok('target impact wraps', buildAffiliateUrl('https://target.com/p/123', IDS).startsWith('https://goto.target.com/c/T1/'));
  ok('bestbuy impact wraps', buildAffiliateUrl('https://bestbuy.com/site/abc.p', IDS).startsWith('https://bestbuy.7tiv.net/c/BB1/'));
  ok('newegg impact wraps', buildAffiliateUrl('https://newegg.com/p/123', IDS).startsWith('https://goto.newegg.com/c/NE1/'));
  ok('bhphoto BI param', buildAffiliateUrl('https://bhphotovideo.com/c/product/123', IDS).includes('BI=BH1'));
  // Known buy host with NO affiliate id configured → returned as-is.
  eq('known host no affiliate id → raw', buildAffiliateUrl('https://costco.com/p.html', { amazonTag: 't-20' }), 'https://costco.com/p.html');
  eq('newegg no impact id → raw', buildAffiliateUrl('https://newegg.com/p/1', { amazonTag: 't-20' }), 'https://newegg.com/p/1');
  // Strict host match: subdomain attack must NOT be treated as amazon.
  eq('amazon.com.evil rejected', buildAffiliateUrl('https://amazon.com.evil.example/dp/B0', IDS), '');

  // buildAmazonSearchFallback
  eq('fallback short name → ""', buildAmazonSearchFallback('ab', '', 'tag-20'), '');
  eq('fallback no tag → ""', buildAmazonSearchFallback('Sony WH-1000XM5', 'Sony', ''), '');
  ok('fallback tagged search', buildAmazonSearchFallback('WH-1000XM5', 'Sony', 'tag-20').includes('/s?k=Sony%20WH-1000XM5&tag=tag-20'));
  ok('fallback dedups brand prefix', !buildAmazonSearchFallback('Sony WH-1000XM5', 'Sony', 'tag-20').includes('Sony%20Sony'));

  // retailerLabel
  eq('label amazon', retailerLabel('https://www.amazon.com/dp/B0'), 'Amazon');
  eq('label walmart', retailerLabel('https://goto.walmart.com/c/W1/s/1'), 'Walmart');
  eq('label bestbuy', retailerLabel('https://bestbuy.7tiv.net/c/x'), 'Best Buy');
  eq('label newegg', retailerLabel('https://newegg.com/p'), 'Newegg');
  eq('label target', retailerLabel('https://target.com/p'), 'Target');
  eq('label bhphoto', retailerLabel('https://bhphotovideo.com/c/x'), 'B&H Photo');
  eq('label unknown capitalizes', retailerLabel('https://costco.com/p'), 'Costco');
  eq('label invalid → Retailer', retailerLabel('not a url'), 'Retailer');

  return report;
}
