/**
 * One record per person, per business — and the reasons that shape holds.
 *
 * The behavioural half runs against the fake database; the back-fill and the
 * access rules are pinned to the migration, since nothing here executes SQL.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import { createEmployeeDomain, EmployeeError } from '../employees';
import type { DomainDb } from '../db';
import { DEFAULT_CAPABILITIES, CAPABILITIES } from '@/lib/auth/capabilities';

interface Recorded { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }

function fakeDb(rows: Record<string, unknown>[] = [{ id: 'E-1', organization_id: 'org-1', full_name: 'John' }]) {
  const calls: Recorded[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  function builder(table: string, op: string) {
    const rec: Recorded = { table, op, filters: {} };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'order', 'eq', 'in', 'is', 'maybeSingle', 'single']) {
      chain[m] = (...args: unknown[]) => {
        if (m === 'eq' || m === 'in' || m === 'is') rec.filters[String(args[0])] = args[1];
        if (m === 'maybeSingle' || m === 'single') return Promise.resolve({ data: rows[0] ?? null, error: null });
        return self();
      };
    }
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r);
    return chain;
  }

  const db = {
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        insert: (p: unknown) => { const b = builder(table, 'insert'); calls[calls.length - 1].payload = p; return b; },
        update: (p: unknown) => { const b = builder(table, 'update'); calls[calls.length - 1].payload = p; return b; },
        delete: () => builder(table, 'delete'),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: 'audit-1', error: null });
    },
  } as unknown as DomainDb;

  return { db, calls, rpcCalls };
}

const owner = createDomainContext({
  organizationId: 'org-1',
  shopId: 'shop-A',
  shopIds: ['shop-A', 'shop-B'],
  actor: { type: 'user', userId: 'u', role: 'owner' },
  capabilities: DEFAULT_CAPABILITIES.owner,
});

describe('employees belong to the business, not the shop', () => {
  it('lists by organization, never by shop', async () => {
    // The entire point: D1 has 25 technician rows for 13 people because the
    // directory is per shop. Scoping employees the same way would keep the
    // double-count.
    const { db, calls } = fakeDb();
    await createEmployeeDomain({ db, context: owner }).list();
    expect(calls[0].filters.organization_id).toBe('org-1');
    expect(calls[0].filters).not.toHaveProperty('shop_id');
  });

  it('writes against the organization too', async () => {
    const { db, calls } = fakeDb();
    await createEmployeeDomain({ db, context: owner }).create({
      fullName: 'Kham', email: '', phone: '', userId: null,
      employmentStatus: 'Active', hireDate: null, endDate: null, notes: '',
    });
    expect((calls[0].payload as Record<string, unknown>).organization_id).toBe('org-1');
  });

  it('refuses in words when the shop has no organization', async () => {
    // Guessing from the shop would silently give a two-location owner half
    // their staff, which is worse than an error.
    const orphan = createDomainContext({
      shopId: 'shop-A',
      actor: { type: 'user', userId: 'u', role: 'owner' },
      capabilities: DEFAULT_CAPABILITIES.owner,
    });
    const { db } = fakeDb();
    await expect(createEmployeeDomain({ db, context: orphan }).list())
      .rejects.toThrow(/not linked to a business/);
  });

  it('finds the shops a person works at through the directory', async () => {
    const { db, calls } = fakeDb([{ shop_id: 'shop-A' }, { shop_id: 'shop-B' }, { shop_id: 'shop-A' }]);
    const shops = await createEmployeeDomain({ db, context: owner }).shopsFor('E-1');
    expect(calls[0].table).toBe('technicians');
    expect(shops.sort()).toEqual(['shop-A', 'shop-B']);   // deduped
  });

  it('hides archived people by default', async () => {
    const { db, calls } = fakeDb();
    await createEmployeeDomain({ db, context: owner }).list();
    expect(calls[0].filters).toHaveProperty('archived_at', null);
  });
});

describe('permissions', () => {
  const advisor = createDomainContext({
    organizationId: 'org-1', shopId: 'shop-A',
    actor: { type: 'user', userId: 'u', role: 'advisor' },
    capabilities: DEFAULT_CAPABILITIES.advisor,
  });
  const manager = createDomainContext({
    organizationId: 'org-1', shopId: 'shop-A',
    actor: { type: 'user', userId: 'u', role: 'manager' },
    capabilities: DEFAULT_CAPABILITIES.manager,
  });

  it('keeps advisors out entirely', async () => {
    const { db } = fakeDb();
    await expect(createEmployeeDomain({ db, context: advisor }).list())
      .rejects.toThrow(/do not have permission to see employee records/);
  });

  it('lets a manager read but not write', async () => {
    // Employment records are where pay will live. Narrowing before there is
    // anything sensitive on them is cheaper than narrowing after.
    const { db } = fakeDb();
    await expect(createEmployeeDomain({ db, context: manager }).list()).resolves.toBeTruthy();
    await expect(
      createEmployeeDomain({ db, context: manager }).create({
        fullName: 'X', email: '', phone: '', userId: null,
        employmentStatus: 'Active', hireDate: null, endDate: null, notes: '',
      }),
    ).rejects.toThrow(/do not have permission to add employees/);
  });

  it('never grants employees to a technician', async () => {
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('employees.read');
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('employees.manage');
  });

  it('marks the employee capabilities enforced now that something checks them', () => {
    for (const id of ['employees.read', 'employees.manage']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
    }
  });
});

describe('records are archived, never deleted', () => {
  it('archives with an audit row', async () => {
    const { db, calls, rpcCalls } = fakeDb([{ id: 'E-1', organization_id: 'org-1', full_name: 'John' }]);
    await createEmployeeDomain({ db, context: owner }).archive('E-1', 'left the business');
    expect(calls.some(c => c.op === 'delete')).toBe(false);
    expect(rpcCalls.at(-1)!.args.p_action).toBe('employee.archived');
    expect(rpcCalls.at(-1)!.args.p_metadata).toMatchObject({ reason: 'left the business' });
  });

  it('audits a creation', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'E-2', organization_id: 'org-1', full_name: 'Kham' }]);
    await createEmployeeDomain({ db, context: owner }).create({
      fullName: 'Kham', email: '', phone: '', userId: null,
      employmentStatus: 'Active', hireDate: null, endDate: null, notes: '',
    });
    expect(rpcCalls[0].args.p_action).toBe('employee.created');
  });

  it('keeps free-text notes out of the audit trail', async () => {
    // An audit row is read by more people, and kept longer, than the record it
    // describes. Notes about a person do not belong in it.
    const { db, rpcCalls } = fakeDb([{ id: 'E-2', organization_id: 'org-1', full_name: 'Kham', notes: 'private remark' }]);
    await createEmployeeDomain({ db, context: owner }).create({
      fullName: 'Kham', email: '', phone: '', userId: null,
      employmentStatus: 'Active', hireDate: null, endDate: null, notes: 'private remark',
    });
    expect(JSON.stringify(rpcCalls[0].args.p_after)).not.toContain('private remark');
  });

  it('refuses an employee with no name', async () => {
    const { db } = fakeDb();
    await expect(createEmployeeDomain({ db, context: owner }).create({
      fullName: '  ', email: '', phone: '', userId: null,
      employmentStatus: 'Active', hireDate: null, endDate: null, notes: '',
    })).rejects.toThrow(EmployeeError);
  });
});

describe('the migration', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m5_employees.sql'),
    'utf8',
  );
  const CODE = SQL.replace(/^\s*--.*$/gm, '');

  it('dedupes on name per organization, case- and space-insensitively', () => {
    // "John" and "john " are the same person in a roster typed by hand.
    expect(CODE).toMatch(/DISTINCT ON \(s\.organization_id, lower\(trim\(t\.name\)\)\)/);
  });

  it('carries a login across from whichever directory row had one', () => {
    // John has two technician rows; only one need be linked for the person to
    // have a login.
    expect(CODE).toMatch(/AND t2\.user_id IS NOT NULL/);
  });

  it('links every technician row back to its person', () => {
    expect(CODE).toMatch(/UPDATE public\.technicians t\s*\nSET employee_id = e\.id/);
  });

  it('does NOT make the name unique', () => {
    // Two people really can be called Kham. Merging by accident is worse than
    // separating by hand.
    expect(CODE).toMatch(/CREATE INDEX IF NOT EXISTS employees_org_name_idx/);
    expect(CODE).not.toMatch(/CREATE UNIQUE INDEX[^;]*employees_org_name/);
  });

  it('does make one login mean one person', () => {
    expect(CODE).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS employees_one_per_login/);
  });

  it('grants no DELETE', () => {
    // Employment history, archived like a customer.
    expect(CODE).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.employees TO authenticated/);
    expect(CODE).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.employees/);
  });

  it('scopes RLS by organization through shop membership', () => {
    expect(CODE).toMatch(/s\.organization_id = employees\.organization_id/);
    expect(CODE).toMatch(/has_capability\(s\.id, 'employees\.read'\)/);
    expect(CODE).toMatch(/has_capability\(s\.id, 'employees\.manage'\)/);
  });

  it('leaves pay on technicians for a later milestone', () => {
    // An unversioned salary column readable by anyone who can read an employee
    // would be worse than the duplication this fixes.
    expect(CODE).not.toMatch(/pay_rate|pay_type|salary/);
    const prose = SQL.replace(/^\s*--/gm, ' ').replace(/\s+/g, ' ');
    expect(prose).toMatch(/needs to be versioned/);
  });

  it('says it must run before the app deploys', () => {
    expect(SQL).toMatch(/BEFORE deploying the M5 application change/i);
  });

  it('is reversible', () => {
    expect(SQL).toMatch(/DROP TABLE IF EXISTS public\.employees/);
    expect(SQL).toMatch(/ALTER TABLE public\.technicians DROP COLUMN IF EXISTS employee_id/);
  });
});

describe('the SQL capability defaults still match the application', () => {
  /**
   * The LATEST migration that redefines has_capability, not this one.
   *
   * Pinned to the M5 file, this silently started comparing against a
   * superseded definition the moment M6 redefined the function — a guard that
   * passes while the thing it guards has moved on. capabilities.test.ts had
   * already learnt this; this copy had not.
   */
  const SQL = (() => {
    const dir = join(__dirname, '..', '..', '..', 'supabase/migrations');
    const definers = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => readFileSync(join(dir, f), 'utf8')
        .includes('CREATE OR REPLACE FUNCTION public.has_capability'))
      .sort();
    expect(definers.length).toBeGreaterThan(0);
    return readFileSync(join(dir, definers[definers.length - 1]), 'utf8');
  })();

  function sqlDefaultsFor(role: string): string[] {
    const start = SQL.indexOf(`WHEN '${role}' THEN ARRAY[`);
    const body = SQL.slice(start, SQL.indexOf(']', start));
    return [...body.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(m => m[1]);
  }

  it.each(['owner', 'manager', 'advisor', 'technician'])('for %s', role => {
    // This migration redefines has_capability to add the employee entries, so
    // the duplication guard has to move with it.
    expect(sqlDefaultsFor(role).sort())
      .toEqual([...DEFAULT_CAPABILITIES[role as 'owner']].sort());
  });
});
