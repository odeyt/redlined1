/**
 * API v1 draft writes, end to end through withApi (PLAN.md phase 4, §8):
 * drafts only, convert only from Approved and only once, idempotent retries,
 * tenant isolation, no cost/markup in or out, audited with the key, and no
 * send or payment code reachable.
 */
import { hashApiKey } from '@/lib/api/principal';
import { createFakeDb } from './fakeDb';

const fake = createFakeDb();
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake }));
jest.mock('@/lib/observability/alerts', () => ({ alertException: jest.fn() }));

// Nothing that sends or takes money may be loaded by these routes at all.
const forbidden = jest.fn();
jest.mock('resend', () => { forbidden('resend'); return {}; }, { virtual: true });
jest.mock('@/lib/domain/payments', () => {
  const actual = jest.requireActual('@/lib/domain/payments');
  return {
    ...actual,
    createPaymentDomain: (deps: unknown) => {
      const real = actual.createPaymentDomain(deps);
      return {
        ...real,
        create: () => { forbidden('payments.create'); throw new Error('no'); },
        reverse: () => { forbidden('payments.reverse'); throw new Error('no'); },
        correct: () => { forbidden('payments.correct'); throw new Error('no'); },
      };
    },
  };
});

const ORG = 'org-1';
const SHOP = '90b72748-bf01-4456-999f-f4ba48091606';   // a D1 shop: THB default
const OTHER = 'shop-other';
const KEY_CRM = 'rl_live_' + '1'.repeat(32);            // read + write
const KEY_READONLY = 'rl_live_' + '2'.repeat(32);       // Wally Bot
const KEY_EST_ONLY = 'rl_live_' + '3'.repeat(32);       // estimates:write only

const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_2 = '55555555-5555-4555-8555-555555555555';
const FOREIGN_CUSTOMER = '66666666-6666-4666-8666-666666666666';
const VEHICLE = '77777777-7777-4777-8777-777777777777';
const VEHICLE_OF_2 = '88888888-8888-4888-8888-888888888888';
const SENT_EST = '99999999-9999-4999-8999-999999999999';
const APPROVED_EST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_DRAFT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_EST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function seed() {
  fake.reset();
  const t = fake.tables;
  t.api_keys = [
    { id: 'k-crm', name: 'RedlineD1 CRM', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_CRM),
      scopes: ['estimates:read', 'estimates:write', 'invoices:read', 'invoices:write', 'customers:read'] },
    { id: 'k-wally', name: 'Wally Bot', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_READONLY),
      scopes: ['customers:read', 'vehicles:read', 'estimates:read', 'invoices:read'] },
    { id: 'k-est', name: 'Estimator', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_EST_ONLY),
      scopes: ['estimates:read', 'estimates:write'] },
  ];
  t.shops = [{ id: SHOP, name: 'Location 2', organization_id: ORG }, { id: OTHER, name: 'Other', organization_id: 'org-2' }];
  t.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: true }];
  t.shop_settings = [{ shop_id: SHOP, default_tax_rate: 0.1 }];
  t.customers = [
    { id: CUSTOMER, shop_id: SHOP, name: 'Somchai' },
    { id: CUSTOMER_2, shop_id: SHOP, name: 'Noy' },
    { id: FOREIGN_CUSTOMER, shop_id: OTHER, name: 'Theirs' },
  ];
  t.vehicles = [
    { id: VEHICLE, shop_id: SHOP, customer_id: CUSTOMER, label: '2019 Toyota Hilux', vin: 'MR0HA3CD100000001' },
    { id: VEHICLE_OF_2, shop_id: SHOP, customer_id: CUSTOMER_2, label: '2020 Honda City' },
  ];
  t.estimates = [
    { id: SENT_EST, shop_id: SHOP, estimate_number: 'EST-0005', status: 'Sent', customer_id: CUSTOMER, customer_name: 'Somchai', vehicle: 'Hilux', currency: 'THB', discount: 0, tax_rate: 0, lines: [{ description: 'x', note: '', qty: 1, rate: 1 }], notes: '' },
    { id: APPROVED_EST, shop_id: SHOP, estimate_number: 'EST-0006', status: 'Approved', customer_id: CUSTOMER, customer_name: 'Somchai', vehicle: 'Hilux', currency: 'THB', discount: 50, shop_supplies: 0, tax_rate: 0.1, job_card_id: null,
      lines: [{ description: 'Pads', note: '', qty: 2, rate: 1000, cost: 400, markup: 1.5 }], notes: 'Front brakes' },
    { id: STAFF_DRAFT, shop_id: SHOP, estimate_number: 'EST-0007', status: 'Draft', customer_id: CUSTOMER, customer_name: 'Somchai', vehicle: 'Hilux', currency: 'THB', discount: 0, tax_rate: 0,
      lines: [{ description: 'Pads', note: '', qty: 1, rate: 1000, cost: 400 }], notes: '' },
    { id: FOREIGN_EST, shop_id: OTHER, estimate_number: 'EST-0001', status: 'Approved', customer_name: 'Theirs', currency: 'USD', lines: [] },
  ];
  t.invoices = [
    { number: 'INV-0050', shop_id: SHOP, status: 'Sent', customer: 'Somchai', customer_id: CUSTOMER, currency: 'THB', lines: [{ description: 'x', note: '', qty: 1, rate: 1 }] },
    { number: 'INV-0060', shop_id: OTHER, status: 'Draft', customer: 'Theirs', currency: 'USD', lines: [] },
  ];
  t.payments = [];
  forbidden.mockClear();
}

