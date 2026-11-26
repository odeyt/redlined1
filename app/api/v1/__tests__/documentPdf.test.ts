/**
 * API v1 estimate/invoice PDFs, end to end (PLAN.md phase 5).
 */
import { inflateSync } from 'zlib';
import { hashApiKey } from '@/lib/api/principal';
import { estimatePdfInput, invoicePdfInput, pdfFilename } from '@/lib/api/pdf';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { mapEstimateRow } from '@/lib/domain/estimates';
import { mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { createFakeDb } from './fakeDb';

const fake = createFakeDb();
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake, getServerDb: async () => fake }));
jest.mock('@/lib/observability/alerts', () => ({ alertException: jest.fn() }));
const sent = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: sent } })) }));

const ORG = 'org-1';
const SHOP = 'shop-trial';         // not a D1 shop
const D1 = '90b72748-bf01-4456-999f-f4ba48091606';
const OTHER = 'shop-other';
const KEY_PDF = 'rl_live_' + 'p'.repeat(32);
const KEY_NO_PDF = 'rl_live_' + 'q'.repeat(32);
const KEY_D1 = 'rl_live_' + 'r'.repeat(32);
const DRAFT = '11111111-1111-4111-8111-111111111111';
const SENT = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const D1_EST = '44444444-4444-4444-8444-444444444444';

function seed(identityComplete = true) {
  fake.reset();
  const t = fake.tables;
  t.api_keys = [
    { id: 'k1', name: 'CRM', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_PDF), scopes: ['estimates:read', 'invoices:read', 'pdf:read'] },
    { id: 'k2', name: 'Data only', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_NO_PDF), scopes: ['estimates:read', 'invoices:read'] },
    { id: 'k3', name: 'D1', organization_id: ORG, shop_id: D1, revoked_at: null, key_hash: hashApiKey(KEY_D1), scopes: ['estimates:read', 'pdf:read'] },
  ];
  t.shops = [
    { id: SHOP, name: 'Trial Garage', organization_id: ORG },
    { id: D1, name: 'D1 Imports', organization_id: ORG },
    { id: OTHER, name: 'Other', organization_id: 'org-2' },
  ];
  t.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: true }];
  t.shop_settings = [
    { shop_id: SHOP, company_name: identityComplete ? 'Trial Garage' : '', address: 'Vientiane', phone: '020 1', email: 'g@x.la' },
    { shop_id: D1, company_name: 'D1 Imports', address: 'Vientiane', phone: '020 2', email: '' },
  ];
  t.shop_users = [{ shop_id: SHOP, user_id: 'owner-1', role: 'owner' }];
  t.profiles = [{ id: 'owner-1', plan: 'free', trial_ends_at: null }];
  const est = { customer_name: 'Somchai', vehicle: 'Hilux', currency: 'USD', discount: 0, tax_rate: 0, notes: '', created_at: '2026-11-20T00:00:00Z',
    lines: [{ description: 'Pads', note: '', qty: 2, rate: 100, cost: 40 }] };
  t.estimates = [
    { ...est, id: DRAFT, shop_id: SHOP, estimate_number: 'EST-0001', status: 'Draft' },
    { ...est, id: SENT, shop_id: SHOP, estimate_number: 'EST-0002', status: 'Sent' },
    { ...est, id: FOREIGN, shop_id: OTHER, estimate_number: 'EST-0009', status: 'Draft' },
    { ...est, id: D1_EST, shop_id: D1, estimate_number: 'EST-0100', status: 'Sent' },
  ];
  t.invoices = [
    { number: 'INV-0101', shop_id: SHOP, status: 'Draft', customer: 'Somchai', currency: 'USD', discount: 0, shop_supplies: 0, tax_rate: 0, lines: [{ description: 'Service', note: '', qty: 1, rate: 300 }], created_at: '2026-11-21T00:00:00Z' },
    { number: 'INV-0102', shop_id: OTHER, status: 'Sent', customer: 'Theirs', currency: 'USD', lines: [] },
  ];
  sent.mockClear();
}

/* eslint-disable @typescript-eslint/no-require-imports */
const estimatePdf = () => require('../estimates/[id]/pdf/route');
const invoicePdf = () => require('../invoices/[number]/pdf/route');
/* eslint-enable @typescript-eslint/no-require-imports */

async function get(handler: (r: Request) => Promise<Response>, path: string, key = KEY_PDF) {
  const res = await handler(new Request('https://redlined1.test' + path, { headers: { authorization: 'Bearer ' + key } }));
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, json: () => JSON.parse(buf.toString('utf8')) };
}

function pageText(raw: Buffer): string {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const s = raw.indexOf('stream', at);
    if (s < 0) break;
    const start = raw[s + 6] === 0x0d ? s + 8 : s + 7;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try { out.push(inflateSync(raw.subarray(start, end)).toString('latin1')); } catch { /* skip */ }
    at = end + 9;
  }
  return out.join('\n');
}
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

beforeEach(() => seed());

