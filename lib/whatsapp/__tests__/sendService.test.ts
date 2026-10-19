/**
 * The send path, end to end against a schema-faithful fake database and the
 * mock transport: every gate, the merged-shop scope, consent, duplicates,
 * delivery rows. Synthetic data only.
 */
import { createFakeDb } from './fakeDb';
import { createMockTransport } from '../cloudApi';
import { sendDocumentMessage, type SendDeps, type SendRequest } from '../sendService';
import { TEMPLATES } from '../templates';

const L2 = '90b72748-bf01-4456-999f-f4ba48091606';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const OTHER = 'eeeeeeee-0000-4000-8000-00000000000e';
const PHONE_A = '8562055551234';
const PHONE_B = '8562099998888';
const USER = 'a0000000-0000-4000-8000-000000000001';

function seed(overrides: Partial<Record<string, unknown>> = {}) {
  const approved = Object.values(TEMPLATES).map(t => ({ shop_id: L2, name: t.name, language: 'en', status: 'APPROVED' }));
  return {
    whatsapp_connections: [{
      shop_id: L2, status: 'connected', mode: 'sandbox', onboarding_type: 'sandbox_test_number', enabled: true,
      automations_enabled: false, automation_settings: {}, waba_id: '2222222222', phone_number_id: '1111111111',
      sandbox_recipients: [PHONE_A, PHONE_B], is_on_biz_app: false, platform_type: 'CLOUD_API',
      live_approved_at: null, live_approved_by: null, ...((overrides.connection as object) ?? {}),
    }],
    whatsapp_connection_secrets: [{ shop_id: L2, access_token_enc: 'v1:enc', token_kind: 'sandbox_temporary', token_expires_at: null, ...((overrides.secret as object) ?? {}) }],
    whatsapp_templates: (overrides.templates as unknown[]) ?? approved,
    whatsapp_consents: (overrides.consents as unknown[]) ?? [
      { shop_id: L2, phone_digits: PHONE_A, status: 'opted_in', source: 'staff_verbal' },
    ],
    whatsapp_consent_events: [],
    whatsapp_messages: [],
    customers: [
      { id: 'C-D1', name: 'Synthetic D1 Customer', phone: '020 5555 1234', shop_id: D1 },
      { id: 'C-L2', name: 'Synthetic L2 Customer', phone: '+856 20 9999 8888', shop_id: L2 },
      { id: 'C-X', name: 'Other Tenant', phone: '+856 20 1111 2222', shop_id: OTHER },
      { id: 'C-NOPHONE', name: 'No Phone', phone: '', shop_id: L2 },
    ],
    invoices: [
      // Historical D1 invoice: lives in the archived merged shop.
      { number: 'INV-D1-0007', customer: 'Synthetic D1 Customer', customer_id: 'C-D1', currency: 'USD', lines: [{ qty: 1, rate: 100 }], discount: 0, shop_supplies: 0, tax_rate: 0.0635, status: 'Sent', vehicle: '2019 Toyota Hilux', shop_id: D1 },
      // New invoice in the merged shop for a customer created before the merge.
      { number: 'INV-L2-0100', customer: 'Synthetic D1 Customer', customer_id: 'C-D1', currency: 'USD', lines: [{ qty: 2, rate: 50 }], discount: 0, shop_supplies: 0, tax_rate: 0, status: 'Sent', vehicle: '2019 Toyota Hilux', shop_id: L2 },
      { number: 'INV-OTHER', customer: 'Other Tenant', customer_id: 'C-X', currency: 'USD', lines: [], discount: 0, shop_supplies: 0, tax_rate: 0, status: 'Sent', vehicle: 'x', shop_id: OTHER },
      { number: 'INV-NOCUST', customer: 'Walk-in', customer_id: null, currency: 'USD', lines: [], discount: 0, shop_supplies: 0, tax_rate: 0, status: 'Sent', vehicle: 'x', shop_id: L2 },
    ],
    estimates: [
      { id: 'E-L2-1', estimate_number: 'EST-0050', customer_id: 'C-L2', customer_name: 'Synthetic L2 Customer', currency: 'LAK', lines: [{ qty: 1, rate: 1500000 }], discount: 0, tax_rate: 0, status: 'Sent', vehicle: 'Ford Ranger', shop_id: L2 },
      { id: 'E-NOPHONE', estimate_number: 'EST-0051', customer_id: 'C-NOPHONE', customer_name: 'No Phone', currency: 'USD', lines: [], discount: 0, tax_rate: 0, status: 'Sent', vehicle: 'x', shop_id: L2 },
    ],
    job_cards: [
      { id: 'JC-1', customer: 'Synthetic L2 Customer', vehicle: 'Ford Ranger', customer_phone: '', repair_stage: 'ready', status: 'Open', shop_id: L2 },
      { id: 'JC-D1', customer: 'Synthetic D1 Customer', vehicle: 'Hilux', customer_phone: '020 5555 1234', repair_stage: 'in_repair', status: 'Open', shop_id: D1 },
    ],
    repair_orders: [{ id: 'RO-1', job_card_id: 'JC-1', customer_id: 'C-L2', shop_id: L2 }],
  };
}

