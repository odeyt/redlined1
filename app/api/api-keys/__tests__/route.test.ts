/**
 * Settings → API Keys server route (PLAN.md phase 6): owner only, behind the
 * flag, shop-scoped keys, the secret returned once and stored only as a hash,
 * every issue and revoke audited as the owner.
 */
import { NextRequest } from 'next/server';
import { hashApiKey } from '@/lib/api/principal';
import { createFakeDb } from '@/app/api/v1/__tests__/fakeDb';

const fake = createFakeDb();
const ownerRpc = jest.fn<Promise<{ data: unknown; error: unknown }>, unknown[]>(async () => ({ data: 'audit-id', error: null }));
let role: 'owner' | 'manager' | null = 'owner';

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ rpc: ownerRpc })) }));
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: jest.fn(async (_req: unknown, shopId: unknown, allowed: string[]) => {
    const { NextResponse } = jest.requireActual('next/server');
    if (!role) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    if (typeof shopId !== 'string' || !allowed.includes(role)) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { ok: true, context: { userId: 'owner-1', role } };
  }),
}));

const SHOP = 'shop-a', OTHER_SHOP = 'shop-b', ORG = 'org-1';

function seed(flag = true) {
  fake.reset();
  fake.tables.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: flag }];
  fake.tables.shops = [{ id: SHOP, organization_id: ORG }, { id: OTHER_SHOP, organization_id: ORG }];
  fake.tables.api_keys = [
    { id: 'k-mine', name: 'Wally Bot', prefix: 'rl_live_aaaaaaaa', key_hash: 'HASH-1', organization_id: ORG, shop_id: SHOP, scopes: ['estimates:read'], created_at: '2026-11-20T00:00:00Z', last_used_at: null, revoked_at: null },
    { id: 'k-org', name: 'Operator sync', prefix: 'rl_live_bbbbbbbb', key_hash: 'HASH-2', organization_id: ORG, shop_id: null, scopes: ['customers:read'], created_at: '2026-11-19T00:00:00Z', revoked_at: null },
    { id: 'k-other', name: 'Other shop bot', prefix: 'rl_live_cccccccc', key_hash: 'HASH-3', organization_id: ORG, shop_id: OTHER_SHOP, scopes: ['estimates:read'], created_at: '2026-11-18T00:00:00Z', revoked_at: null },
  ];
  fake.tables.audit_events = [
    { shop_id: SHOP, actor_type: 'api', action: 'estimate.created', entity_type: 'estimate', entity_id: 'e1', created_at: '2026-11-21T00:00:00Z', metadata: { api_client_id: 'k-mine' } },
    { shop_id: OTHER_SHOP, actor_type: 'api', action: 'estimate.created', entity_type: 'estimate', entity_id: 'e9', created_at: '2026-11-21T00:00:00Z', metadata: { api_client_id: 'k-other' } },
  ];
  role = 'owner';
  ownerRpc.mockClear();
  ownerRpc.mockImplementation(async () => ({ data: 'audit-id', error: null }));
}

/* eslint-disable @typescript-eslint/no-require-imports */
const route = () => require('../route');
/* eslint-enable @typescript-eslint/no-require-imports */

