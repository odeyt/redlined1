/**
 * toStoragePath is the load-bearing string parse in the signing work: every
 * stored value is a fully-qualified public URL, and signing needs the object
 * path. Get this wrong and images silently fall back to unsigned URLs — which
 * still WORK while the bucket is public, so the failure would be invisible
 * until the bucket flips private and every report goes blank at once.
 *
 * Testing the parser alone, with no network: the signing round trip is
 * verified separately against the deployed routes.
 */
import { toStoragePath } from '../signServer';

const BASE = 'https://ldjrlvjkmzrcdqhetqoh.supabase.co/storage/v1/object/public/shop-assets/';

describe('toStoragePath', () => {
  it('extracts the object path from a stored public URL', () => {
    expect(toStoragePath(`${BASE}vehicles/abc-123/1784174868480.jpeg`))
      .toBe('vehicles/abc-123/1784174868480.jpeg');
  });

  it('drops the cache-busting query the logo upload appends', () => {
    // uploadLogo() returns `${publicUrl}?t=${Date.now()}` and that value is
    // what lands in shop_settings.logo_url. Signing a path with `?t=...`
    // still attached asks storage for an object that does not exist.
    expect(toStoragePath(`${BASE}logo/shop-1/shop-logo.jpg?t=1784174868480`))
      .toBe('logo/shop-1/shop-logo.jpg');
  });

  it('decodes percent-encoding so the path matches the stored object', () => {
    // Filenames with spaces come back encoded in the public URL; the storage
    // API wants the real key.
    expect(toStoragePath(`${BASE}parts/shop-1/BRK%20100/photo%20(1).jpg`))
      .toBe('parts/shop-1/BRK 100/photo (1).jpg');
  });

  it('handles every path prefix the app writes to', () => {
    const cases = [
      'vehicles/v1/a.jpg',
      'customers/c1/a.jpg',
      'parts/shop-1/BRK100/a.jpg',
      'inspections/i1/item-3.jpg',
      'logo/shop-1/shop-logo.png',
    ];
    for (const path of cases) {
      expect(toStoragePath(BASE + path)).toBe(path);
    }
  });

  it('survives a signed URL being passed back in', () => {
    // Re-signing an already-signed URL should target the same object rather
    // than producing nonsense, since a cached value may round-trip.
    expect(toStoragePath(
      'https://x.supabase.co/storage/v1/object/sign/shop-assets/vehicles/v1/a.jpg?token=ey.123',
    )).toBe('vehicles/v1/a.jpg');
  });

  it('returns null for anything that is not in this bucket', () => {
    // Callers use null to mean "leave this value alone".
    expect(toStoragePath('https://example.com/logo.png')).toBeNull();
    expect(toStoragePath('https://x.supabase.co/storage/v1/object/public/other-bucket/a.jpg')).toBeNull();
    expect(toStoragePath('')).toBeNull();
    expect(toStoragePath(null)).toBeNull();
    expect(toStoragePath(undefined)).toBeNull();
  });

  it('returns null when the bucket marker is present but the path is empty', () => {
    expect(toStoragePath(BASE)).toBeNull();
    expect(toStoragePath(`${BASE}?t=1`)).toBeNull();
  });

  it('does not throw on malformed percent-encoding', () => {
    // decodeURIComponent throws on a lone '%'; a bad row must not 500 a
    // customer's report page.
    expect(() => toStoragePath(`${BASE}vehicles/v1/100%.jpg`)).not.toThrow();
    expect(toStoragePath(`${BASE}vehicles/v1/100%.jpg`)).toBe('vehicles/v1/100%.jpg');
  });
});
