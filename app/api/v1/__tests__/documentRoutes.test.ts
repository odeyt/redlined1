/**
 * API v1 bot read endpoints, end to end through withApi against an in-memory
 * database: key → rate limit → flag → scope → tenant → domain → shape.
 *
 * PLAN.md §8 rules proven here: off unless enabled, tenant isolation, no
 * internal cost/markup, read-only (no write methods, no send/payment code).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashApiKey } from '@/lib/api/principal';

// ── A small in-memory PostgREST stand-in ─────────────────────────────────────

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const orders: [string, boolean][] = [];
  let range: [number, number] | null = null;
  let wantCount = false;
  let single: 'maybe' | 'one' | null = null;
  let updating = false;

  const run = () => {
    if (updating) return { data: null, error: null };
    let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
    for (const [col, asc] of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = String(a[col] ?? ''), y = String(b[col] ?? '');
        return x === y ? 0 : (x < y ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    const count = rows.length;
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null, count: wantCount ? count : null };
  };

  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string }) => { wantCount = Boolean(opts?.count); return b; },
    update: () => { updating = true; return b; },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b; },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return b; },
    gte: (c: string, v: string) => { filters.push(r => String(r[c] ?? '') >= v); return b; },
    order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return b; },
    range: (from: number, to: number) => { range = [from, to]; return b; },
    maybeSingle: () => { single = 'maybe'; return b; },
    single: () => { single = 'one'; return b; },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

const fakeDb = {
  from: (t: string) => builder(t),
  rpc: async (fn: string) => (fn === 'api_rate_limit_hit' ? { data: 1, error: null } : { data: null, error: { message: 'no' } }),
};

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fakeDb }));
jest.mock('@/lib/observability/alerts', () => ({ alertException: jest.fn() }));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ORG = 'org-1', SHOP_A = 'shop-a', SHOP_B = 'shop-b', OTHER_ORG_SHOP = 'shop-z';
const KEY_READ = 'rl_live_' + 'a'.repeat(32);
const KEY_CUSTOMERS_ONLY = 'rl_live_' + 'b'.repeat(32);
const KEY_REVOKED = 'rl_live_' + 'c'.repeat(32);

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '33333333-3333-4333-8333-333333333333';
const E_FOREIGN = '44444444-4444-4444-8444-444444444444';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';

function seed(flagOn: boolean | 'shop-b-only') {
  tables.api_keys = [
    { id: 'k1', name: 'Wally Bot', organization_id: ORG, shop_id: SHOP_A, scopes: ['estimates:read', 'invoices:read', 'customers:read'], revoked_at: null, key_hash: hashApiKey(KEY_READ) },
    { id: 'k2', name: 'Contacts sync', organization_id: ORG, shop_id: SHOP_A, scopes: ['customers:read'], revoked_at: null, key_hash: hashApiKey(KEY_CUSTOMERS_ONLY) },
    { id: 'k3', name: 'Old', organization_id: ORG, shop_id: SHOP_A, scopes: ['estimates:read'], revoked_at: '2026-01-01', key_hash: hashApiKey(KEY_REVOKED) },
  ];
  tables.shops = [
    { id: SHOP_A, name: 'Location 2', organization_id: ORG },
    { id: SHOP_B, name: 'Other branch', organization_id: ORG },
    { id: OTHER_ORG_SHOP, name: 'Competitor', organization_id: 'org-2' },
  ];
  tables.feature_flags = flagOn === 'shop-b-only'
    ? [{ flag_key: 'api_v1_documents', scope: 'global', enabled: false }, { flag_key: 'api_v1_documents', scope: 'shop', shop_id: SHOP_B, enabled: true }]
    : [{ flag_key: 'api_v1_documents', scope: 'global', enabled: flagOn }];
  tables.estimates = [
    { id: E1, shop_id: SHOP_A, estimate_number: 'EST-0001', customer_id: CUSTOMER, customer_name: 'Somchai', vehicle: 'Hilux', status: 'Draft', currency: 'USD', discount: 0, tax_rate: 0, lines: [{ description: 'Pads', note: '', qty: 1, rate: 100, cost: 40, markup: 1.5 }], created_at: '2026-11-20T00:00:00Z' },
    { id: E2, shop_id: SHOP_A, estimate_number: 'EST-0002', customer_id: null, customer_name: 'Walk-in', vehicle: 'Vios', status: 'Approved', currency: 'THB', discount: 0, tax_rate: 0, lines: [], created_at: '2026-11-22T00:00:00Z', created_via: 'api', created_by_api_key_id: 'k9' },
    { id: E_FOREIGN, shop_id: OTHER_ORG_SHOP, estimate_number: 'EST-0001', customer_name: 'Theirs', status: 'Draft', currency: 'USD', lines: [], created_at: '2026-11-23T00:00:00Z' },
  ];
  tables.invoices = [
    { number: 'INV-0050', shop_id: SHOP_A, customer: 'Somchai', customer_id: CUSTOMER, status: 'Sent', currency: 'USD', discount: 0, shop_supplies: 0, tax_rate: 0, lines: [{ description: 'Service', note: '', qty: 1, rate: 300, cost: 100 }], created_at: '2026-11-21T00:00:00Z', source_estimate_id: E1 },
    { number: 'INV-0051', shop_id: OTHER_ORG_SHOP, customer: 'Theirs', status: 'Sent', currency: 'USD', lines: [{ description: 'x', note: '', qty: 1, rate: 999 }], created_at: '2026-11-21T00:00:00Z' },
  ];
  tables.payments = [
    { id: 'p1', shop_id: SHOP_A, invoice_number: 'INV-0050', amount: 120, currency: 'USD', entry_type: 'payment' },
    // Another tenant's payment against a number that also exists here must not count.
    { id: 'p2', shop_id: OTHER_ORG_SHOP, invoice_number: 'INV-0050', amount: 180, currency: 'USD', entry_type: 'payment' },
  ];
}

const req = (path: string, key: string | null = KEY_READ) =>
  new Request('https://redlined1.test' + path, { headers: key ? { authorization: 'Bearer ' + key } : {} });

async function call(mod: { GET: (r: Request) => Promise<Response> }, path: string, key: string | null = KEY_READ) {
  const res = await mod.GET(req(path, key));
  return { status: res.status, body: await res.json() };
}

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  me: () => require('../me/route'),
  estimates: () => require('../estimates/route'),
  estimate: () => require('../estimates/[id]/route'),
  invoices: () => require('../invoices/route'),
  invoice: () => require('../invoices/[number]/route'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const ALL: [keyof typeof routes, string][] = [
  ['me', '/api/v1/me'],
  ['estimates', '/api/v1/estimates'],
  ['estimate', `/api/v1/estimates/${E1}`],
  ['invoices', '/api/v1/invoices'],
  ['invoice', '/api/v1/invoices/INV-0050'],
];

// ── Off unless enabled ───────────────────────────────────────────────────────

describe('with api_v1_documents off (as seeded)', () => {
  beforeEach(() => seed(false));

  it.each(ALL)('%s is 404, even for a key holding the scope', async (name, path) => {
    const { status, body } = await call(routes[name](), path);
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('is still 404 when only some other shop has it on', async () => {
    seed('shop-b-only');
    expect((await call(routes.estimates(), '/api/v1/estimates')).status).toBe(404);
  });

  it('still requires a key first', async () => {
    expect((await call(routes.estimates(), '/api/v1/estimates', null)).status).toBe(401);
  });
});

// ── On ───────────────────────────────────────────────────────────────────────

describe('with api_v1_documents on', () => {
  beforeEach(() => seed(true));

  it('refuses no key, a bad key and a revoked key', async () => {
    expect((await call(routes.estimates(), '/api/v1/estimates', null)).body.error.code).toBe('AUTH_REQUIRED');
    expect((await call(routes.estimates(), '/api/v1/estimates', 'rl_live_' + 'f'.repeat(32))).body.error.code).toBe('INVALID_API_KEY');
    expect((await call(routes.estimates(), '/api/v1/estimates', KEY_REVOKED)).body.error.code).toBe('API_KEY_REVOKED');
  });

  it('refuses a key without the scope', async () => {
    const r = await call(routes.estimates(), '/api/v1/estimates', KEY_CUSTOMERS_ONLY);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SCOPE_REQUIRED');
    expect((await call(routes.invoice(), '/api/v1/invoices/INV-0050', KEY_CUSTOMERS_ONLY)).status).toBe(403);
  });

  it('/me describes the key and never its secret or hash', async () => {
    const { status, body } = await call(routes.me(), '/api/v1/me', KEY_CUSTOMERS_ONLY);
    expect(status).toBe(200);
    expect(body.data).toEqual({
      key: { id: 'k2', name: 'Contacts sync' },
      organization_id: ORG,
      shops: [{ id: SHOP_A, name: 'Location 2' }],
      write_shop_id: SHOP_A,
      scopes: ['customers:read'],
    });
    expect(JSON.stringify(body)).not.toMatch(/key_hash|rl_live_/);
  });

  it('lists only this shop\'s estimates, newest first, with paging meta', async () => {
    const { status, body } = await call(routes.estimates(), '/api/v1/estimates');
    expect(status).toBe(200);
    expect(body.data.map((e: { number: string }) => e.number)).toEqual(['EST-0002', 'EST-0001']);
    expect(body.meta).toMatchObject({ page: 1, page_size: 25, total: 2, has_more: false });
  });

  it('filters by status and pages', async () => {
    const drafts = await call(routes.estimates(), '/api/v1/estimates?status=draft');
    expect(drafts.body.data.map((e: { id: string }) => e.id)).toEqual([E1]);

    const p1 = await call(routes.estimates(), '/api/v1/estimates?page_size=1');
    const p2 = await call(routes.estimates(), '/api/v1/estimates?page_size=1&page=2');
    expect(p1.body.meta.has_more).toBe(true);
    expect(p2.body.meta.has_more).toBe(false);
    expect([p1.body.data[0].id, p2.body.data[0].id]).toEqual([E2, E1]);
  });

  it('refuses a bad filter with 422', async () => {
    const r = await call(routes.estimates(), '/api/v1/estimates?status=paid');
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('cannot be pointed at another shop through the query', async () => {
    const r = await call(routes.estimates(), `/api/v1/estimates?shop_id=${OTHER_ORG_SHOP}`);
    expect(r.body.data.map((e: { id: string }) => e.id)).not.toContain(E_FOREIGN);
  });

  it('gets one estimate, without cost or markup, and marks API-made ones', async () => {
    const one = await call(routes.estimate(), `/api/v1/estimates/${E1}`);
    expect(one.status).toBe(200);
    expect(one.body.data).toMatchObject({ id: E1, status: 'draft', created_via: 'app', totals: { total: 100 } });
    expect(JSON.stringify(one.body)).not.toMatch(/"cost"|"markup"|shop_id/);

    expect((await call(routes.estimate(), `/api/v1/estimates/${E2}`)).body.data.created_via).toBe('api');
  });

  it('another tenant\'s estimate, or a malformed id, is 404', async () => {
    expect((await call(routes.estimate(), `/api/v1/estimates/${E_FOREIGN}`)).status).toBe(404);
    expect((await call(routes.estimate(), '/api/v1/estimates/not-an-id')).status).toBe(404);
  });

  it('lists this shop\'s invoices with what has been paid', async () => {
    const { status, body } = await call(routes.invoices(), '/api/v1/invoices');
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      number: 'INV-0050', status: 'sent', amount_paid: 120, balance_due: 180, estimate_id: E1,
    });
    expect(JSON.stringify(body)).not.toMatch(/"cost"|shop_id/);
  });

  it('gets one invoice; another tenant\'s number is 404', async () => {
    expect((await call(routes.invoice(), '/api/v1/invoices/INV-0050')).body.data.amount_paid).toBe(120);
    expect((await call(routes.invoice(), '/api/v1/invoices/INV-0051')).status).toBe(404);
  });

  it('says updated_since is not supported yet', async () => {
    const r = await call(routes.invoices(), '/api/v1/invoices?updated_since=2026-11-01');
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toMatch(/updated_since/);
  });
});

// ── Read only, by construction ───────────────────────────────────────────────

describe('the document routes cannot send, approve, delete or take money', () => {
  // Exactly these methods, and no others. Phase 4 added the draft writes.
  const METHODS: Record<string, string[]> = {
    'me/route.ts': ['GET'],
    'estimates/route.ts': ['GET', 'POST'],
    'estimates/[id]/route.ts': ['GET', 'PATCH'],
    'estimates/[id]/convert-to-invoice/route.ts': ['POST'],
    'invoices/route.ts': ['GET', 'POST'],
    'invoices/[number]/route.ts': ['GET', 'PATCH'],
    'estimates/[id]/pdf/route.ts': ['GET'],
    'invoices/[number]/pdf/route.ts': ['GET'],
  };
  const FILES = Object.keys(METHODS).map(f => [f, readFileSync(join(__dirname, '..', f), 'utf8')] as const);

  it.each(FILES)('%s exports only its agreed methods', (f, src) => {
    const exported = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]).sort();
    expect(exported).toEqual([...METHODS[f]].sort());
  });

  it.each(FILES)('%s sits behind the flag on every method', (_f, src) => {
    const handlers = (src.match(/withApi\(/g) ?? []).length;
    expect((src.match(/flag: 'api_v1_documents'/g) ?? []).length).toBe(handlers);
  });

  it.each(FILES)('%s imports nothing that sends or moves money', (_f, src) => {
    expect(src).not.toMatch(/send-document|send-followup|send-message|whatsapp|resend|stripe|creem|portal/i);
    expect(src).not.toMatch(/\.(remove|approve|markPaid|reverse|correct)\(/);
    // Writes go through the draft domain only, never the general create/update.
    expect(src).not.toMatch(/(createEstimateDomain|createInvoiceDomain)\([^)]*\)\.(create|update)\(/);
  });

  it('every write needs a write shop and a write scope', () => {
    for (const [f, src] of FILES) {
      for (const m of src.matchAll(/export const (POST|PATCH) = withApi\(\s*\{([^}]*)\}/g)) {
        expect(`${f} ${m[1]}: ${/requiresWriteShop: true/.test(m[2])}`).toBe(`${f} ${m[1]}: true`);
        expect(m[2]).toMatch(/:write'/);
      }
    }
  });
});
