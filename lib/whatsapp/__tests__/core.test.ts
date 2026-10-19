/**
 * Pure WhatsApp modules: phone normalization, templates, webhook parsing and
 * signatures, status precedence, eligibility, entitlements, dedupe keys,
 * token encryption, and the fake database's own schema guard.
 */
import { createHmac } from 'node:crypto';
import { normalizePhone, maskPhone } from '../phone';
import { TEMPLATES, TEMPLATE_LANGUAGES, buildTemplateMessage, buildTemplateSubmission, cleanParam, renderPreview, REPAIR_STAGE_TEXT } from '../templates';
import { verifySignature, parseWebhook, shouldApplyStatus, detectKeyword, type DeliveryStatus } from '../webhook';
import { evaluateEligibility, readyToConnect, compareVersions } from '../eligibility';
import { resolveWhatsAppEntitlement } from '@/config/whatsappEntitlements';
import { dedupeKey, resendKey } from '../dedupe';
import { isWhatsAppPilotShop, D1_MERGED_SHOP_ID, D1_ARCHIVED_SHOP_ID, transportMode } from '../config';
import { createFakeDb, migrationColumns } from './fakeDb';

describe('normalizePhone', () => {
  it.each([
    ['020 5555 1234', '8562055551234'],
    ['+856 20 5555 1234', '8562055551234'],
    ['856-20-55551234', '8562055551234'],
    ['00856 20 5555 1234', '8562055551234'],
    ['+66 81 234 5678', '66812345678'],
    ['66812345678', '66812345678'],
  ])('%s → %s', (raw, digits) => expect(normalizePhone(raw)?.e164Digits).toBe(digits));

  it.each(['', '   ', 'call after 5', '12345', '5555 1234', '+1234567890123456', null, undefined])('rejects %p', raw => {
    expect(normalizePhone(raw as string)).toBeNull();
  });

  it('masks to the last four digits', () => {
    expect(maskPhone('8562055551234')).toBe('+856 •••• 1234');
    expect(maskPhone('66812345678')).toBe('+66 •••• 5678');
  });
});

describe('templates', () => {
  const defs = Object.values(TEMPLATES);

  it('follow Meta naming and placeholder rules in every language', () => {
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z0-9_]+$/);
      for (const lang of TEMPLATE_LANGUAGES) {
        const body = d.body[lang];
        const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
        expect(nums).toEqual(d.params.map((_, i) => i + 1));
        expect(body.trim().startsWith('{{')).toBe(false);
        expect(body.trim().endsWith('}}')).toBe(false);
        expect(d.examples[lang]).toHaveLength(d.params.length);
      }
    }
  });

  it('every repair stage has text in both languages', () => {
    for (const s of ['checked_in', 'inspecting', 'waiting_parts', 'in_repair', 'quality_check', 'ready']) {
      expect(REPAIR_STAGE_TEXT[s].en).toBeTruthy();
      expect(REPAIR_STAGE_TEXT[s].lo).toBeTruthy();
    }
  });

  it('builds a send payload with the link only in the button, never in the body', () => {
    const t = buildTemplateMessage('invoice_ready', 'en', ['A', 'INV-1', 'Shop', 'Car', '$1.00'], 'a'.repeat(64));
    expect(t.name).toBe('redline_invoice_ready');
    expect(JSON.stringify(t.components[0])).not.toContain('a'.repeat(64));
    expect(t.components[1]).toEqual({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'a'.repeat(64) }] });
    expect(() => buildTemplateMessage('invoice_ready', 'en', ['A'], 'x')).toThrow();
    expect(() => buildTemplateMessage('invoice_ready', 'en', ['A', 'B', 'C', 'D', 'E'])).toThrow();
    expect(() => buildTemplateMessage('repair_update', 'en', ['A', 'B', 'C', 'D'], 'x')).toThrow();
  });

  it('cleans parameter values the way Meta requires', () => {
    expect(cleanParam('a\nb\tc')).toBe('a b c');
    expect(cleanParam('a      b')).toBe('a b');
    expect(cleanParam('')).toBe('-');
    expect(cleanParam('x'.repeat(300)).length).toBe(120);
  });

  it('submissions carry examples and a fixed portal base URL', () => {
    const s = buildTemplateSubmission('estimate_ready', 'en') as { category: string; components: Array<{ type: string; buttons?: Array<{ url: string }> }> };
    expect(s.category).toBe('UTILITY');
    const btn = s.components.find(c => c.type === 'BUTTONS')!.buttons![0];
    expect(btn.url).toMatch(/^https:\/\/[^/]+\/portal\/\{\{1\}\}$/);
  });

  it('renders the preview staff see', () => {
    expect(renderPreview('repair_update', 'en', ['Somchai', 'Hilux', 'D1 Imports', 'Ready'])).toContain('Hello Somchai, an update on your Hilux from D1 Imports: Ready.');
  });
});

