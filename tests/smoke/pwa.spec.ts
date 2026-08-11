import { test, expect } from '@playwright/test';

/**
 * PWA foundation — @smoke
 *
 * These assert against the deployed site rather than the source, which is the
 * distinction that mattered: /manifest.json and /sw.js were both returning 307
 * to /login in production for months. The source was correct the whole time.
 * The proxy matcher excluded image and font extensions but not .json or .js,
 * so no service worker had ever registered and the app had never been
 * installable — and nothing in a source-level test could have caught it.
 *
 * Runs unauthenticated, so it works against local, preview and production.
 */

test.describe('PWA foundation @smoke', () => {

  test('the manifest is served, not redirected to login', async ({ request }) => {
    const res = await request.get('/manifest.json', { maxRedirects: 0 });
    expect(res.status(), 'a redirect here makes the app uninstallable').toBe(200);
    expect(res.headers()['content-type']).toContain('json');

    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(Array.isArray(m.icons)).toBe(true);
  });

  test('the manifest declares maskable icons separately from any', async ({ request }) => {
    // One icon marked "any maskable" has its edges cropped by Android's
    // adaptive mask; the two purposes need different artwork.
    const m = await (await request.get('/manifest.json')).json();
    const purposes = m.icons.map((i: { purpose?: string }) => i.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  test('the service worker script is served, not redirected', async ({ request }) => {
    const res = await request.get('/sw.js', { maxRedirects: 0 });
    expect(res.status(), 'a redirect here means no service worker ever registers').toBe(200);
    expect(res.headers()['content-type']).toContain('javascript');
  });

  test('the worker derives its cache name from the build, not a constant', async ({ request }) => {
    // A hand-edited constant only evicts stale assets if someone remembers to
    // change it. The build id makes that automatic.
    const body = await (await request.get('/sw.js')).text();
    expect(body).toContain("searchParams.get('v')");
    expect(body).toContain('redlined1-${BUILD}');
  });

  test('the worker never caches API, auth or Supabase responses', async ({ request }) => {
    const body = await (await request.get('/sw.js')).text();
    expect(body).toContain("url.pathname.startsWith('/api/')");
    expect(body).toContain("url.hostname.includes('supabase.co')");
    // Only content-hashed build output may be stored.
    expect(body).toContain("/_next/static/");
  });

  test('the apple touch icon is served — iOS ignores the manifest', async ({ request }) => {
    const res = await request.get('/apple-touch-icon.png', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image');
  });

  test('crawler files are not behind the session gate', async ({ request }) => {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} redirected`).toBe(200);
    }
  });

  test('the page links the manifest and allows pinch-zoom', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

    // maximumScale=1 disables pinch-zoom, fails WCAG 1.4.4, and takes zoom
    // from anyone trying to read a VIN plate in a photo.
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport ?? '').not.toContain('maximum-scale=1');
  });

  test('the deployed build identifies itself', async ({ request }) => {
    // Comparing this with the build the browser is running is how a stale tab
    // is distinguished from a real bug.
    const res = await request.get('/api/ping');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.commit).toBeTruthy();
    expect(body.commit).not.toBe('local');
  });
});
