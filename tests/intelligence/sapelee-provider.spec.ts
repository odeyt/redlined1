import { test, expect } from '@playwright/test';

// SI-8: Sapelee Connector — smoke tests
// All Sapelee flags OFF by default. Tests verify safe behavior when Sapelee is unconfigured.

test.describe('Sapelee Provider', () => {
  const SHOP_ID = '90b72748-bf01-4456-999f-f4ba48091606';

  test('Health endpoint includes sapelee status field @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    // sapelee key must always be present (even in fallback)
    expect(body).toHaveProperty('sapelee');
    expect(body.sapelee).toHaveProperty('configured');
    expect(body.sapelee).toHaveProperty('status');
    expect(body.sapelee).toHaveProperty('checkedAt');
  });

  test('Sapelee reports unconfigured when env vars missing @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    const body = await res.json();
    // In CI / dev without SAPELEE_API_URL set, should be offline/unconfigured
    if (!body.sapelee.configured) {
      expect(['offline', 'degraded']).toContain(body.sapelee.status);
    }
  });

  test('Morning brief endpoint still works when Sapelee flag OFF @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/morning-brief', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    // Unauthenticated → 401; flag off → 200 with disabled:true
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      // Must not crash — either brief or disabled
      expect(body).toBeDefined();
    }
  });

  test('Action queue works independently of Sapelee @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/action-queue', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
      if (body.disabled) {
        expect(body.disabled).toBe(true);
      } else {
        expect(body).toHaveProperty('actions');
      }
    }
  });

  test('Executive score works independently of Sapelee @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/executive-score', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });
});