describe('webhook', () => {
  const secret = 'test-app-secret';
  const sign = (body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('verifies X-Hub-Signature-256 and rejects anything else', () => {
    const body = '{"a":1}';
    expect(verifySignature(body, sign(body), secret)).toBe(true);
    expect(verifySignature(body + ' ', sign(body), secret)).toBe(false);
    expect(verifySignature(body, sign(body), 'other')).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, 'sha256=zz', secret)).toBe(false);
    expect(verifySignature(body, sign(body), '')).toBe(false);
  });

  it('reads statuses, keywords and account events; ignores coexistence echoes and history', () => {
    const p = parseWebhook({
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA1',
        changes: [
          { field: 'messages', value: { metadata: { phone_number_id: 'PN1' },
            statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1760000000' }, { id: 'wamid.2', status: 'failed', timestamp: '1760000001', errors: [{ code: 131026, title: 'Message undeliverable' }] }, { id: 'wamid.3', status: 'weird' }],
            messages: [{ from: '8562055551234', type: 'text', text: { body: ' STOP ' }, timestamp: '1760000002' }, { from: '8562099998888', type: 'text', text: { body: 'Can you stop by tomorrow?' } }] } },
          { field: 'smb_message_echoes', value: { message_echoes: [{ text: { body: 'private chat' } }] } },
          { field: 'history', value: {} },
          { field: 'account_update', value: { event: 'PARTNER_REMOVED' } },
        ],
      }],
    });
    expect(p.statuses).toEqual([
      expect.objectContaining({ wamid: 'wamid.1', status: 'delivered', phoneNumberId: 'PN1' }),
      expect.objectContaining({ wamid: 'wamid.2', status: 'failed', errorCode: '131026', errorTitle: 'Message undeliverable' }),
    ]);
    expect(p.keywords).toEqual([expect.objectContaining({ fromDigits: '8562055551234', keyword: 'opt_out' })]);
    expect(p.accountEvents).toEqual([{ wabaId: 'WABA1', event: 'PARTNER_REMOVED' }]);
    expect(p.ignored).toEqual({ smb_message_echoes: 1, history: 1 });
    expect(JSON.stringify(p)).not.toContain('private chat');
  });

  it('detects only exact keywords', () => {
    expect(detectKeyword('stop')).toBe('opt_out');
    expect(detectKeyword('Unsubscribe.')).toBe('opt_out');
    expect(detectKeyword('ຢຸດ')).toBe('opt_out');
    expect(detectKeyword('START')).toBe('opt_in');
    expect(detectKeyword('please stop the car')).toBeNull();
    expect(detectKeyword(42)).toBeNull();
  });

  it('never moves a message status backwards', () => {
    const t = (a: DeliveryStatus, b: DeliveryStatus) => shouldApplyStatus(a, b);
    expect(t('pending', 'sent')).toBe(true);
    expect(t('sent', 'delivered')).toBe(true);
    expect(t('delivered', 'read')).toBe(true);
    expect(t('read', 'delivered')).toBe(false);
    expect(t('delivered', 'sent')).toBe(false);
    expect(t('sent', 'failed')).toBe(true);
    expect(t('delivered', 'failed')).toBe(false);
    expect(t('failed', 'delivered')).toBe(false);
    expect(t('sent', 'sent')).toBe(false);
  });
});

describe('eligibility', () => {
  const server = { appId: true, embeddedSignupConfigId: true, appSecret: true, webhookVerifyToken: true, tokenEncryptionKey: true };
  const all = { appVersionOk: true, onBusinessApp: true, limitationsAccepted: true, keepAppActive: true, paymentMethodAdded: true };

  it('is ready for a Lao number with every attestation and server setting', () => {
    const items = evaluateEligibility({ businessPhoneDigits: '8562055551234', attestations: all, server, webhookVerified: true });
    expect(items.find(i => i.key === 'country')!.status).toBe('pass');
    expect(readyToConnect(items)).toBe(true);
  });

  it('blocks reported-excluded countries, missing attestations and missing server settings', () => {
    expect(readyToConnect(evaluateEligibility({ businessPhoneDigits: '2348012345678', attestations: all, server, webhookVerified: true }))).toBe(false);
    expect(readyToConnect(evaluateEligibility({ businessPhoneDigits: '8562055551234', attestations: { ...all, limitationsAccepted: undefined }, server, webhookVerified: true }))).toBe(false);
    const items = evaluateEligibility({ businessPhoneDigits: '8562055551234', attestations: all, server: { ...server, appSecret: false }, webhookVerified: true });
    expect(items.find(i => i.key === 'server_config')).toMatchObject({ status: 'fail', detail: expect.stringContaining('WHATSAPP_APP_SECRET') });
  });

  it('fails the coexistence check when Meta says the number is not on the Business App', () => {
    const items = evaluateEligibility({ businessPhoneDigits: '8562055551234', attestations: all, server, webhookVerified: true, phoneStatus: { isOnBizApp: false, platformType: 'CLOUD_API' } });
    expect(items.find(i => i.key === 'coexistence_active')!.status).toBe('fail');
  });

  it('compares app versions numerically', () => {
    expect(compareVersions('2.24.17', '2.24.17')).toBe(0);
    expect(compareVersions('2.25.1', '2.24.17')).toBe(1);
    expect(compareVersions('2.24.9', '2.24.17')).toBe(-1);
  });
});

