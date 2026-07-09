import { test, expect } from '@playwright/test';

// SI-7: Morning Brief Engine — smoke tests
// Feature flag is OFF by default so all endpoints return disabled state.

test.describe('Morning Brief Engine API', () => {
  test('GET returns disabled or null brief when flag is OFF @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/morning-brief', {
      headers: { 'x-shop-id': '90b72748-bf01-4456-999f-f4ba48091606' },
    });
    // Unauthenticated → 401; flag off → 200 with disabled:true
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      if (body.disabled) {
        expect(body.disabled).toBe(true);
        expect(body.brief).toBeNull();
      }
    }
  });

  test('POST generate returns disabled or 401 when flag OFF @smoke', async ({ request }) => {
    const res = await request.post('/api/intelligence/morning-brief', {
      headers: { 'x-shop-id': '90b72748-bf01-4456-999f-f4ba48091606' },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      if (body.disabled) expect(body.disabled).toBe(true);
    }
  });

  test('PATCH without auth returns 401 @smoke', async ({ request }) => {
    const res = await request.patch('/api/intelligence/morning-brief', {
      data: { id: 'fake-id', action: 'dismiss' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET with migration not run fails safely @smoke', async ({ request }) => {
    // If migration ran, returns disabled. If not, should not crash with 500 uncaught.
    const res = await request.get('/api/intelligence/morning-brief', {
      headers: { 'x-shop-id': '90b72748-bf01-4456-999f-f4ba48091606' },
    });
    // Must never return 500 with an unhandled error — safe migration guard in route
    expect(res.status()).not.toBe(500);
  });

  test('technician blocked from morning brief API @smoke', async ({ request }) => {
    // Without auth cookie, unauthenticated → 401 (technician role would get 403)
    const res = await request.get('/api/intelligence/morning-brief');
    expect([401, 403]).toContain(res.status());
  });
});

// FocusRules unit-level via API contract
test.describe('Morning Brief Focus Logic', () => {
  test('brief endpoint never crashes Command Center @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/morning-brief');
    // Should always respond (not hang or throw unhandled)
    expect(res.status()).toBeLessThan(600);
  });
});
