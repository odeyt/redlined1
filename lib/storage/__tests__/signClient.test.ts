/**
 * The client signer runs on every image render, so its batching and cache are
 * load-bearing for both correctness and cost. A vehicle gallery mounting 40
 * thumbnails must produce one request, not 40.
 *
 * The rule these tests protect above all: signing NEVER touches stored
 * values. InspectionsView writes `items` back with updateInspection() and
 * PartsView writes `photos` back with updatePart(). A signed URL reaching
 * either field would persist an expiring token into the database — the rows
 * would look fine and break an hour later. That is why signing lives at the
 * render boundary and returns a value the caller displays but never stores.
 */
import { signStoredUrlClient, clearSignedUrlCache } from '../signClient';

const BASE = 'https://x.supabase.co/storage/v1/object/public/shop-assets/';

const createSignedUrls = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => createSignedUrls(...a) }) } },
}));

beforeEach(() => {
  clearSignedUrlCache();
  createSignedUrls.mockReset();
  createSignedUrls.mockImplementation((paths: string[]) => Promise.resolve({
    data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}?token=abc`, error: null })),
    error: null,
  }));
});

describe('batching', () => {
  it('collapses everything requested in one tick into a single call', async () => {
    const urls = Array.from({ length: 40 }, (_, i) => `${BASE}vehicles/v1/${i}.jpg`);
    const results = await Promise.all(urls.map(signStoredUrlClient));

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(40);
    expect(results.every(r => r?.startsWith('https://signed/'))).toBe(true);
  });

  it('asks for a repeated path only once', async () => {
    const url = `${BASE}logo/shop-1/logo.png`;
    // The logo appears on every row of a list.
    await Promise.all([url, url, url].map(signStoredUrlClient));
    expect(createSignedUrls.mock.calls[0][0]).toEqual(['logo/shop-1/logo.png']);
  });
});

describe('caching', () => {
  it('serves a second request for the same object without a round trip', async () => {
    const url = `${BASE}vehicles/v1/a.jpg`;
    await signStoredUrlClient(url);
    await signStoredUrlClient(url);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('keys the cache on the object path, not the stored string', async () => {
    // The logo is stored with a cache-busting ?t=; two different strings can
    // name the same object and must not be signed twice.
    await signStoredUrlClient(`${BASE}logo/s1/logo.png?t=1`);
    await signStoredUrlClient(`${BASE}logo/s1/logo.png?t=2`);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });
});

describe('what it refuses to touch', () => {
  it('returns null for values that are not in this bucket', async () => {
    // Blob previews and data URLs flow through the same <img>. Returning null
    // makes StorageImage keep the original, which is what a local preview
    // needs — it has no server object to sign.
    expect(await signStoredUrlClient('blob:http://localhost/abc')).toBeNull();
    expect(await signStoredUrlClient('data:image/png;base64,AAA')).toBeNull();
    expect(await signStoredUrlClient('https://example.com/logo.png')).toBeNull();
    expect(await signStoredUrlClient('')).toBeNull();
    expect(await signStoredUrlClient(null)).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('failure is never fatal', () => {
  it('resolves null when the whole batch errors', async () => {
    // Rejecting would take out whichever component is mid-render.
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(signStoredUrlClient(`${BASE}vehicles/v1/a.jpg`)).resolves.toBeNull();
  });

  it('resolves null when the batch throws', async () => {
    createSignedUrls.mockRejectedValue(new Error('offline'));
    await expect(signStoredUrlClient(`${BASE}vehicles/v1/a.jpg`)).resolves.toBeNull();
  });

  it('releases waiters for paths the response omits entirely', async () => {
    // A partial response must not leave a component awaiting forever.
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    await expect(signStoredUrlClient(`${BASE}vehicles/v1/a.jpg`)).resolves.toBeNull();
  });

  it('reports per-row errors as null without failing the rest of the batch', async () => {
    createSignedUrls.mockImplementation((paths: string[]) => Promise.resolve({
      data: paths.map((p, i) => i === 0
        ? { path: p, signedUrl: null, error: 'not found' }
        : { path: p, signedUrl: `https://signed/${p}`, error: null }),
      error: null,
    }));
    const [bad, good] = await Promise.all([
      signStoredUrlClient(`${BASE}vehicles/v1/missing.jpg`),
      signStoredUrlClient(`${BASE}vehicles/v1/present.jpg`),
    ]);
    expect(bad).toBeNull();
    expect(good).toContain('https://signed/');
  });

  it('does not poison the cache with a failed signing', async () => {
    createSignedUrls.mockResolvedValueOnce({ data: null, error: { message: 'transient' } });
    const url = `${BASE}vehicles/v1/a.jpg`;
    expect(await signStoredUrlClient(url)).toBeNull();
    // A retry must actually retry rather than replay the failure.
    expect(await signStoredUrlClient(url)).toContain('https://signed/');
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
});
