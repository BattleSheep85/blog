// Coverage for the post-synthesis resolvers (Serper-backed, fetch mocked):
// asin-resolver (direct /dp link recovery) + image-resolver (product photos).
// Both must NEVER throw and pass unresolved products through unchanged.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAsins } from '../../worker/lib/asin-resolver.js';
import { resolveImages, buildImageQuery, pickBestImage } from '../../worker/lib/image-resolver.js';

const ENV = { SERPER_API_KEY: 'test-key', AMAZON_AFFILIATE_TAG: 'battlesheep0a-20' };
afterEach(() => vi.unstubAllGlobals());

describe('resolveAsins', () => {
  it('no key → products unchanged', async () => {
    const out = await resolveAsins({}, [{ name: 'X', productUrl: '' }]);
    expect(out[0].productUrl).toBe('');
  });

  it('skips products that already have a /dp link', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const out = await resolveAsins(ENV, [{ name: 'X', productUrl: 'https://www.amazon.com/dp/B0EXISTING1' }]);
    expect(spy).not.toHaveBeenCalled();
    expect(out[0].productUrl).toContain('/dp/B0EXISTING1');
  });

  it('recovers a /dp link via Serper when the title matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      organic: [{ link: 'https://www.amazon.com/dp/B0ABCDEFGH', title: 'Synology DS224+ NAS Enclosure' }],
    }), { status: 200 })));
    const out = await resolveAsins(ENV, [{ name: 'Synology DS224', brand: 'Synology', productUrl: '' }]);
    expect(out[0].productUrl).toBe('https://www.amazon.com/dp/B0ABCDEFGH');
    expect(out[0].affiliateUrl).toContain('tag=battlesheep0a-20');
  });

  it('leaves product unchanged when the result title does not match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      organic: [{ link: 'https://www.amazon.com/dp/B0WRONGONE0', title: 'Completely Unrelated Toaster' }],
    }), { status: 200 })));
    const out = await resolveAsins(ENV, [{ name: 'Synology DS224', brand: 'Synology', productUrl: '' }]);
    expect(out[0].productUrl).toBe('');
  });

  it('swallows a Serper error (product unchanged, no throw)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const out = await resolveAsins(ENV, [{ name: 'Some Product Name', productUrl: '' }]);
    expect(out[0].productUrl).toBe('');
  });
});

describe('image-resolver pure helpers', () => {
  it('buildImageQuery dedups brand + rejects short names', () => {
    expect(buildImageQuery({ name: 'ab' })).toBe('');
    expect(buildImageQuery({ name: 'WH-1000XM5', brand: 'Sony' })).toBe('Sony WH-1000XM5 product');
    expect(buildImageQuery({ name: 'Sony WH-1000XM5', brand: 'Sony' })).toBe('Sony WH-1000XM5 product');
  });

  it('pickBestImage filters junk and prefers product CDNs', () => {
    expect(pickBestImage(null)).toBe('');
    expect(pickBestImage([{ imageUrl: 'https://x/tiny.jpg', imageWidth: 50, imageHeight: 50 }])).toBe('');
    expect(pickBestImage([{ imageUrl: 'https://x/banner.jpg', imageWidth: 1200, imageHeight: 100 }])).toBe(''); // extreme aspect
    const best = pickBestImage([
      { imageUrl: 'https://blog.example/photo.jpg', imageWidth: 800, imageHeight: 800 },
      { imageUrl: 'https://m.media-amazon.com/images/p.jpg', imageWidth: 500, imageHeight: 500 },
    ]);
    expect(best).toContain('media-amazon.com'); // preferred host wins
  });

  it('upgrades http → https', () => {
    expect(pickBestImage([{ imageUrl: 'http://x/p.jpg', imageWidth: 400, imageHeight: 400 }])).toBe('https://x/p.jpg');
  });
});

describe('resolveImages', () => {
  it('no key → unchanged', async () => {
    const out = await resolveImages({}, [{ name: 'X' }]);
    expect(out[0].imageUrl).toBeUndefined();
  });

  it('skips products that already have an https image', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await resolveImages(ENV, [{ name: 'X', imageUrl: 'https://cdn/x.jpg' }]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fills a missing image from Serper Images', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      images: [{ imageUrl: 'https://m.media-amazon.com/images/p.jpg', imageWidth: 600, imageHeight: 600 }],
    }), { status: 200 })));
    const out = await resolveImages(ENV, [{ name: 'Synology DS224', brand: 'Synology' }]);
    expect(out[0].imageUrl).toContain('media-amazon.com');
  });
});
