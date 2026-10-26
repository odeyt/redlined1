import { isSeoPagePath } from '@/lib/marketing/publicPaths';
import sitemap from '@/app/sitemap';

describe('public marketing route boundary', () => {
  it.each(['/mobile-mechanic-software', '/digital-vehicle-inspection-software'])('allows only the exact content route %s', path => {
    expect(isSeoPagePath(path)).toBe(true);
    expect(isSeoPagePath(`${path}/`)).toBe(true);
    expect(isSeoPagePath(`${path}/admin`)).toBe(false);
    expect(isSeoPagePath(`${path}-private`)).toBe(false);
  });

  it.each(['/', '/admin', '/api/customers', '/portal/token', '/billing', '/login'])('does not bypass existing routing for %s', path => {
    expect(isSeoPagePath(path)).toBe(false);
  });

  it('publishes unique canonical URLs for the acquisition pages without made-up freshness', () => {
    const entries = sitemap();
    const urls = entries.map(entry => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.redlined1.com/mobile-mechanic-software',
      'https://www.redlined1.com/digital-vehicle-inspection-software',
      'https://www.redlined1.com/shop-audit',
    ]));
    expect(entries.every(entry => !entry.lastModified)).toBe(true);
  });
});
