/**
 * The HTTP edges: unsubscribe (signed, GET never changes anything), the
 * signed-in preference, and consent at email verification.
 */
import { NextRequest } from 'next/server';

const rpc = jest.fn();
const fromSelect = jest.fn();
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: fromSelect }) }) }),
  }),
}));

const getUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }));

import { GET as unsubGET, POST as unsubPOST } from '@/app/api/trial-tips/unsubscribe/route';
import { GET as prefGET, POST as prefPOST } from '@/app/api/trial-tips/preference/route';
import { unsubscribeToken } from '../unsubscribeToken';
import { recordSignupConsent } from '../consent';
import { TRIAL_TIPS_CONSENT_VERSION } from '../config';

const SECRET = 'u'.repeat(40);
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 'unsubscribed', error: null });
  fromSelect.mockReset().mockResolvedValue({ data: { status: 'subscribed' }, error: null });
  getUser.mockReset().mockResolvedValue({ data: { user: { id: USER } } });
  process.env.TRIAL_TIPS_UNSUBSCRIBE_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

function unsubReq(method: 'GET' | 'POST', u: string, t: string, body?: string) {
  return new NextRequest(`https://redlined1.com/api/trial-tips/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`, {
    method,
    ...(body !== undefined ? { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}),
  });
}

describe('unsubscribe', () => {
  it('GET with a valid link shows a confirmation and changes NOTHING', async () => {
    const res = await unsubGET(unsubReq('GET', USER, unsubscribeToken(USER, SECRET)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain('noindex');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('POST from the page button unsubscribes with source "link"', async () => {
    const res = await unsubPOST(unsubReq('POST', USER, unsubscribeToken(USER, SECRET), 'source=link'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('You are unsubscribed');
    expect(rpc).toHaveBeenCalledWith('trial_tips_unsubscribe', { p_user: USER, p_source: 'link' });
  });

  it('POST from a mail client (RFC 8058 one-click) unsubscribes with source "one_click"', async () => {
    await unsubPOST(unsubReq('POST', USER, unsubscribeToken(USER, SECRET), 'List-Unsubscribe=One-Click'));
    expect(rpc).toHaveBeenCalledWith('trial_tips_unsubscribe', { p_user: USER, p_source: 'one_click' });
  });

  it('a link with someone else\'s id is refused, and nothing changes', async () => {
    const res = await unsubPOST(unsubReq('POST', OTHER, unsubscribeToken(USER, SECRET), 'source=link'));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a tampered or missing token is refused with the same page', async () => {
    const a = await unsubGET(unsubReq('GET', USER, 'forged'));
    const b = await unsubGET(unsubReq('GET', 'not-a-user', ''));
    expect(a.status).toBe(400);
    expect(await a.text()).toBe(await b.text());
  });

  it('refuses everything when the secret is not configured', async () => {
    delete process.env.TRIAL_TIPS_UNSUBSCRIBE_SECRET;
    const res = await unsubPOST(unsubReq('POST', USER, unsubscribeToken(USER, SECRET), 'source=link'));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a database failure says so rather than claiming success', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const res = await unsubPOST(unsubReq('POST', USER, unsubscribeToken(USER, SECRET), 'source=link'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('You are unsubscribed');
  });
});

function prefReq(method: 'GET' | 'POST', body?: unknown, token = 'jwt') {
  return new NextRequest('https://redlined1.com/api/trial-tips/preference', {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('preference (Settings)', () => {
  it('requires a signed-in user', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await prefGET(prefReq('GET', undefined, ''))).status).toBe(401);
  });

  it('reads the caller\'s own status', async () => {
    const res = await prefGET(prefReq('GET'));
    expect(await res.json()).toMatchObject({ status: 'subscribed' });
  });

  it('switching on records fresh consent for the CALLER, whatever the body says', async () => {
    rpc.mockResolvedValueOnce({ data: 'recorded', error: null });
    await prefPOST(prefReq('POST', { subscribed: true, userId: OTHER }));
    expect(rpc).toHaveBeenCalledWith('trial_tips_record_consent', expect.objectContaining({
      p_user: USER, p_source: 'settings', p_version: TRIAL_TIPS_CONSENT_VERSION,
    }));
  });

  it('switching off unsubscribes the caller', async () => {
    await prefPOST(prefReq('POST', { subscribed: false }));
    expect(rpc).toHaveBeenCalledWith('trial_tips_unsubscribe', { p_user: USER, p_source: 'settings' });
  });

  it('a suppressed address cannot be switched back on', async () => {
    rpc.mockResolvedValueOnce({ data: 'suppressed', error: null });
    const res = await prefPOST(prefReq('POST', { subscribed: true }));
    expect(res.status).toBe(409);
  });

  it('rejects a malformed body', async () => {
    expect((await prefPOST(prefReq('POST', { subscribed: 'yes' }))).status).toBe(400);
  });
});

describe('consent at email verification', () => {
  const db = { rpc };

  it('an existing account with no signup choice is NOT enrolled', async () => {
    expect(await recordSignupConsent(db, { id: USER, user_metadata: { full_name: 'A' } })).toBe('not_requested');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an unknown consent-text version is not trusted', async () => {
    expect(await recordSignupConsent(db, { id: USER, user_metadata: { trial_tips_opt_in: true, trial_tips_consent_version: 'made-up' } }))
      .toBe('not_requested');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('"true" as a string is not consent', async () => {
    expect(await recordSignupConsent(db, { id: USER, user_metadata: { trial_tips_opt_in: 'true', trial_tips_consent_version: TRIAL_TIPS_CONSENT_VERSION } }))
      .toBe('not_requested');
  });

  it('a ticked box becomes consent server-side, with the account\'s creation time as the request time', async () => {
    rpc.mockResolvedValueOnce({ data: 'recorded', error: null });
    await recordSignupConsent(db, {
      id: USER, created_at: '2026-10-01T10:00:00Z',
      user_metadata: { trial_tips_opt_in: true, trial_tips_consent_version: TRIAL_TIPS_CONSENT_VERSION },
    });
    expect(rpc).toHaveBeenCalledWith('trial_tips_record_consent', {
      p_user: USER, p_version: TRIAL_TIPS_CONSENT_VERSION, p_source: 'signup', p_requested_at: '2026-10-01T10:00:00Z',
    });
  });
});
