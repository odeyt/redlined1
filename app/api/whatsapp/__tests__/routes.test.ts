/**
 * /api/whatsapp/* and /api/webhooks/whatsapp, run as route handlers against
 * the schema-faithful fake database and the mock transport.
 *
 * Proves the request-level gates the send service cannot see: role, pilot
 * allowlist, feature flag, strict bodies (no caller-supplied recipient), the
 * live-approval phrase, coexistence-only Embedded Signup, sandbox refusing a
 * Business App number, and the webhook's signature check and status rules.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createFakeDb } from '@/lib/whatsapp/__tests__/fakeDb';
import { TEMPLATES } from '@/lib/whatsapp/templates';

const L2 = '90b72748-bf01-4456-999f-f4ba48091606';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const OTHER = 'eeeeeeee-0000-4000-8000-00000000000e';
const OWNER = 'a0000000-0000-4000-8000-000000000001';
const PHONE = '8562055551234';
const SECRET = 'route-test-app-secret';

process.env.WHATSAPP_TRANSPORT = 'mock';
process.env.WHATSAPP_APP_SECRET = SECRET;
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

let role: string = 'owner';
let flagOn = true;
let fake: ReturnType<typeof createFakeDb>;

jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: async (_req: unknown, shopId: unknown, roles: string[]) => {
    if (typeof shopId !== 'string') return { ok: false, response: NextResponse.json({ error: 'bad' }, { status: 400 }) };
    if (!roles.includes(role)) return { ok: false, response: NextResponse.json({ error: 'Insufficient role for this action' }, { status: 403 }) };
    return { ok: true, context: { userId: OWNER, role } };
  },
}));
jest.mock('@/lib/featureFlags/featureFlagService', () => ({
  isEnabled: async () => flagOn,
  getCurrentEnvironment: () => 'development',
}));
jest.mock('@/lib/supabase-server', () => ({ createServerSupabase: () => fake.db }));
jest.mock('@/lib/portal/portalToken', () => ({ getOrCreatePortalToken: async () => 'c'.repeat(64) }));
jest.mock('@/lib/shops/mergedScope', () => ({ mergedShopScope: async (_db: unknown, id: string) => (id === L2 ? [L2, D1] : [id]) }));

import { POST as send } from '../send/route';
import { GET as getConn, PUT as putConn } from '../connection/route';
import { POST as signup } from '../embedded-signup/route';
import { POST as sandbox } from '../sandbox/route';
import { GET as hookGet, POST as hookPost } from '../../webhooks/whatsapp/route';
import { encryptToken } from '@/lib/whatsapp/tokenCrypto';

function seed() {
  return createFakeDb({
    whatsapp_connections: [{ shop_id: L2, status: 'connected', mode: 'sandbox', onboarding_type: 'sandbox_test_number', enabled: true, automations_enabled: false, automation_settings: {}, waba_id: '2222222222', phone_number_id: '1111111111', sandbox_recipients: [PHONE], is_on_biz_app: false, platform_type: 'CLOUD_API', attestations: {} }],
    whatsapp_connection_secrets: [{ shop_id: L2, access_token_enc: encryptToken('test-token'), token_kind: 'sandbox_temporary', token_expires_at: null }],
    whatsapp_templates: Object.values(TEMPLATES).map(t => ({ shop_id: L2, name: t.name, language: 'en', status: 'APPROVED' })),
    whatsapp_consents: [{ shop_id: L2, phone_digits: PHONE, status: 'opted_in', source: 'staff_verbal' }],
    customers: [{ id: 'C-D1', name: 'Synthetic', phone: '020 5555 1234', shop_id: D1 }],
    invoices: [{ number: 'INV-D1-1', customer: 'Synthetic', customer_id: 'C-D1', currency: 'USD', lines: [{ qty: 1, rate: 10 }], discount: 0, shop_supplies: 0, tax_rate: 0, status: 'Sent', vehicle: 'Hilux', shop_id: D1 }],
    shop_settings: [{ shop_id: L2, company_name: 'D1 Imports' }],
    shops: [{ id: L2, name: 'D1 Imports' }],
  });
}

const reqOf = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });

let rid = 0;
const sendBody = (over: Record<string, unknown> = {}) => ({
  shopId: L2, resourceType: 'invoice', resourceId: 'INV-D1-1', language: 'en',
  clientRequestId: `00000000-0000-4000-8000-${String(++rid).padStart(12, '0')}`, ...over,
});

beforeEach(() => { fake = seed(); role = 'owner'; flagOn = true; });

describe('POST /api/whatsapp/send', () => {
  it('sends for an advisor of the pilot shop and records a delivery row', async () => {
    role = 'advisor';
    const res = await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, message: { status: 'sent' } });
    expect(fake.tables.whatsapp_messages).toHaveLength(1);
  });

  it('rejects a caller-supplied recipient or text (strict body)', async () => {
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody({ to: '8562000000000' })))).status).toBe(400);
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody({ text: 'hi' })))).status).toBe(400);
    expect(fake.tables.whatsapp_messages).toHaveLength(0);
  });

  it('technicians cannot send', async () => {
    role = 'technician';
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody()))).status).toBe(403);
  });

  it('is unavailable (404) for any shop but the pilot, and when the flag is off', async () => {
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody({ shopId: OTHER })))).status).toBe(404);
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody({ shopId: D1 })))).status).toBe(404);
    flagOn = false;
    expect((await send(reqOf('/api/whatsapp/send', 'POST', sendBody()))).status).toBe(404);
    expect(fake.tables.whatsapp_messages).toHaveLength(0);
  });

  it('returns 409 with the earlier send for a duplicate', async () => {
    await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    const res = await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'duplicate', duplicate: { status: 'sent' } });
  });
});

describe('/api/whatsapp/connection', () => {
  it('gives non-owners only what the Send button needs', async () => {
    role = 'advisor';
    const body = await (await getConn(reqOf(`/api/whatsapp/connection?shopId=${L2}`, 'GET'))).json();
    expect(body).toEqual({ available: true, canSend: true, sendBlocker: null, mode: 'sandbox', status: 'connected', enabled: true });
  });

  it('never returns a token to the owner', async () => {
    const res = await getConn(reqOf(`/api/whatsapp/connection?shopId=${L2}`, 'GET'));
    const text = await res.text();
    expect(text).not.toContain('test-token');
    expect(text).not.toContain('v1:');
    expect(JSON.parse(text).connection.sandboxRecipients).toEqual(['+856 •••• 1234']);
  });

  it('live mode needs the exact phrase AND a coexistence connection', async () => {
    expect((await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, mode: 'live' }))).status).toBe(400);
    expect((await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, mode: 'live', liveConfirmation: 'SEND LIVE MESSAGES' }))).status).toBe(409);
    Object.assign(fake.tables.whatsapp_connections[0], { onboarding_type: 'coexistence', is_on_biz_app: true });
    const ok = await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, mode: 'live', liveConfirmation: 'SEND LIVE MESSAGES' }));
    expect(ok.status).toBe(200);
    expect(fake.tables.whatsapp_connections[0]).toMatchObject({ mode: 'live', live_approved_by: OWNER });
    // Back to sandbox revokes the approval.
    await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, mode: 'sandbox' }));
    expect(fake.tables.whatsapp_connections[0]).toMatchObject({ mode: 'sandbox', live_approved_by: null, live_approved_at: null });
  });

  it('only the owner changes settings; switching off also stops automations', async () => {
    role = 'manager';
    expect((await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, enabled: false }))).status).toBe(403);
    role = 'owner';
    fake.tables.whatsapp_connections[0].automations_enabled = true;
    await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, enabled: false }));
    expect(fake.tables.whatsapp_connections[0]).toMatchObject({ enabled: false, automations_enabled: false });
  });

  it('cannot switch on before connecting', async () => {
    fake.tables.whatsapp_connections[0].status = 'disconnected';
    expect((await putConn(reqOf('/api/whatsapp/connection', 'PUT', { shopId: L2, enabled: true }))).status).toBe(409);
  });
});

describe('onboarding', () => {
  it('Embedded Signup accepts only the coexistence finish event and stores nothing otherwise', async () => {
    const before = JSON.stringify(fake.tables.whatsapp_connections);
    const res = await signup(reqOf('/api/whatsapp/embedded-signup', 'POST', { shopId: L2, code: 'x'.repeat(20), event: 'FINISH', wabaId: '3333333333', phoneNumberId: '9999999999' }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(fake.tables.whatsapp_connections)).toBe(before);
  });

  it('Embedded Signup requires the checklist and a delivered sandbox test first', async () => {
    const res = await signup(reqOf('/api/whatsapp/embedded-signup', 'POST', { shopId: L2, code: 'x'.repeat(20), event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', wabaId: '3333333333', phoneNumberId: '9999999999' }));
    expect(res.status).toBe(409);
    expect(fake.tables.whatsapp_connections[0].phone_number_id).toBe('1111111111');
  });

  it('the sandbox path refuses a WhatsApp Business App number', async () => {
    const res = await sandbox(reqOf('/api/whatsapp/sandbox', 'POST', { shopId: L2, phoneNumberId: '9999999999', wabaId: '3333333333', accessToken: 'x'.repeat(30), tokenKind: 'sandbox_temporary' }));
    expect(res.status).toBe(409);
    expect(fake.tables.whatsapp_connections[0].phone_number_id).toBe('1111111111');
  });

  it('the sandbox path stores a test number switched off, with an encrypted token', async () => {
    fake.tables.whatsapp_connections.length = 0;
    fake.tables.whatsapp_connection_secrets.length = 0;
    const res = await sandbox(reqOf('/api/whatsapp/sandbox', 'POST', { shopId: L2, phoneNumberId: '1234567890', wabaId: '3333333333', accessToken: 'EAAG' + 'x'.repeat(30), tokenKind: 'sandbox_temporary' }));
    expect(res.status).toBe(200);
    expect(fake.tables.whatsapp_connections[0]).toMatchObject({ status: 'connected', enabled: false, mode: 'sandbox', onboarding_type: 'sandbox_test_number' });
    expect(String(fake.tables.whatsapp_connection_secrets[0].access_token_enc)).toMatch(/^v1:/);
    expect(String(fake.tables.whatsapp_connection_secrets[0].access_token_enc)).not.toContain('EAAG');
  });
});

describe('/api/webhooks/whatsapp', () => {
  const sign = (b: string) => `sha256=${createHmac('sha256', SECRET).update(b).digest('hex')}`;
  const statusPayload = (wamid: string, status: string) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '2222222222', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1111111111' }, statuses: [{ id: wamid, status, timestamp: '1760000000' }] } }] }] });

  it('answers the verification handshake only with the right token', async () => {
    const ok = await hookGet(reqOf('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345', 'GET'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('12345');
    expect(fake.tables.whatsapp_connections[0].webhook_verified_at).toBeTruthy();
    expect((await hookGet(reqOf('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1', 'GET'))).status).toBe(403);
  });

  it('rejects an unsigned or mis-signed POST and changes nothing', async () => {
    await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    const wamid = String(fake.tables.whatsapp_messages[0].wamid);
    const body = statusPayload(wamid, 'read');
    expect((await hookPost(reqOf('/api/webhooks/whatsapp', 'POST', body))).status).toBe(401);
    expect((await hookPost(reqOf('/api/webhooks/whatsapp', 'POST', body, { 'x-hub-signature-256': sign(body + 'x') }))).status).toBe(401);
    expect(fake.tables.whatsapp_messages[0].status).toBe('sent');
  });

  it('applies delivery statuses forward only', async () => {
    await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    const wamid = String(fake.tables.whatsapp_messages[0].wamid);
    for (const s of ['read', 'delivered']) {
      const body = statusPayload(wamid, s);
      expect((await hookPost(reqOf('/api/webhooks/whatsapp', 'POST', body, { 'x-hub-signature-256': sign(body) }))).status).toBe(200);
    }
    expect(fake.tables.whatsapp_messages[0]).toMatchObject({ status: 'read', read_at: expect.any(String) });
  });

  it('records STOP as an opt-out, after which sending is refused', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '2222222222', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1111111111' }, messages: [{ from: PHONE, type: 'text', text: { body: 'STOP' }, timestamp: '1760000000' }] } }] }] });
    expect((await hookPost(reqOf('/api/webhooks/whatsapp', 'POST', body, { 'x-hub-signature-256': sign(body) }))).status).toBe(200);
    expect(fake.tables.whatsapp_consents[0]).toMatchObject({ status: 'opted_out', source: 'inbound_keyword' });
    expect(fake.tables.whatsapp_consent_events).toHaveLength(1);
    const res = await send(reqOf('/api/whatsapp/send', 'POST', sendBody()));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'opted_out' });
  });

  it('a partner-removed account event switches sending off', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '2222222222', changes: [{ field: 'account_update', value: { event: 'PARTNER_REMOVED' } }] }] });
    await hookPost(reqOf('/api/webhooks/whatsapp', 'POST', body, { 'x-hub-signature-256': sign(body) }));
    expect(fake.tables.whatsapp_connections[0]).toMatchObject({ status: 'needs_attention', enabled: false, last_account_event: 'PARTNER_REMOVED' });
  });
});