describe('pilot, entitlements, dedupe', () => {
  it('only the merged D1 Imports shop is a pilot shop', () => {
    expect(isWhatsAppPilotShop(D1_MERGED_SHOP_ID)).toBe(true);
    expect(isWhatsAppPilotShop(D1_ARCHIVED_SHOP_ID)).toBe(false);
    expect(isWhatsAppPilotShop('eeeeeeee-0000-4000-8000-00000000000e')).toBe(false);
    expect(isWhatsAppPilotShop('')).toBe(false);
  });

  it('entitlement: internal always; Professional+ by plan; add-on for lower plans; not purchasable while billing is off', () => {
    expect(resolveWhatsAppEntitlement({ internal: true, planId: 'solo' })).toMatchObject({ entitled: true, reason: 'internal' });
    expect(resolveWhatsAppEntitlement({ internal: false, planId: 'professional' })).toMatchObject({ entitled: true, reason: 'plan' });
    expect(resolveWhatsAppEntitlement({ internal: false, planId: 'business' })).toMatchObject({ entitled: true, reason: 'plan' });
    expect(resolveWhatsAppEntitlement({ internal: false, planId: 'starter', activeAddons: ['whatsapp_business_addon'] })).toMatchObject({ entitled: true, reason: 'addon' });
    const no = resolveWhatsAppEntitlement({ internal: false, planId: 'starter' });
    expect(no).toMatchObject({ entitled: false, upgrade: { addonPurchasable: false } });
  });

  it('dedupe keys depend on content, not on the request; resend keys are unique', () => {
    const base = { shopId: 's', resourceType: 'invoice', resourceId: 'INV-1', templateName: 't', phoneDigits: '8562055551234', fingerprint: 'Sent|$1' };
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, fingerprint: 'Paid|$1' }));
    expect(resendKey(dedupeKey(base), 'a')).not.toBe(resendKey(dedupeKey(base), 'b'));
  });

  it('refuses the mock transport on a production deployment', () => {
    const env = { ...process.env };
    process.env.WHATSAPP_TRANSPORT = 'mock';
    process.env.VERCEL_ENV = 'production';
    expect(transportMode()).toBe('cloud');
    process.env.VERCEL_ENV = 'preview';
    expect(transportMode()).toBe('mock');
    process.env = env;
  });
});

describe('token encryption', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.resetModules(); });

  it('round-trips, detects tampering, and refuses without a 32-byte key', async () => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const { encryptToken, decryptToken, TokenKeyMissingError } = await import('../tokenCrypto');
    const enc = encryptToken('EAAG-secret-token');
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain('EAAG');
    expect(decryptToken(enc)).toBe('EAAG-secret-token');
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptToken(parts.join(':'))).toThrow();
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => encryptToken('x')).toThrow(TokenKeyMissingError);
  });
});

describe('fake database is schema-faithful', () => {
  it('parses every WhatsApp table from the migration', () => {
    expect(Object.keys(migrationColumns()).sort()).toEqual([
      'whatsapp_connection_secrets', 'whatsapp_connections', 'whatsapp_consent_events', 'whatsapp_consents', 'whatsapp_messages', 'whatsapp_templates',
    ]);
    expect(migrationColumns().whatsapp_messages).toEqual(expect.arrayContaining(['dedupe_key', 'client_request_id', 'wamid', 'resource_shop_id']));
  });

  it('rejects a column production or the migration does not have', async () => {
    const { db } = createFakeDb({});
    expect((await db.from('vehicles').select('license_plate').maybeSingle()).error).toMatchObject({ code: '42703' });
    expect((await db.from('whatsapp_messages').select('phone').maybeSingle()).error).toMatchObject({ code: '42703' });
  });
});