/* eslint-disable @typescript-eslint/no-require-imports */
const estimates = () => require('../estimates/route');
const estimate = () => require('../estimates/[id]/route');
const convert = () => require('../estimates/[id]/convert-to-invoice/route');
const invoices = () => require('../invoices/route');
const invoice = () => require('../invoices/[number]/route');
/* eslint-enable @typescript-eslint/no-require-imports */

type Handler = (r: Request) => Promise<Response>;

async function send(
  handler: Handler, method: string, path: string,
  { key = KEY_CRM, body, idem }: { key?: string; body?: unknown; idem?: string | null } = {},
) {
  const headers: Record<string, string> = { authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  if (idem) headers['idempotency-key'] = idem;
  const res = await handler(new Request('https://redlined1.test' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

const draftBody = {
  customer_id: CUSTOMER,
  vehicle_id: VEHICLE,
  lines: [{ description: 'Oil change', qty: 1, rate: 500 }, { description: 'Filter', qty: 1, rate: 20, currency: 'USD' }],
  notes: 'From the CRM',
};

const audits = () => fake.calls.rpc.filter(c => c.fn === 'record_audit_event');

beforeEach(seed);

describe('creating a draft estimate', () => {
  it('creates a Draft, numbered by the API function, with shop defaults', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'e-1' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      number: 'EST-0011', status: 'draft', customer_id: CUSTOMER, customer_name: 'Somchai',
      vehicle: '2019 Toyota Hilux', currency: 'THB', tax_rate: 0.1, discount: 0, created_via: 'api',
    });
    // 500 THB × 1.1; the USD line is reported, not added.
    expect(r.body.data.totals).toMatchObject({ subtotal: 500, total: 550, line_totals_by_currency: { THB: 500, USD: 20 } });

    const row = fake.tables.estimates.find(e => e.estimate_number === 'EST-0011')!;
    expect(row).toMatchObject({ status: 'Draft', shop_id: SHOP, created_via: 'api', created_by_api_key_id: 'k-crm' });
    expect(fake.calls.rpc.map(c => c.fn)).toContain('api_next_document_number');
    expect(fake.calls.rpc.map(c => c.fn)).not.toContain('next_document_number');
  });

  it('never puts the VIN in the document', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'e-vin' });
    expect(JSON.stringify(r.body)).not.toMatch(/MR0HA3CD/);
  });

  it('audits the write with the key that made it', async () => {
    await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'e-2' });
    const [entry] = audits();
    expect(entry.args).toMatchObject({ p_actor_type: 'api', p_action: 'estimate.created', p_shop_id: SHOP });
    expect(entry.args.p_metadata).toMatchObject({ api_client_id: 'k-crm', api_client_name: 'RedlineD1 CRM' });
  });

  it.each([
    ['a status', { status: 'Sent' }],
    ['a total', { total: 1 }],
    ['a discount', { discount: 10 }],
    ['a tax rate', { tax_rate: 0 }],
    ['a shop', { shop_id: OTHER }],
  ])('refuses a body that sets %s, creating nothing', async (_what, extra) => {
    const before = fake.tables.estimates.length;
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, ...extra }, idem: 'e-x' });
    expect(r.status).toBe(422);
    expect(fake.tables.estimates.length).toBe(before);
  });

  it('refuses line cost or markup', async () => {
    const body = { ...draftBody, lines: [{ description: 'x', qty: 1, rate: 1, cost: 0.5 }] };
    expect((await send(estimates().POST, 'POST', '/api/v1/estimates', { body, idem: 'e-c' })).status).toBe(422);
  });

  it('refuses a currency the forms do not offer', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, currency: 'EUR' }, idem: 'e-eur' });
    expect(r.status).toBe(422);
  });

  it('requires an Idempotency-Key', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: null });
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toMatch(/Idempotency-Key header is required/);
  });

  it('a retried request replays instead of creating a second estimate', async () => {
    const first = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'same' });
    const second = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'same' });
    expect(second.status).toBe(201);
    expect(second.body.meta.idempotent_replay).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(fake.tables.estimates.filter(e => e.created_via === 'api')).toHaveLength(1);
  });

  it('the same key with a different body is a conflict', async () => {
    await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'k' });
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, notes: 'other' }, idem: 'k' });
    expect(r.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('a failed create releases the key so a corrected retry works', async () => {
    const bad = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, customer_id: FOREIGN_CUSTOMER }, idem: 'retry' });
    expect(bad.status).toBe(404);
    const fixed = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, customer_id: FOREIGN_CUSTOMER }, idem: 'retry' });
    expect(fixed.status).toBe(404); // same body again: still not found, not "in progress"
  });

  it('another shop\'s customer is 404', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, customer_id: FOREIGN_CUSTOMER }, idem: 'f' });
    expect(r.status).toBe(404);
    expect(r.body.error.details.reason).toMatch(/customer_id/);
  });

  it('refuses another customer\'s vehicle', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { body: { ...draftBody, vehicle_id: VEHICLE_OF_2 }, idem: 'v' });
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toMatch(/different customer/);
  });

  it('a read-only key (Wally Bot) cannot write', async () => {
    const r = await send(estimates().POST, 'POST', '/api/v1/estimates', { key: KEY_READONLY, body: draftBody, idem: 'w' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SCOPE_REQUIRED');
  });

  it('is 404 with the flag off, writing nothing', async () => {
    fake.tables.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: false }];
    const before = fake.tables.estimates.length;
    expect((await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'off' })).status).toBe(404);
    expect(fake.tables.estimates.length).toBe(before);
  });
});

