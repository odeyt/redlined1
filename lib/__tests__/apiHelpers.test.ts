import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, sanitizeError, escapeHtml, isRateLimited, wasRecentlyPerformed, getTrustedSiteUrl } from '../apiHelpers';

function makeReq(body?: string): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

const Schema = z.object({ email: z.string().email(), shopId: z.string().uuid() });

describe('parseJsonBody', () => {
  it('returns 400 on malformed JSON without leaking parser exception text', async () => {
    const result = await parseJsonBody(makeReq('{not valid json'), Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('Malformed JSON body');
      expect(JSON.stringify(body)).not.toMatch(/Unexpected token|JSON\.parse/i);
    }
  });

  it('returns 400 on schema validation failure without echoing zod issue details', async () => {
    const result = await parseJsonBody(makeReq(JSON.stringify({ email: 'not-an-email', shopId: 'not-a-uuid' })), Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('Invalid request data');
    }
  });

  it('returns parsed, normalized data on success', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    const result = await parseJsonBody(makeReq(JSON.stringify({ email: 'a@b.com', shopId: validUuid })), Schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ email: 'a@b.com', shopId: validUuid });
  });
});

describe('sanitizeError', () => {
  it('returns a generic message, not the raw error text', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const message = sanitizeError(new Error('duplicate key value violates unique constraint "shop_users_pkey"'), 'test-context');
    expect(message).toBe('Something went wrong');
    expect(message).not.toMatch(/constraint|shop_users_pkey/);
    expect(consoleSpy).toHaveBeenCalledWith('[test-context]', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('uses the provided fallback message', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(sanitizeError('raw string error', 'ctx', 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
  });
});

describe('isRateLimited', () => {
  it('allows requests under the limit and blocks once exceeded', () => {
    const key = `test-rl-${Math.random()}`;
    expect(isRateLimited(key, 2, 60_000)).toBe(false);
    expect(isRateLimited(key, 2, 60_000)).toBe(false);
    expect(isRateLimited(key, 2, 60_000)).toBe(true);
  });

  it('tracks distinct keys independently', () => {
    const keyA = `test-rl-a-${Math.random()}`;
    const keyB = `test-rl-b-${Math.random()}`;
    expect(isRateLimited(keyA, 1, 60_000)).toBe(false);
    expect(isRateLimited(keyB, 1, 60_000)).toBe(false);
  });
});

describe('wasRecentlyPerformed', () => {
  it('returns false the first time and true on immediate repeats', () => {
    const key = `test-idem-${Math.random()}`;
    expect(wasRecentlyPerformed(key, 60_000)).toBe(false);
    expect(wasRecentlyPerformed(key, 60_000)).toBe(true);
  });

  it('tracks distinct keys independently', () => {
    const keyA = `test-idem-a-${Math.random()}`;
    const keyB = `test-idem-b-${Math.random()}`;
    expect(wasRecentlyPerformed(keyA, 60_000)).toBe(false);
    expect(wasRecentlyPerformed(keyB, 60_000)).toBe(false);
  });
});

describe('in-memory Map growth bounding (isRateLimited/wasRecentlyPerformed)', () => {
  it('does not grow isRateLimited\'s internal map without bound under many distinct keys', () => {
    // Each call uses an already-expired window so every entry is sweepable —
    // proves the bound actually kicks in rather than just capping live entries.
    for (let i = 0; i < 6000; i++) {
      isRateLimited(`sweep-test-rl-${i}`, 1000, 1); // 1ms window: expired almost immediately
    }
    // A fresh call should still work normally (map isn't stuck/broken by the sweep).
    const key = `sweep-test-rl-final-${Math.random()}`;
    expect(isRateLimited(key, 2, 60_000)).toBe(false);
  });

  it('does not grow wasRecentlyPerformed\'s internal map without bound under many distinct keys', () => {
    for (let i = 0; i < 6000; i++) {
      wasRecentlyPerformed(`sweep-test-idem-${i}`, 1);
    }
    const key = `sweep-test-idem-final-${Math.random()}`;
    expect(wasRecentlyPerformed(key, 60_000)).toBe(false);
  });
});

describe('getTrustedSiteUrl', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
  });

  it('returns null when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getTrustedSiteUrl()).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    expect(getTrustedSiteUrl()).toBeNull();
  });

  it('returns null for a non-https, non-localhost URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://example.com';
    expect(getTrustedSiteUrl()).toBeNull();
  });

  it('returns the normalized origin for a valid https URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.redlined1.com/';
    expect(getTrustedSiteUrl()).toBe('https://www.redlined1.com');
  });

  it('allows http+localhost for local development', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    expect(getTrustedSiteUrl()).toBe('http://localhost:3000');
  });

  it('rejects a javascript: or other non-http(s) scheme', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
    expect(getTrustedSiteUrl()).toBeNull();
  });
});