function setup(overrides: Partial<Record<string, unknown>> = {}, depOverrides: Partial<SendDeps> = {}) {
  const fake = createFakeDb(seed(overrides) as never);
  const transport = createMockTransport({ failSendsTo: (overrides.failTo as string[]) ?? [] });
  const portalCalls: string[] = [];
  const deps: SendDeps = {
    db: fake.db,
    transport,
    decryptToken: () => 'decrypted-token',
    portalToken: async (id: string) => { portalCalls.push(id); return 'f'.repeat(64); },
    scope: async (shopId: string) => (shopId === L2 ? [L2, D1] : [shopId]),
    shopName: async () => 'D1 Imports',
    liveSendingEnv: false,
    ...depOverrides,
  };
  return { fake, transport, deps, portalCalls };
}

let n = 0;
const req = (over: Partial<SendRequest> = {}): SendRequest => ({
  shopId: L2, userId: USER, resourceType: 'invoice', resourceId: 'INV-D1-0007', language: 'en',
  clientRequestId: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, trigger: 'manual', ...over,
});

describe('sendDocumentMessage — happy path and merged-shop scope', () => {
  it('sends a historical D1 invoice from the merged shop with server-derived content and a secure link', async () => {
    const { deps, transport, fake, portalCalls } = setup();
    const out = await sendDocumentMessage(deps, req());
    expect(out).toMatchObject({ ok: true, message: { status: 'sent', mode: 'sandbox', toMasked: '+856 •••• 1234' } });
    expect(transport.sent).toHaveLength(1);
    const sent = transport.sent[0] as { to: string; template: { name: string; components: Array<{ type: string; parameters: Array<{ text: string }> }> } };
    expect(sent.to).toBe(PHONE_A);
    expect(sent.template.name).toBe('redline_invoice_ready');
    const body = sent.template.components[0].parameters.map(p => p.text);
    // Total computed on the server: 100 + 6.35% tax.
    expect(body).toEqual(['Synthetic D1 Customer', 'INV-D1-0007', 'D1 Imports', '2019 Toyota Hilux', '$106.35']);
    expect(sent.template.components[1]).toMatchObject({ type: 'button', sub_type: 'url', parameters: [{ text: 'f'.repeat(64) }] });
    expect(portalCalls).toEqual(['C-D1']);
    const row = fake.tables.whatsapp_messages[0];
    expect(row).toMatchObject({ shop_id: L2, resource_shop_id: D1, resource_type: 'invoice', status: 'sent', wamid: 'wamid.MOCK000001', trigger: 'manual', sent_by: USER });
    expect(row.dedupe_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sends an estimate in Lao with the LAK total', async () => {
    const { deps, transport } = setup({
      templates: Object.values(TEMPLATES).map(t => ({ shop_id: L2, name: t.name, language: 'lo', status: 'APPROVED' })),
      consents: [{ shop_id: L2, phone_digits: PHONE_B, status: 'opted_in', source: 'staff_written' }],
    });
    const out = await sendDocumentMessage(deps, req({ resourceType: 'estimate', resourceId: 'E-L2-1', language: 'lo' }));
    expect(out.ok).toBe(true);
    const t = (transport.sent[0] as { template: { language: { code: string }; components: Array<{ parameters: Array<{ text: string }> }> } }).template;
    expect(t.language.code).toBe('lo');
    expect(t.components[0].parameters[4].text).toMatch(/1,500,000/);
  });

  it('sends a repair update for a job card, resolving the customer through its repair order', async () => {
    const { deps, transport } = setup({ consents: [{ shop_id: L2, phone_digits: PHONE_B, status: 'opted_in', source: 'staff_verbal' }] });
    const out = await sendDocumentMessage(deps, req({ resourceType: 'job', resourceId: 'JC-1' }));
    expect(out.ok).toBe(true);
    const t = (transport.sent[0] as { to: string; template: { name: string; components: unknown[] } });
    expect(t.to).toBe(PHONE_B);
    expect(t.template.name).toBe('redline_repair_update');
    expect(t.template.components).toHaveLength(1); // no link button
  });

  it('treats a document of another tenant as not found', async () => {
    const { deps, transport } = setup();
    const out = await sendDocumentMessage(deps, req({ resourceId: 'INV-OTHER' }));
    expect(out).toMatchObject({ ok: false, code: 'not_found', httpStatus: 404 });
    expect(transport.sent).toHaveLength(0);
  });
});

describe('sendDocumentMessage — gates', () => {
  it.each([
    ['no connection', { connection: { status: 'not_connected' } }, 'not_connected'],
    ['master switch off', { connection: { enabled: false } }, 'disabled'],
  ])('%s', async (_l, overrides, code) => {
    const { deps, transport } = setup(overrides);
    const out = await sendDocumentMessage(deps, req());
    expect(out).toMatchObject({ ok: false, code });
    expect(transport.sent).toHaveLength(0);
  });

  it('live mode refuses without the deployment switch, even with owner approval', async () => {
    const { deps, transport } = setup({ connection: { mode: 'live', onboarding_type: 'coexistence', is_on_biz_app: true, live_approved_at: '2026-10-19T00:00:00Z', live_approved_by: USER } });
    const out = await sendDocumentMessage(deps, req());
    expect(out).toMatchObject({ ok: false, code: 'live_not_approved' });
    expect(transport.sent).toHaveLength(0);
  });

  it('live mode refuses when Meta no longer reports coexistence', async () => {
    const { deps } = setup({ connection: { mode: 'live', onboarding_type: 'coexistence', is_on_biz_app: false, live_approved_at: '2026-10-19T00:00:00Z', live_approved_by: USER } }, { liveSendingEnv: true });
    expect(await sendDocumentMessage(deps, req())).toMatchObject({ ok: false, code: 'live_not_approved' });
  });

  it('live mode sends to any opted-in number once approved, coexistent and env-enabled', async () => {
    const { deps, transport } = setup({ connection: { mode: 'live', onboarding_type: 'coexistence', is_on_biz_app: true, sandbox_recipients: [], live_approved_at: '2026-10-19T00:00:00Z', live_approved_by: USER } }, { liveSendingEnv: true });
    expect(await sendDocumentMessage(deps, req())).toMatchObject({ ok: true, message: { mode: 'live' } });
    expect(transport.sent).toHaveLength(1);
  });

  it('sandbox mode never messages a number that is not a listed test recipient', async () => {
    const { deps, transport } = setup({ connection: { sandbox_recipients: [PHONE_B] } });
    expect(await sendDocumentMessage(deps, req())).toMatchObject({ ok: false, code: 'sandbox_recipient_not_allowed' });
    expect(transport.sent).toHaveLength(0);
  });

  it('refuses without a usable phone number', async () => {
    const { deps } = setup();
    expect(await sendDocumentMessage(deps, req({ resourceType: 'estimate', resourceId: 'E-NOPHONE' }))).toMatchObject({ ok: false, code: 'no_phone' });
  });

  it('requires consent; a manual send may record it, and it lands in the append-only log', async () => {
    const { deps, fake, transport } = setup({ consents: [] });
    expect(await sendDocumentMessage(deps, req())).toMatchObject({ ok: false, code: 'consent_required' });
    expect(transport.sent).toHaveLength(0);
    const out = await sendDocumentMessage(deps, req({ recordConsent: { source: 'staff_verbal', note: 'At the counter' } }));
    expect(out.ok).toBe(true);
    expect(fake.tables.whatsapp_consents[0]).toMatchObject({ phone_digits: PHONE_A, status: 'opted_in', source: 'staff_verbal', recorded_by: USER });
    expect(fake.tables.whatsapp_consent_events).toHaveLength(1);
  });

  it('an opt-out is final, even with inline consent', async () => {
    const { deps, transport } = setup({ consents: [{ shop_id: L2, phone_digits: PHONE_A, status: 'opted_out', source: 'inbound_keyword' }] });
    const out = await sendDocumentMessage(deps, req({ recordConsent: { source: 'staff_verbal' } }));
    expect(out).toMatchObject({ ok: false, code: 'opted_out' });
    expect(transport.sent).toHaveLength(0);
  });

  it('requires the template to be APPROVED for the chosen language', async () => {
    const { deps } = setup();
    expect(await sendDocumentMessage(deps, req({ language: 'lo' }))).toMatchObject({ ok: false, code: 'template_not_approved' });
    const pending = setup({ templates: [{ shop_id: L2, name: 'redline_invoice_ready', language: 'en', status: 'PENDING' }] });
    expect(await sendDocumentMessage(pending.deps, req())).toMatchObject({ ok: false, code: 'template_not_approved' });
  });

  it('refuses a link the customer portal would not show (document and customer in different merged shops)', async () => {
    const { deps, transport } = setup();
    const out = await sendDocumentMessage(deps, req({ resourceId: 'INV-L2-0100' }));
    expect(out).toMatchObject({ ok: false, code: 'portal_link_unavailable' });
    expect(transport.sent).toHaveLength(0);
  });

  it('refuses an invoice with no customer record (no trusted recipient)', async () => {
    const { deps } = setup();
    expect(await sendDocumentMessage(deps, req({ resourceId: 'INV-NOCUST' }))).toMatchObject({ ok: false, code: 'no_phone' });
  });

  it('marks the row failed when the token has expired', async () => {
    const { deps, fake, transport } = setup({ secret: { token_expires_at: '2020-01-01T00:00:00Z' } });
    expect(await sendDocumentMessage(deps, req())).toMatchObject({ ok: false, code: 'token_unavailable' });
    expect(fake.tables.whatsapp_messages[0]).toMatchObject({ status: 'failed', error_code: 'token_unavailable' });
    expect(transport.sent).toHaveLength(0);
  });

  it('records Meta\'s refusal and frees the duplicate key for a retry', async () => {
    const { deps, fake } = setup({ failTo: [PHONE_A] });
    const first = await sendDocumentMessage(deps, req());
    expect(first).toMatchObject({ ok: false, code: 'send_failed' });
    expect(fake.tables.whatsapp_messages[0]).toMatchObject({ status: 'failed', error_code: '131026' });
    // Same content, new dialog: allowed, because the failed row does not hold the key.
    const retry = await sendDocumentMessage({ ...deps, transport: createMockTransport() }, req());
    expect(retry.ok).toBe(true);
  });
});

describe('sendDocumentMessage — duplicate prevention', () => {
  it('replays the same dialog request instead of sending twice', async () => {
    const { deps, transport } = setup();
    const r = req();
    const a = await sendDocumentMessage(deps, r);
    const b = await sendDocumentMessage(deps, r);
    expect(a.ok && b.ok).toBe(true);
    expect(b).toMatchObject({ replay: true });
    expect(transport.sent).toHaveLength(1);
  });

  it('refuses unchanged content from a new dialog, until staff confirm a resend', async () => {
    const { deps, transport } = setup();
    await sendDocumentMessage(deps, req());
    const dup = await sendDocumentMessage(deps, req());
    expect(dup).toMatchObject({ ok: false, code: 'duplicate', httpStatus: 409, duplicate: { status: 'sent' } });
    const again = await sendDocumentMessage(deps, req({ confirmResend: true }));
    expect(again.ok).toBe(true);
    expect(transport.sent).toHaveLength(2);
  });

  it('allows a new send when the document changed', async () => {
    const { deps, fake, transport } = setup();
    await sendDocumentMessage(deps, req());
    fake.tables.invoices[0].status = 'Paid';
    expect((await sendDocumentMessage(deps, req())).ok).toBe(true);
    expect(transport.sent).toHaveLength(2);
  });

  it('a different language is still the same message', async () => {
    const both = Object.values(TEMPLATES).flatMap(t => ['en', 'lo'].map(language => ({ shop_id: L2, name: t.name, language, status: 'APPROVED' })));
    const { deps } = setup({ templates: both });
    await sendDocumentMessage(deps, req());
    expect(await sendDocumentMessage(deps, req({ language: 'lo' }))).toMatchObject({ ok: false, code: 'duplicate' });
  });

  it('fails a crashed pending attempt after the stale window so it stops blocking', async () => {
    const { deps, fake } = setup();
    await sendDocumentMessage(deps, req());
    const row = fake.tables.whatsapp_messages[0];
    row.status = 'pending'; row.wamid = null; row.created_at = '2026-01-01T00:00:00.000Z';
    expect((await sendDocumentMessage(deps, req())).ok).toBe(true);
    expect(row).toMatchObject({ status: 'failed', error_code: 'stale_pending' });
  });
});

describe('sendDocumentMessage — automated', () => {
  it('needs automations switched on, and never records consent itself', async () => {
    const off = setup({ consents: [] });
    expect(await sendDocumentMessage(off.deps, req({ trigger: 'automated' }))).toMatchObject({ ok: false, code: 'automations_disabled' });
    const on = setup({ consents: [], connection: { automations_enabled: true } });
    expect(await sendDocumentMessage(on.deps, req({ trigger: 'automated', recordConsent: { source: 'staff_verbal' } }))).toMatchObject({ ok: false, code: 'consent_required' });
    expect(on.fake.tables.whatsapp_consents).toHaveLength(0);
  });
});
