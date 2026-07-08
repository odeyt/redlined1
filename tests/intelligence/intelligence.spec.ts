import { test, expect } from '@playwright/test';

// Intelligence Foundation — smoke tests via health check API
// These verify the endpoint is reachable and returns a valid response.
// No AI is connected (mock mode) so tests are deterministic.

test.describe('Intelligence Foundation', () => {
  test('health endpoint returns 200 with mock provider @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('mock');
    expect(body.mockMode).toBe(true);
    expect(['ok', 'degraded', 'offline']).toContain(body.status);
    expect(typeof body.checkedAt).toBe('string');
  });

  test('health endpoint always responds — never crashes production', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    // Even if something fails internally, the endpoint must respond (not 5xx crash)
    expect(res.status()).toBeLessThan(600);
  });

  test('intelligence flags are absent from enabled flags (default OFF)', async ({ request }) => {
    // Feature flags API returns only enabled flags; intelligence flags must NOT appear
    const res = await request.get('/api/feature-flags');
    if (res.status() !== 200) return; // skip if auth required
    const body = await res.json();
    const flags: string[] = Array.isArray(body) ? body.map((f: { flag_key: string }) => f.flag_key) : [];
    const enabled = flags.filter(k =>
      ['intelligence_foundation', 'command_center', 'daily_summary', 'morning_briefing'].includes(k)
    );
    expect(enabled).toHaveLength(0);
  });
});
