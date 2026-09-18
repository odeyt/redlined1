/**
 * Runs listAccounts / getOwnerOverview / getAccountDetail against an in-memory
 * database that enforces the REAL production `profiles` column list, the way
 * PostgREST does: selecting, filtering or ordering on a column that does not
 * exist rejects the whole query with 42703.
 *
 * Regression for the owner-admin portal reading `profiles.name`, `status` and
 * `created_at` (none exist in production). The query failed, the error was
 * discarded, and every account rendered as "free" with no contact — including
 * a shop with an active paid subscription.
 */
import {
  listAccounts, getOwnerOverview, getAccountDetail, AdminDataError, PROFILE_COLUMNS,
} from '../accountsData';

// docs/m0-architecture-audit.md §4 — live production schema.
const PROD_PROFILE_COLUMNS = ['id', 'email', 'role', 'plan', 'trial_ends_at', 'shop_name', 'shop_id', 'billing_status'];

type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;

const SHOP_PAID = '11111111-1111-4111-8111-111111111111';
const SHOP_FREE = '22222222-2222-4222-8222-222222222222';
const SHOP_INTERNAL = '33333333-3333-4333-8333-333333333333';
const U_PAID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U_FREE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const U_STAFF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let tables: Record<string, Row[]>;
let failTables: Set<string>;
let profileSelects: string[];

function resetDb() {
  failTables = new Set();
  profileSelects = [];
  tables = {
    shops: [
      { id: SHOP_PAID, name: 'Paid Shop', created_at: '2026-08-22T00:00:00Z', archived_at: null },
      { id: SHOP_FREE, name: 'Free Shop', created_at: '2026-08-23T00:00:00Z', archived_at: null },
      { id: SHOP_INTERNAL, name: 'D1 Internal', created_at: '2026-01-01T00:00:00Z', archived_at: null },
    ],
    shop_users: [
      { shop_id: SHOP_PAID, user_id: U_PAID, role: 'owner' },
      { shop_id: SHOP_PAID, user_id: U_STAFF, role: 'staff' },
      { shop_id: SHOP_FREE, user_id: U_FREE, role: 'owner' },
    ],
    profiles: [
      { id: U_PAID, email: 'paid-owner@example-test.com', role: 'Owner', plan: 'professional', trial_ends_at: null, shop_name: null, shop_id: SHOP_PAID, billing_status: 'active' },
      { id: U_STAFF, email: 'staff@example-test.com', role: 'Advisor', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: SHOP_PAID, billing_status: 'inactive' },
      { id: U_FREE, email: 'free-owner@example-test.com', role: 'Owner', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: SHOP_FREE, billing_status: 'inactive' },
    ],
    shop_subscriptions: [
      {
        shop_id: SHOP_PAID, status: 'active', plan_key: 'professional', billing_provider: 'creem',
        provider_customer_id: 'cus_x', provider_subscription_id: 'sub_x', trial_start: null, trial_end: null,
        current_period_start: null, current_period_end: null, cancel_at_period_end: false, cancelled_at: null,
        past_due_at: null, created_at: '2026-08-27T00:00:00Z',
      },
    ],
    shop_mirrors: [],
    billing_events: [],
    support_tickets: [],
  };
}

function unknownColumns(table: string, cols: string[]): string[] {
  if (table !== 'profiles') return [];
  return cols.filter(c => !PROD_PROFILE_COLUMNS.includes(c));
}

