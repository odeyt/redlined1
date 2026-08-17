/**
 * Archiving replaced deleting, and the delete rules that made it necessary.
 *
 * The behavioural half is exercised against the fake database; the schema half
 * is pinned to the migrations, since this repository has no harness that runs
 * them. The runtime proof for those is the rolled-back verification block each
 * migration carries.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import { createCustomerDomain } from '../customers';
import type { DomainDb } from '../db';

const ctx = createDomainContext({
  shopId: 'shop-A',
  shopIds: ['shop-A', 'shop-B'],
  actor: { type: 'user', userId: 'user-1', role: 'owner' },
});

interface Recorded { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }

function fakeDb(rows: Record<string, unknown>[] = [{ id: 'C-1', name: 'Ai Peng' }]) {
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
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
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

describe('archived customers stay out of the way', () => {
  it('are excluded by default', () => {
    // Nine screens call fetchCustomers for their pickers. Exclusion has to be
    // the default, or every one of them keeps offering archived people.
    const { db, calls } = fakeDb();
    return createCustomerDomain({ db, context: ctx }).list().then(() => {
      expect(calls[0].filters).toHaveProperty('archived_at', null);
    });
  });

  it('can be asked for explicitly', async () => {
    const { db, calls } = fakeDb();
    await createCustomerDomain({ db, context: ctx }).list({ includeArchived: true });
    expect(calls[0].filters).not.toHaveProperty('archived_at');
  });

  it('are still scoped to the context shops when included', async () => {
    const { db, calls } = fakeDb();
    await createCustomerDomain({ db, context: ctx }).list({ includeArchived: true });
    expect(calls[0].filters.shop_id).toEqual(['shop-A', 'shop-B']);
  });
});

describe('archiving', () => {
  it('sets a timestamp rather than removing the row', async () => {
    const { db, calls } = fakeDb([{ id: 'C-1', name: 'Ai Peng' }]);
    await createCustomerDomain({ db, context: ctx }).archive('C-1', 'duplicate record');

    expect(calls.some(c => c.op === 'delete')).toBe(false);
    const update = calls.find(c => c.op === 'update')!.payload as Record<string, unknown>;
    expect(update.archived_at).toEqual(expect.any(String));
    expect(update.archived_reason).toBe('duplicate record');
  });

  it('is audited with its reason', async () => {
    const { db, rpcCalls } = fakeDb([{ id: 'C-1', name: 'Ai Peng' }]);
    await createCustomerDomain({ db, context: ctx }).archive('C-1', 'duplicate record');
    expect(rpcCalls[0].args.p_action).toBe('customer.archived');
    expect(rpcCalls[0].args.p_entity_id).toBe('C-1');
    expect(rpcCalls[0].args.p_metadata).toMatchObject({ reason: 'duplicate record' });
  });

  it('restores by clearing the timestamp', async () => {
    const { db, calls, rpcCalls } = fakeDb([{ id: 'C-1', name: 'Ai Peng', archived_at: '2026-08-17' }]);
    await createCustomerDomain({ db, context: ctx }).unarchive('C-1');
    const update = calls.find(c => c.op === 'update')!.payload as Record<string, unknown>;
    expect(update.archived_at).toBeNull();
    expect(update.archived_reason).toBeNull();
    expect(rpcCalls[0].args.p_action).toBe('customer.restored');
  });

  it('does nothing for a customer in another shop', async () => {
    // The scoped read finds nothing, so there is no write and no audit row
    // claiming one happened.
    const { db, calls, rpcCalls } = fakeDb([]);
    const result = await createCustomerDomain({ db, context: ctx }).archive('C-9', 'x');
    expect(result).toBeNull();
    expect(calls.some(c => c.op === 'update')).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('the delete rules that make archiving necessary', () => {
  const M3A = readFileSync(join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m3a_customer_archive_column.sql'), 'utf8');
  const M3B = readFileSync(join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m3b_customer_delete_rules.sql'), 'utf8');
  const B_CODE = M3B.replace(/^\s*--.*$/gm, '');

  it('closes every remaining SET NULL link to customers', () => {
    // Deleting a customer used to blank customer_id on these, leaving records
    // belonging to nobody and indistinguishable from ones never linked.
    for (const table of ['estimates', 'inspections', 'invoices', 'maintenance_schedules', 'repair_orders']) {
      expect(B_CODE).toMatch(new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]{0,400}?ON UPDATE CASCADE ON DELETE RESTRICT`));
    }
  });

  it('replaces each constraint rather than guarding around it', () => {
    // A guard would skip the fix while the file claimed to have made it — the
    // exact mistake caught on the invoice link.
    const drops = B_CODE.match(/DROP CONSTRAINT IF EXISTS \w+_customer_id_fkey/g) ?? [];
    expect(drops).toHaveLength(5);
  });

  it('leaves vehicle_images cascading from vehicles', () => {
    // A photo of a vehicle has no meaning without the vehicle.
    expect(M3B).toMatch(/vehicle_images\.vehicle_id stays CASCADE/);
  });

  it('adds the archive column in a SEPARATE migration that runs first', () => {
    // The app cannot filter on a column that does not exist, and the
    // constraints cannot land before the app offers Archive. Two halves, two
    // orders — stated in the files rather than left to memory.
    expect(M3A).toMatch(/BEFORE deploying the M3 application change/i);
    expect(M3B).toMatch(/AFTER the M3 application change is deployed/i);
  });

  it('keeps the archive column nullable and additive', () => {
    expect(M3A).toMatch(/ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/i);
    expect(M3A).not.toMatch(/archived_at TIMESTAMPTZ NOT NULL/i);
  });

  it('is reversible', () => {
    expect(M3A).toMatch(/DROP COLUMN IF EXISTS archived_at/);
    expect(M3B).toMatch(/ON DELETE SET NULL in place of RESTRICT/);
  });
});

describe('the customers screen offers archiving, not deletion', () => {
  const VIEW = readFileSync(join(__dirname, '..', '..', '..', 'features/customers/CustomersView.tsx'), 'utf8');

  it('archives from the list and the drawer', () => {
    expect(VIEW).toMatch(/handleArchive\(c\)/);
    expect(VIEW).toMatch(/handleArchive\(selected\)/);
  });

  it('only offers permanent deletion for something already archived', () => {
    const rowActions = VIEW.slice(VIEW.indexOf('c.archivedAt ? ('), VIEW.indexOf('handleArchive(c)'));
    expect(rowActions).toMatch(/handleDelete\(c\)/);
  });

  it('stops reporting a constraint violation as a connection problem', () => {
    // The old handler caught everything and said "check your connection",
    // which is how a refused delete reads as a network fault.
    expect(VIEW).not.toMatch(/Delete failed\. Check your connection\./);
  });
});
