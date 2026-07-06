/**
 * API helpers for test data validation.
 * Uses the app's own API routes — no direct DB access.
 */

import { APIRequestContext, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

export async function getHealth(request: APIRequestContext) {
  const res = await request.get(`${BASE}/api/health`);
  expect(res.status()).toBe(200);
  return res.json() as Promise<{
    status: string;
    checks: Record<string, boolean | string>;
  }>;
}

export async function getFeatureFlags(request: APIRequestContext) {
  const res = await request.get(`${BASE}/api/feature-flags`);
  expect(res.status()).toBe(200);
  return res.json() as Promise<{ flags: Record<string, boolean> }>;
}

export async function toggleFeatureFlag(
  request: APIRequestContext,
  key: string,
  enabled: boolean,
): Promise<void> {
  const res = await request.patch(`${BASE}/api/feature-flags/${key}`, {
    data: { enabled, scope: 'global' },
  });
  expect(res.status()).toBe(200);
}