class FakeQuery {
  private cols: string[] = [];
  private filters: Array<(r: Row) => boolean> = [];
  private touched: string[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  private head = false;
  private single = false;

  constructor(private table: string) {}

  select(cols: string, opts?: { head?: boolean }) {
    this.cols = cols.split(',').map(c => c.trim()).filter(Boolean);
    this.head = !!opts?.head;
    return this;
  }
  in(col: string, vals: unknown[]) { this.touched.push(col); this.filters.push(r => vals.includes(r[col])); return this; }
  eq(col: string, val: unknown) { this.touched.push(col); this.filters.push(r => r[col] === val); return this; }
  neq(col: string, val: unknown) { this.touched.push(col); this.filters.push(r => r[col] !== val); return this; }
  is(col: string, val: null) { this.touched.push(col); this.filters.push(r => (r[col] ?? null) === val); return this; }
  ilike(col: string, pattern: string) {
    this.touched.push(col);
    const needle = pattern.replace(/^%|%$/g, '').replace(/\\([%_])/g, '$1').toLowerCase();
    this.filters.push(r => String(r[col] ?? '').toLowerCase().includes(needle));
    return this;
  }
  or(expr: string) { this.touched.push(...expr.split(',').map(p => p.split('.')[0])); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.touched.push(col); this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.single = true; return this; }

  private run(): { data: unknown; error: Err; count?: number } {
    if (failTables.has(this.table)) {
      return { data: null, error: { code: 'XX000', message: `simulated failure reading ${this.table}` } };
    }
    if (this.table === 'profiles') profileSelects.push(this.cols.join(','));
    const bad = unknownColumns(this.table, [...this.cols, ...this.touched]);
    if (bad.length) {
      return { data: null, error: { code: '42703', message: `column ${this.table}.${bad[0]} does not exist` } };
    }
    let rows = (tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
    }
    rows = rows.slice(0, this.max);
    if (this.head) return { data: null, error: null, count: rows.length };
    if (this.single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then<T>(resolve: (v: { data: unknown; error: Err; count?: number }) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

const mockFakeDb = {
  from: (table: string) => new FakeQuery(table),
  auth: {
    admin: {
      getUserById: async () => ({ data: { user: { last_sign_in_at: '2026-09-01T00:00:00Z' } }, error: null }),
    },
  },
};

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockFakeDb }));
jest.mock('@/lib/adminAuth', () => ({ getInternalShopIds: () => new Set(['33333333-3333-4333-8333-333333333333']) }));
jest.mock('@/commercial/usage/usageService', () => ({ getMonthlyUsage: async () => ({ usage: {} }) }));

beforeEach(resetDb);

describe('PROFILE_COLUMNS', () => {
  it('only names columns that exist in production profiles', () => {
    const cols = PROFILE_COLUMNS.split(',').map(c => c.trim());
    expect(cols.filter(c => !PROD_PROFILE_COLUMNS.includes(c))).toEqual([]);
  });
});

describe('listAccounts against the production profiles schema', () => {
  it('resolves plan, contact email and status from the owner profile', async () => {
    const res = await listAccounts({ pageSize: 100 });
    const paid = res.items.find(i => i.id === SHOP_PAID)!;
    const free = res.items.find(i => i.id === SHOP_FREE)!;

    expect(paid.status).toBe('active_paid');
    expect(paid.plan).toBe('professional');
    expect(paid.primaryContactEmail).toBe('paid-owner@example-test.com');
    expect(paid.ownerResolved).toBe(true);
    expect(paid.lastSignInAt).toBe('2026-09-01T00:00:00Z');

    expect(free.status).toBe('free');
    expect(free.primaryContactEmail).toBe('free-owner@example-test.com');
    expect(res.items.find(i => i.id === SHOP_INTERNAL)!.status).toBe('internal');
  });

  it('counts a multi-user shop once', async () => {
    const res = await listAccounts({ pageSize: 100 });
    expect(res.items.filter(i => i.id === SHOP_PAID)).toHaveLength(1);
    expect(res.items.find(i => i.id === SHOP_PAID)!.memberCount).toBe(2);
  });

  it('finds a shop by its owner profile email', async () => {
    const res = await listAccounts({ search: 'free-owner' });
    expect(res.items.map(i => i.id)).toEqual([SHOP_FREE]);
  });

  it('falls back to a linked profile when the shop has no owner-role membership', async () => {
    tables.shop_users = tables.shop_users.filter(m => m.shop_id !== SHOP_FREE);
    const res = await listAccounts({ pageSize: 100 });
    const free = res.items.find(i => i.id === SHOP_FREE)!;
    expect(free.ownerResolved).toBe(false);
    expect(free.primaryContactEmail).toBe('free-owner@example-test.com');
  });

  it('never selects a profiles column that is not in production', async () => {
    await listAccounts({ pageSize: 100 });
    await listAccounts({ search: 'x' });
    await getAccountDetail(SHOP_PAID);
    expect(profileSelects.length).toBeGreaterThan(0);
    for (const sel of profileSelects) {
      expect(sel.split(',').map(c => c.trim()).filter(c => !PROD_PROFILE_COLUMNS.includes(c))).toEqual([]);
    }
  });
});

describe('failed reads surface as errors, not as an all-free directory', () => {
  it.each(['profiles', 'shop_users', 'shop_subscriptions', 'shops'])('listAccounts rejects when %s cannot be read', async (table) => {
    failTables.add(table);
    await expect(listAccounts({ pageSize: 100 })).rejects.toBeInstanceOf(AdminDataError);
  });

  it('getOwnerOverview rejects when profiles cannot be read', async () => {
    failTables.add('profiles');
    await expect(getOwnerOverview()).rejects.toBeInstanceOf(AdminDataError);
  });

  it('a profiles schema mismatch (unknown column) is an error, proving the fake enforces the schema', async () => {
    const res = await mockFakeDb.from('profiles').select('id, name');
    expect(res.error?.code).toBe('42703');
  });

  it.each(['profiles', 'shop_users', 'shop_subscriptions', 'shops'])('getAccountDetail rejects when %s cannot be read', async (table) => {
    failTables.add(table);
    await expect(getAccountDetail(SHOP_PAID)).rejects.toBeInstanceOf(AdminDataError);
  });

  it('getAccountDetail still returns null for a shop that does not exist', async () => {
    await expect(getAccountDetail('99999999-9999-4999-8999-999999999999')).resolves.toBeNull();
  });

  it('getAccountDetail degrades to a warning when only billing_events is unreadable', async () => {
    failTables.add('billing_events');
    const detail = await getAccountDetail(SHOP_PAID);
    expect(detail?.status.status).toBe('active_paid');
    expect(detail?.dataQualityWarnings).toContain('Billing event history is unavailable.');
  });
});

describe('getAccountDetail against the production profiles schema', () => {
  it('lists members with emails and marks the primary contact', async () => {
    const detail = await getAccountDetail(SHOP_PAID);
    expect(detail?.primaryContact?.email).toBe('paid-owner@example-test.com');
    expect(detail?.members.map(m => m.email).sort()).toEqual(['paid-owner@example-test.com', 'staff@example-test.com']);
    expect(detail?.members.find(m => m.isPrimaryContact)?.profileId).toBe(U_PAID);
    expect(detail?.dataQualityWarnings).not.toContain('The shop_users role=owner member has no matching profiles row.');
  });

  it('flags a paying shop whose profile plan is still free', async () => {
    tables.profiles = tables.profiles.map(p => (p.id === U_PAID ? { ...p, plan: 'free', billing_status: 'inactive' } : p));
    const detail = await getAccountDetail(SHOP_PAID);
    expect(detail?.status.status).toBe('free');
    expect(detail?.status.billingMismatch).toBe(true);
    expect(detail?.dataQualityWarnings.join(' ')).toMatch(/paying without receiving paid features/);
  });
});

describe('getOwnerOverview against the production profiles schema', () => {
  it('counts the paid shop as active_paid and excludes internal shops from signups', async () => {
    const o = await getOwnerOverview();
    expect(o.activePaid).toBe(1);
    expect(o.free).toBe(1);
    expect(o.internal).toBe(1);
    expect(o.totalSignups).toBe(2);
    expect(o.billingMismatches).toBe(0);
  });
});