describe('GET /api/v1/estimates/:id/pdf', () => {
  it('returns a PDF of a draft, stamped DRAFT, named so', async () => {
    const r = await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe('inline; filename="EST-0001-DRAFT.pdf"');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.buf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pageText(r.buf);
    expect(text).toContain(hex('DRAFT: not issued'));
    expect(text).toContain(hex('Trial Garage'));
  });

  it('does not stamp a sent estimate', async () => {
    const r = await get(estimatePdf().GET, `/api/v1/estimates/${SENT}/pdf`);
    expect(r.headers.get('content-disposition')).toBe('inline; filename="EST-0002.pdf"');
    expect(pageText(r.buf)).not.toContain(hex('DRAFT: not issued'));
  });

  it('carries the trial watermark on a free shop, as the app does, and never on D1', async () => {
    expect(pageText((await get(estimatePdf().GET, `/api/v1/estimates/${SENT}/pdf`)).buf)).toContain(hex('REDLINED1'));
    expect(pageText((await get(estimatePdf().GET, `/api/v1/estimates/${D1_EST}/pdf`, KEY_D1)).buf)).not.toContain(hex('REDLINED1'));
  });

  it('never prints the line cost', async () => {
    const text = pageText((await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`)).buf);
    expect(text).not.toContain(hex('$40.00'));
    expect(text).toContain(hex('$200.00'));
  });

  it('needs pdf:read as well as estimates:read', async () => {
    const r = await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`, KEY_NO_PDF);
    expect(r.status).toBe(403);
    expect(r.json().error.code).toBe('SCOPE_REQUIRED');
  });

  it('another shop\'s estimate, or a bad id, is 404', async () => {
    expect((await get(estimatePdf().GET, `/api/v1/estimates/${FOREIGN}/pdf`)).status).toBe(404);
    expect((await get(estimatePdf().GET, '/api/v1/estimates/nope/pdf')).status).toBe(404);
  });

  it('refuses when the shop profile is incomplete, as the email route does', async () => {
    seed(false);
    const r = await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`);
    expect(r.status).toBe(409);
    expect(r.json().error.details).toMatchObject({ code: 'SHOP_IDENTITY_INCOMPLETE', missing_fields: ['businessName'] });
  });

  it('is 404 with the flag off', async () => {
    fake.tables.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: false }];
    expect((await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`)).status).toBe(404);
  });

  it('sends nothing', async () => {
    await get(estimatePdf().GET, `/api/v1/estimates/${DRAFT}/pdf`);
    expect(sent).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/invoices/:number/pdf', () => {
  it('returns a stamped PDF of a draft invoice', async () => {
    const r = await get(invoicePdf().GET, '/api/v1/invoices/INV-0101/pdf');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toBe('inline; filename="INV-0101-DRAFT.pdf"');
    expect(pageText(r.buf)).toContain(hex('DRAFT: not issued'));
  });

  it('another shop\'s invoice is 404', async () => {
    expect((await get(invoicePdf().GET, '/api/v1/invoices/INV-0102/pdf')).status).toBe(404);
  });

  it('needs pdf:read', async () => {
    expect((await get(invoicePdf().GET, '/api/v1/invoices/INV-0101/pdf', KEY_NO_PDF)).status).toBe(403);
  });
});

describe('layout inputs', () => {
  const estRow = {
    id: DRAFT, estimate_number: 'EST-0001', status: 'Draft', currency: 'THB', discount: 100, tax_rate: 0.07,
    lines: [{ description: 'Pads', note: '', qty: 2, rate: 1250.5 }, { description: 'Sensor', note: '', qty: 1, rate: 45, currency: 'USD' }],
    created_at: '2026-11-20T00:00:00Z', valid_until: '2026-12-31',
  };
  const header = { shopName: 'S', shopAddress: '', shopPhone: '', shopEmail: '' };

  it('totals an estimate as the screens do, leaving the USD line out of the THB subtotal', () => {
    const e = { ...mapEstimateRow(estRow), provenance: { createdVia: null, createdByApiKeyId: null } };
    const input = estimatePdfInput(e, header, false);
    const t = calculateEstimateTotals({ currency: 'THB', lines: e.lines, discount: 100, taxRate: 0.07 });
    expect(input).toMatchObject({ subtotal: t.subtotal, tax: t.tax, total: t.total, draftWatermark: true });
    expect(input.subtotal).toBe(2501);
    expect(input.lines[1].currency).toBe('USD');
  });

  it('stamps only drafts', () => {
    const inv = { ...mapInvoiceRow({ number: 'INV-1', status: 'Sent', lines: [] }), provenance: { createdVia: null, createdByApiKeyId: null }, sourceEstimateId: null };
    expect(invoicePdfInput(inv, header, false).draftWatermark).toBe(false);
  });

  it('builds a safe filename', () => {
    expect(pdfFilename('INV-0042', false)).toBe('INV-0042.pdf');
    expect(pdfFilename('EST-1"; rm', true)).toBe('EST-1rm-DRAFT.pdf');
  });
});