const req = (method: string, body?: unknown, query = '') =>
  new NextRequest('https://redlined1.test/api/api-keys' + query, {
    method, headers: { authorization: 'Bearer owner-jwt', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown, query = '') {
  const res = await route()[method](req(method, body, query));
  return { status: res.status, body: await res.json(), headers: res.headers };
}

beforeEach(() => seed());

describe('access', () => {
  it('is owner only', async () => {
    role = 'manager';
    expect((await call('GET', undefined, `?shopId=${SHOP}`)).status).toBe(403);
    expect((await call('POST', { shopId: SHOP, name: 'x', scopes: ['estimates:read'] })).status).toBe(403);
    expect(fake.tables.api_keys).toHaveLength(3);
  });

  it('needs a session', async () => {
    role = null;
    expect((await call('GET', undefined, `?shopId=${SHOP}`)).status).toBe(401);
  });

  it('is 404 while api_v1_documents is off', async () => {
    seed(false);
    expect((await call('GET', undefined, `?shopId=${SHOP}`)).status).toBe(404);
    expect((await call('POST', { shopId: SHOP, name: 'x', scopes: ['estimates:read'] })).status).toBe(404);
  });
});

describe('GET', () => {
  it('lists this shop\'s keys and organization-wide ones, never another shop\'s', async () => {
    const r = await call('GET', undefined, `?shopId=${SHOP}`);
    expect(r.status).toBe(200);
    expect(r.body.keys.map((k: { id: string }) => k.id)).toEqual(['k-mine', 'k-org']);
    expect(r.body.keys[1].allShops).toBe(true);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never returns a hash or a secret', async () => {
    const r = await call('GET', undefined, `?shopId=${SHOP}`);
    expect(JSON.stringify(r.body)).not.toMatch(/HASH-|key_hash|secret/);
  });

  it('shows each key\'s recent activity in this shop only', async () => {
    const r = await call('GET', undefined, `?shopId=${SHOP}`);
    expect(r.body.keys[0].activity).toEqual([{ action: 'estimate.created', entityType: 'estimate', entityId: 'e1', at: '2026-11-21T00:00:00Z' }]);
    expect(JSON.stringify(r.body)).not.toContain('e9');
  });
});

describe('POST: issuing', () => {
  it('issues a shop-scoped key, returning the secret once and storing only its hash', async () => {
    const r = await call('POST', { shopId: SHOP, name: '  RedlineD1 CRM ', scopes: ['estimates:write', 'customers:read', 'estimates:read'] });
    expect(r.status).toBe(201);
    expect(r.body.secret).toMatch(/^rl_live_[0-9a-f]{48}$/);
    expect(r.body.key).toMatchObject({ name: 'RedlineD1 CRM', allShops: false, scopes: ['customers:read', 'estimates:read', 'estimates:write'] });

    const row = fake.tables.api_keys.find(k => k.name === 'RedlineD1 CRM')!;
    expect(row).toMatchObject({ shop_id: SHOP, organization_id: ORG, created_by_user_id: 'owner-1', key_hash: hashApiKey(r.body.secret) });
    expect(JSON.stringify(row)).not.toContain(r.body.secret);
    expect(r.body.secret.startsWith(row.prefix as string)).toBe(true);
  });

  it('cannot be pointed at another shop or organization through the body', async () => {
    await call('POST', { shopId: SHOP, name: 'x', scopes: ['estimates:read'], shop_id: OTHER_SHOP, organization_id: 'org-evil' });
    const row = fake.tables.api_keys.find(k => k.name === 'x')!;
    expect(row).toMatchObject({ shop_id: SHOP, organization_id: ORG });
  });

  it('audits the issue as the owner, through the owner\'s session', async () => {
    const r = await call('POST', { shopId: SHOP, name: 'Wally Bot 2', scopes: ['estimates:read'] });
    expect(ownerRpc).toHaveBeenCalledWith('record_audit_event', expect.objectContaining({
      p_shop_id: SHOP, p_actor_type: 'user', p_action: 'api_client.issued', p_entity_type: 'api_client', p_entity_id: r.body.key.id,
    }));
    const audited = JSON.stringify(ownerRpc.mock.calls[0]);
    expect(audited).not.toContain(r.body.secret);
  });

  it('revokes the key and returns no secret if the audit row cannot be written', async () => {
    ownerRpc.mockImplementation(async () => ({ data: null, error: { message: 'down' } }));
    const r = await call('POST', { shopId: SHOP, name: 'Unaudited', scopes: ['estimates:read'] });
    expect(r.status).toBe(500);
    expect(r.body.secret).toBeUndefined();
    expect(fake.tables.api_keys.find(k => k.name === 'Unaudited')!.revoked_at).toBeTruthy();
  });

  it.each([
    ['no name', { scopes: ['estimates:read'] }],
    ['no scopes', { name: 'x', scopes: [] }],
    ['an unknown scope', { name: 'x', scopes: ['payments:write'] }],
    ['a long name', { name: 'x'.repeat(81), scopes: ['estimates:read'] }],
  ])('refuses %s', async (_what, extra) => {
    const r = await call('POST', { shopId: SHOP, ...extra });
    expect(r.status).toBe(422);
    expect(fake.tables.api_keys).toHaveLength(3);
  });
});

describe('DELETE: revoking', () => {
  it('revokes this shop\'s key and audits it', async () => {
    const r = await call('DELETE', { shopId: SHOP, id: 'k-mine' });
    expect(r.status).toBe(200);
    expect(fake.tables.api_keys.find(k => k.id === 'k-mine')!.revoked_at).toBeTruthy();
    expect(ownerRpc).toHaveBeenCalledWith('record_audit_event', expect.objectContaining({ p_action: 'api_client.revoked', p_entity_id: 'k-mine' }));
  });

  it('will not revoke an organization-wide key or another shop\'s key', async () => {
    expect((await call('DELETE', { shopId: SHOP, id: 'k-org' })).status).toBe(404);
    expect((await call('DELETE', { shopId: SHOP, id: 'k-other' })).status).toBe(404);
    expect(fake.tables.api_keys.filter(k => k.revoked_at)).toHaveLength(0);
  });

  it('keeps the row (revoked, not deleted)', async () => {
    await call('DELETE', { shopId: SHOP, id: 'k-mine' });
    expect(fake.tables.api_keys).toHaveLength(3);
  });
});