describe('editing an estimate', () => {
  async function created() {
    return (await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'base' })).body.data;
  }

  it('edits a draft it made', async () => {
    const { id } = await created();
    const r = await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${id}`, {
      body: { lines: [{ description: 'Brake fluid', qty: 2, rate: 150 }], notes: 'Updated' },
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'draft', notes: 'Updated', totals: { subtotal: 300 } });
  });

  it('refuses to edit a Sent estimate (409), changing nothing', async () => {
    const r = await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${SENT_EST}`, { body: { notes: 'sneaky' } });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ code: 'NOT_DRAFT' });
    expect(fake.tables.estimates.find(e => e.id === SENT_EST)!.notes).toBe('');
  });

  it('refuses to edit an Approved estimate', async () => {
    expect((await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${APPROVED_EST}`, { body: { notes: 'x' } })).status).toBe(409);
  });

  it('will not replace lines that carry the shop\'s cost data, but edits other fields', async () => {
    const lines = await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${STAFF_DRAFT}`, {
      body: { lines: [{ description: 'x', qty: 1, rate: 1 }] },
    });
    expect(lines.status).toBe(409);
    expect(lines.body.error.details.code).toBe('LINES_HAVE_COST_DATA');
    expect(fake.tables.estimates.find(e => e.id === STAFF_DRAFT)!.lines).toEqual([{ description: 'Pads', note: '', qty: 1, rate: 1000, cost: 400 }]);

    const notes = await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${STAFF_DRAFT}`, { body: { notes: 'Called customer' } });
    expect(notes.status).toBe(200);
  });

  it('refuses a status change in the body', async () => {
    const { id } = await created();
    expect((await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${id}`, { body: { status: 'Approved' } })).status).toBe(422);
  });

  it('another shop\'s estimate is 404', async () => {
    expect((await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${FOREIGN_EST}`, { body: { notes: 'x' } })).status).toBe(404);
  });

  it('checks a new vehicle against the draft\'s customer', async () => {
    const { id } = await created();
    const r = await send(estimate().PATCH, 'PATCH', `/api/v1/estimates/${id}`, { body: { vehicle_id: VEHICLE_OF_2 } });
    expect(r.status).toBe(422);
  });
});

describe('converting an estimate', () => {
  const path = (id: string) => `/api/v1/estimates/${id}/convert-to-invoice`;

  it('turns an Approved estimate into a Draft invoice linked to it', async () => {
    const r = await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'c-1' });
    expect(r.status).toBe(201);
    expect(r.body.data.estimate).toMatchObject({ id: APPROVED_EST, status: 'converted' });
    expect(r.body.data.invoice).toMatchObject({
      number: 'INV-0101', status: 'draft', estimate_id: APPROVED_EST, currency: 'THB', created_via: 'api',
      notes: 'Converted from EST-0006. Front brakes',
    });
    // Copied like the staff screen: discount and tax from the estimate.
    expect(r.body.data.invoice.totals).toMatchObject({ subtotal: 2000, discount: 50, total: 2145 });
    // Cost stays on the stored invoice line for the shop, never in the response.
    expect(JSON.stringify(r.body)).not.toMatch(/"cost"|"markup"/);
    expect(fake.tables.invoices.find(i => i.number === 'INV-0101')!.lines).toEqual(
      [{ description: 'Pads', note: '', qty: 2, rate: 1000, cost: 400, markup: 1.5 }]);
  });

  it('converts only once; a second attempt names the first invoice', async () => {
    await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'c-a' });
    const again = await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'c-b' });
    expect(again.status).toBe(409);
    expect(again.body.error.details).toMatchObject({ code: 'ALREADY_CONVERTED', invoice_number: 'INV-0101' });
    expect(fake.tables.invoices.filter(i => i.source_estimate_id === APPROVED_EST)).toHaveLength(1);
  });

  it('the database index stops a racing second invoice', async () => {
    // Simulate the race: another convert already wrote its invoice, but the
    // estimate still reads Approved.
    fake.tables.invoices.push({ number: 'INV-0099', shop_id: SHOP, status: 'Draft', source_estimate_id: APPROVED_EST, lines: [] });
    const r = await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'race' });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ code: 'ALREADY_CONVERTED', invoice_number: 'INV-0099' });
    expect(fake.tables.invoices.filter(i => i.source_estimate_id === APPROVED_EST)).toHaveLength(1);
  });

  it('refuses a Draft or Sent estimate', async () => {
    for (const id of [STAFF_DRAFT, SENT_EST]) {
      const r = await send(convert().POST, 'POST', path(id), { idem: 'n-' + id });
      expect(r.status).toBe(409);
      expect(r.body.error.details.code).toBe('NOT_APPROVED');
    }
    expect(fake.tables.invoices).toHaveLength(2);
  });

  it('needs invoices:write as well as estimates:write', async () => {
    const r = await send(convert().POST, 'POST', path(APPROVED_EST), { key: KEY_EST_ONLY, idem: 'scope' });
    expect(r.status).toBe(403);
    expect(fake.tables.estimates.find(e => e.id === APPROVED_EST)!.status).toBe('Approved');
  });

  it('another shop\'s estimate is 404', async () => {
    expect((await send(convert().POST, 'POST', path(FOREIGN_EST), { idem: 'f' })).status).toBe(404);
  });

  it('a retried convert replays, without a second invoice', async () => {
    const a = await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'same' });
    const b = await send(convert().POST, 'POST', path(APPROVED_EST), { idem: 'same' });
    expect(b.status).toBe(201);
    expect(b.body.meta.idempotent_replay).toBe(true);
    expect(b.body.data.invoice.number).toBe(a.body.data.invoice.number);
  });
});

describe('draft invoices', () => {
  it('creates a Draft invoice', async () => {
    const r = await send(invoices().POST, 'POST', '/api/v1/invoices', {
      body: { customer_id: CUSTOMER, lines: [{ description: 'Tyres', qty: 4, rate: 900 }], due_date: '2026-12-15' }, idem: 'i-1',
    });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'draft', number: 'INV-0101', due_date: '2026-12-15', amount_paid: 0, balance_due: 3960 });
    expect(fake.tables.invoices.find(i => i.number === 'INV-0101')).toMatchObject({ status: 'Draft', created_via: 'api' });
  });

  it('refuses to edit a Sent invoice', async () => {
    const r = await send(invoice().PATCH, 'PATCH', '/api/v1/invoices/INV-0050', { body: { notes: 'x' } });
    expect(r.status).toBe(409);
  });

  it('refuses a paid_date or status in the body', async () => {
    expect((await send(invoice().PATCH, 'PATCH', '/api/v1/invoices/INV-0050', { body: { paid_date: '2026-11-01' } })).status).toBe(422);
    expect((await send(invoice().PATCH, 'PATCH', '/api/v1/invoices/INV-0050', { body: { status: 'Paid' } })).status).toBe(422);
  });

  it('another shop\'s draft is 404', async () => {
    expect((await send(invoice().PATCH, 'PATCH', '/api/v1/invoices/INV-0060', { body: { notes: 'x' } })).status).toBe(404);
  });

  it('edits its own draft, audited strictly', async () => {
    const made = await send(invoices().POST, 'POST', '/api/v1/invoices', {
      body: { customer_id: CUSTOMER, lines: [{ description: 'Tyres', qty: 1, rate: 900 }] }, idem: 'i-2',
    });
    const r = await send(invoice().PATCH, 'PATCH', `/api/v1/invoices/${made.body.data.number}`, { body: { notes: 'Tyres fitted' } });
    expect(r.status).toBe(200);
    expect(r.body.data.notes).toBe('Tyres fitted');
    const updated = audits().find(a => a.args.p_action === 'invoice.updated')!;
    expect(updated.args.p_metadata).toMatchObject({ api_client_id: 'k-crm' });
  });
});

describe('nothing sends or takes money', () => {
  it('no write touched email, payments or approval', async () => {
    await send(estimates().POST, 'POST', '/api/v1/estimates', { body: draftBody, idem: 'z1' });
    await send(convert().POST, 'POST', `/api/v1/estimates/${APPROVED_EST}/convert-to-invoice`, { idem: 'z2' });
    await send(invoices().POST, 'POST', '/api/v1/invoices', { body: { customer_id: CUSTOMER, lines: [{ description: 'x', qty: 1, rate: 1 }] }, idem: 'z3' });
    expect(forbidden).not.toHaveBeenCalled();
    expect(fake.tables.payments).toHaveLength(0);
    // The only statuses written are Draft and Converted.
    const statuses = new Set([...fake.tables.estimates, ...fake.tables.invoices].map(r => r.status));
    expect([...statuses].sort()).toEqual(['Approved', 'Converted', 'Draft', 'Sent'].sort());
    expect(fake.tables.estimates.find(e => e.id === SENT_EST)!.status).toBe('Sent');
  });
});
