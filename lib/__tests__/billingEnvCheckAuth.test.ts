/**
 * /api/billing/env-check must authorize the platform owner exactly as /admin does.
 *
 * Regression: the route compared `user.email !== process.env.PLATFORM_OWNER_EMAIL` itself. An account that
 * /admin accepted (the shared guard trims, lowercases and splits PLATFORM_OWNER_EMAIL on commas) was refused
 * here with 403 whenever the variable differed from the sign-in email by letter case, whitespace, or held
 * more than one owner.
 *
 * The REAL guard (lib/adminAuth) runs here; only the identity lookup is stubbed, so this exercises the actual
 * comparison. All identities are synthetic.
 */
import { NextRequest } from 'next/server';

// token -> email, for every place a session could be resolved
const SESSIONS: Record<string, string> = {
  'tok-owner': 'owner@example-test.invalid',
  'tok-owner-mixed': 'Owner@Example-Test.Invalid',
  'tok-second-owner': 'second@example-test.invalid',
  'tok-shop-user': 'mechanic@example-test.invalid',
};
const lookup = async (token?: string) => {
  const email = token ? SESSIONS[token] : undefined;
  return email ? { data: { user: { email } }, error: null } : { data: { user: null }, error: { message: 'invalid' } };
};

// The shared guard resolves a Bearer token through the service client, and a cookie session through @supabase/ssr.
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => ({ auth: { getUser: (t?: string) => lookup(t) } }) }));
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: (t?: string) => lookup(t) } }) }));
// Outside a request there is no cookie store; an empty one keeps any implementation (old or new) runnable here.
jest.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));

import { GET } from '@/app/api/billing/env-check/route';
import { verifyPlatformOwner } from '@/lib/adminAuth';

const call = (token?: string) =>
  GET(new NextRequest('http://localhost/api/billing/env-check', token ? { headers: { authorization: `Bearer ${token}` } } : undefined));

const ENV_KEYS = ['PLATFORM_OWNER_EMAIL', 'NEXT_PUBLIC_BILLING_ENABLED', 'CREEM_API_KEY', 'CREEM_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

// Every case where the old raw `!==` comparison and the shared guard disagree, plus the ones they agree on.
const CASES: Array<{ name: string; ownerVar: string | undefined; token?: string; status: number }> = [
  { name: 'exact match',                                   ownerVar: 'owner@example-test.invalid',                          token: 'tok-owner',        status: 200 },
  { name: 'variable in different letter case',             ownerVar: 'OWNER@EXAMPLE-TEST.INVALID',                          token: 'tok-owner',        status: 200 },
  { name: 'sign-in email in different letter case',        ownerVar: 'owner@example-test.invalid',                          token: 'tok-owner-mixed',  status: 200 },
  { name: 'variable with surrounding whitespace',          ownerVar: '  owner@example-test.invalid  ',                      token: 'tok-owner',        status: 200 },
  { name: 'first of several owners',                       ownerVar: 'owner@example-test.invalid,second@example-test.invalid',  token: 'tok-owner',        status: 200 },
  { name: 'later of several owners, with spaces',          ownerVar: 'owner@example-test.invalid , Second@Example-Test.Invalid', token: 'tok-second-owner', status: 200 },
  { name: 'a shop user is not an owner',                   ownerVar: 'owner@example-test.invalid,second@example-test.invalid',  token: 'tok-shop-user',    status: 403 },
  { name: 'an unknown token is signed out',                ownerVar: 'owner@example-test.invalid',                          token: 'tok-nobody',       status: 401 },
  { name: 'no credentials at all',                         ownerVar: 'owner@example-test.invalid',                          token: undefined,          status: 401 },
  { name: 'variable unset: fails closed, even for the would-be owner', ownerVar: undefined,                                  token: 'tok-owner',        status: 401 },
  { name: 'variable blank: fails closed',                  ownerVar: '   ',                                                  token: 'tok-owner',        status: 401 },
];

describe('GET /api/billing/env-check authorization', () => {
  it.each(CASES)('$name -> $status', async ({ ownerVar, token, status }) => {
    if (ownerVar === undefined) delete process.env.PLATFORM_OWNER_EMAIL; else process.env.PLATFORM_OWNER_EMAIL = ownerVar;
    expect((await call(token)).status).toBe(status);
  });

  it('agrees with the shared /admin guard on every case (the endpoint cannot drift from it again)', async () => {
    for (const c of CASES) {
      if (c.ownerVar === undefined) delete process.env.PLATFORM_OWNER_EMAIL; else process.env.PLATFORM_OWNER_EMAIL = c.ownerVar;
      const guard = await verifyPlatformOwner(new NextRequest('http://localhost/x', c.token ? { headers: { authorization: `Bearer ${c.token}` } } : undefined));
      const res = await call(c.token);
      expect({ case: c.name, allowed: res.status === 200 }).toEqual({ case: c.name, allowed: guard.authorized });
    }
  });
});

describe('what an authorized owner gets back', () => {
  beforeEach(() => { process.env.PLATFORM_OWNER_EMAIL = 'Owner@Example-Test.Invalid'; });

  it.each([['true', true], ['false', false], [undefined, false], ['TRUE', false]] as const)(
    'reports billingEnabled for NEXT_PUBLIC_BILLING_ENABLED=%s as %s', async (raw, expected) => {
      if (raw === undefined) delete process.env.NEXT_PUBLIC_BILLING_ENABLED; else process.env.NEXT_PUBLIC_BILLING_ENABLED = raw;
      const res = await call('tok-owner');
      expect(res.status).toBe(200);
      expect((await res.json()).billingEnabled).toBe(expected);
    });

  it('returns presence flags and key classes only, never a configured value', async () => {
    process.env.CREEM_API_KEY = 'creem_test_FAKE-KEY-VALUE-1234';
    process.env.CREEM_WEBHOOK_SECRET = 'whsec_FAKE-SECRET-VALUE-5678';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJFAKE.SERVICE.ROLE-VALUE-9012';
    const res = await call('tok-owner');
    const text = await res.text();
    expect(res.status).toBe(200);
    for (const secret of ['FAKE-KEY-VALUE-1234', 'FAKE-SECRET-VALUE-5678', 'FAKE.SERVICE.ROLE-VALUE-9012', 'owner@example-test']) {
      expect(text).not.toContain(secret);
    }
    const body = JSON.parse(text);
    expect(body).toMatchObject({ apiKeyConfigured: true, apiKeyIsTestKey: true, webhookSecretConfigured: true, serviceKeyType: 'legacy-service-role-jwt (full access)' });
  });

  it('a refused caller learns nothing about the configuration', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true';
    const res = await call('tok-shop-user');
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toMatch(/billingEnabled|apiKey|serviceKeyType|Creem|CREEM/i);
  });
});

describe('source', () => {
  it('uses the shared guard and no inline email comparison', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'app', 'api', 'billing', 'env-check', 'route.ts'), 'utf8')
      .split(/\r?\n/).filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    expect(src).toMatch(/verifyPlatformOwner\(req\)/);
    expect(src).not.toMatch(/user\.email\s*[!=]==/);
    expect(src).not.toMatch(/process\.env\.PLATFORM_OWNER_EMAIL/);
  });
});
