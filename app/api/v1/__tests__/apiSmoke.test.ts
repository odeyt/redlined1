/**
 * scripts/api-smoke.ts, run against the REAL API v1 route handlers over local
 * HTTP with the in-memory database. Proves the checklist the owner will run on
 * a preview checks the right things (a check that always passes, or always
 * fails, would be worse than no script).
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { hashApiKey } from '@/lib/api/principal';
import { createFakeDb } from './fakeDb';
import { runSmoke, type SmokeResult } from '../../../../scripts/api-smoke';

const fake = createFakeDb();
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake, getServerDb: async () => fake }));
jest.mock('@/lib/observability/alerts', () => ({ alertException: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const ROUTES: [RegExp, () => Record<string, (r: Request) => Promise<Response>>][] = [
  [/^\/api\/v1\/me$/, () => require('../me/route')],
  [/^\/api\/v1\/customers$/, () => require('../customers/route')],
  [/^\/api\/v1\/estimates$/, () => require('../estimates/route')],
  [/^\/api\/v1\/estimates\/[^/]+$/, () => require('../estimates/[id]/route')],
  [/^\/api\/v1\/estimates\/[^/]+\/pdf$/, () => require('../estimates/[id]/pdf/route')],
  [/^\/api\/v1\/estimates\/[^/]+\/convert-to-invoice$/, () => require('../estimates/[id]/convert-to-invoice/route')],
  [/^\/api\/v1\/invoices$/, () => require('../invoices/route')],
  [/^\/api\/v1\/invoices\/[^/]+$/, () => require('../invoices/[number]/route')],
  [/^\/api\/v1\/invoices\/[^/]+\/pdf$/, () => require('../invoices/[number]/pdf/route')],
];
/* eslint-enable @typescript-eslint/no-require-imports */

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local.test');
    const match = ROUTES.find(([re]) => re.test(url.pathname));
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (!match) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>404</h1>'); return; }
    const handler = match[1]()[req.method ?? 'GET'];
    if (!handler) { res.writeHead(405); res.end(); return; }
    const request = new Request(url.toString(), {
      method: req.method, headers: req.headers as Record<string, string>,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const out = await handler(request);
    res.writeHead(out.status, Object.fromEntries(out.headers.entries()));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const ORG = 'org-1', SHOP = 'shop-test';
const KEY_READ = 'rl_live_' + 'a'.repeat(48);
const KEY_CRM = 'rl_live_' + 'b'.repeat(48);
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const APPROVED = '33333333-3333-4333-8333-333333333333';

function seed(flagOn = true) {
  fake.reset();
  const t = fake.tables;
  t.api_keys = [
    { id: 'k-read', name: 'Wally Bot', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_READ),
      scopes: ['customers:read', 'vehicles:read', 'estimates:read', 'invoices:read'] },
    { id: 'k-crm', name: 'RedlineD1 CRM', organization_id: ORG, shop_id: SHOP, revoked_at: null, key_hash: hashApiKey(KEY_CRM),
      scopes: ['customers:read', 'vehicles:read', 'estimates:read', 'invoices:read', 'estimates:write', 'invoices:write', 'pdf:read'] },
  ];
  t.shops = [{ id: SHOP, name: 'Test Garage', organization_id: ORG }];
  t.feature_flags = [{ flag_key: 'api_v1_documents', scope: 'global', enabled: flagOn }];
  t.shop_settings = [{ shop_id: SHOP, company_name: 'Test Garage', address: 'Vientiane', phone: '020', default_tax_rate: 0 }];
  t.shop_users = [{ shop_id: SHOP, user_id: 'owner', role: 'owner' }];
  t.profiles = [{ id: 'owner', plan: 'pro' }];
  t.customers = [{ id: CUSTOMER, shop_id: SHOP, name: 'Test Customer', type: 'Individual', tags: [] }];
  t.vehicles = [];
  t.estimates = [
    { id: APPROVED, shop_id: SHOP, estimate_number: 'EST-0001', status: 'Approved', customer_id: CUSTOMER, customer_name: 'Test Customer',
      currency: 'USD', discount: 0, tax_rate: 0, lines: [{ description: 'Pads', note: '', qty: 1, rate: 100, cost: 40 }], created_at: '2026-11-20T00:00:00Z' },
  ];
  t.invoices = [];
  t.payments = [];
}

const quiet = { log: () => {} };
const failures = (r: SmokeResult[]) => r.filter(x => !x.ok).map(x => `${x.name}: ${x.detail}`);

describe('the smoke script against the real handlers', () => {
  beforeEach(() => seed());

  it('passes every read-only check with Wally Bot\'s key, writing nothing', async () => {
    const before = JSON.stringify([fake.tables.estimates, fake.tables.invoices]);
    const r = await runSmoke({ base, key: KEY_READ, ...quiet });
    expect(failures(r)).toEqual([]);
    expect(r.map(x => x.name)).toEqual(expect.arrayContaining([
      'No key → 401 AUTH_REQUIRED', 'Read-only key cannot write → 403 SCOPE_REQUIRED', 'Estimates never show line cost or markup',
    ]));
    expect(JSON.stringify([fake.tables.estimates, fake.tables.invoices])).toBe(before);
  });

  it('passes the write checks with the CRM key, creating exactly one draft', async () => {
    const r = await runSmoke({ base, key: KEY_CRM, write: true, customer: CUSTOMER, ...quiet });
    expect(failures(r)).toEqual([]);
    expect(fake.tables.estimates.filter(e => e.created_via === 'api')).toHaveLength(1);
    expect(fake.tables.estimates.find(e => e.created_via === 'api')).toMatchObject({ status: 'Draft' });
  });

  it('converts an approved estimate once', async () => {
    const r = await runSmoke({ base, key: KEY_CRM, convert: APPROVED, ...quiet });
    expect(failures(r)).toEqual([]);
    expect(fake.tables.invoices).toHaveLength(1);
  });

  it('reports the flag being off instead of passing', async () => {
    seed(false);
    const r = await runSmoke({ base, key: KEY_READ, ...quiet });
    expect(r).toEqual([expect.objectContaining({ name: 'GET /me', ok: false })]);
  });

  it('fails a revoked key', async () => {
    fake.tables.api_keys[0].revoked_at = '2026-11-26T00:00:00Z';
    const r = await runSmoke({ base, key: KEY_READ, ...quiet });
    expect(r[0]).toMatchObject({ name: 'GET /me', ok: false });
  });
});
