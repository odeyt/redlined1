/**
 * Reminders domain against a fake database.
 *
 * The access rules, the cap and the history live in SQL and are exercised by
 * tests/db/run-reminders-db-tests.mjs against a real Postgres. This covers
 * what the domain itself decides: what it sends, what it refuses before
 * sending, retries, and how refusals come back.
 */
import { createDomainContext } from '../context';
import { createReminderDomain, ReminderError } from '../reminders';
import type { DomainDb } from '../db';

const SHOP_A = '5a0c1e2d-3b4f-4a6c-8d7e-9f0a1b2c3d4e';
const SHOP_B = '6b1d2f3e-4c5a-4b7d-9e8f-0a1b2c3d4e5f';
const STRANGER = '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const REMINDER = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

interface Call { table: string; op: string; filters: Record<string, unknown>; select?: string; payload?: Record<string, unknown> }

type Result = { data: unknown; error: unknown };

/** Scripted results per `table:op`, consumed in order; the default is an empty success. */
function fakeDb(script: Record<string, Result[]> = {}) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const next = (key: string): Result => script[key]?.shift() ?? { data: key.endsWith(':select') ? [] : null, error: null };

  function builder(table: string, op: string, payload?: Record<string, unknown>) {
    const call: Call = { table, op, filters: {}, payload };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'in', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        if (m === 'select') call.select = String(args[0] ?? '');
        if (m === 'eq' || m === 'in') call.filters[String(args[0])] = args[1];
        return chain;
      };
    }
    chain.single = () => Promise.resolve(next(`${table}:${op}`));
    chain.maybeSingle = () => Promise.resolve(next(`${table}:${op}`));
    chain.then = (resolve: (v: Result) => unknown) => Promise.resolve(next(`${table}:${op}`)).then(resolve);
    return chain;
  }

  const db = {
    from(table: string) {
      return {
        select: (cols: string) => { const b = builder(table, 'select'); (b.select as (c: string) => unknown)(cols); return b; },
        insert: (p: Record<string, unknown>) => builder(table, 'insert', p),
        update: (p: Record<string, unknown>) => builder(table, 'update', p),
      };
    },
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(next(`rpc:${fn}`));
    },
  } as unknown as DomainDb;
  return { db, calls, rpcCalls };
}

const context = () => createDomainContext({
  shopId: SHOP_A,
  shopIds: [SHOP_A, SHOP_B],
  actor: { type: 'user', userId: USER, role: 'technician' },
});

const row = (over: Record<string, unknown> = {}) => ({
  id: REMINDER, shop_id: SHOP_A, title: 'Call supplier', notes: null, due_at: '2026-10-01T09:00:00Z',
  priority: 'normal', status: 'open', assigned_to: USER, customer_id: null, vehicle_id: null, job_card_id: null,
  created_by: USER, completed_by: null, completed_at: null, created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z',
  ...over,
});

const input = { title: 'Call supplier', dueAt: '2026-10-01T09:00:00Z' };

describe('create', () => {
  it('sends an open reminder in the active shop, with no completion fields', async () => {
    const { db, calls } = fakeDb({ 'shop_reminders:insert': [{ data: row(), error: null }] });
    const r = await createReminderDomain({ db, context: context() }).create({ ...input, id: REMINDER });
    expect(r.id).toBe(REMINDER);
    const insert = calls.find(c => c.op === 'insert')!;
    expect(insert.payload).toMatchObject({ shop_id: SHOP_A, status: 'open', title: 'Call supplier', priority: 'normal', id: REMINDER });
    expect(insert.payload).not.toHaveProperty('completed_at');
    expect(insert.payload).not.toHaveProperty('completed_by');
  });

  it('a request cannot name its own shop — not a stranger\'s, not even another of the user\'s', async () => {
    const { db, calls } = fakeDb();
    const domain = createReminderDomain({ db, context: context() });
    await expect(domain.create({ ...input, shopId: STRANGER } as never)).rejects.toBeInstanceOf(ReminderError);
    await expect(domain.create({ ...input, shopId: SHOP_B } as never)).rejects.toBeInstanceOf(ReminderError);
    expect(calls).toHaveLength(0);
  });

  it('refuses invalid input before asking the database', async () => {
    const { db, calls } = fakeDb();
    const domain = createReminderDomain({ db, context: context() });
    await expect(domain.create({ ...input, title: '' })).rejects.toThrow('Give the reminder a title');
    await expect(domain.create({ ...input, dueAt: 'soon' })).rejects.toThrow('valid due date');
    await expect(domain.create({ ...input, vehicleId: 'VIN123' })).rejects.toBeInstanceOf(ReminderError);
    expect(calls).toHaveLength(0);
  });

  it('a user in two shops creates in the ACTIVE shop, even when linking a record from the other', async () => {
    // Context: active SHOP_A, reads span SHOP_A and SHOP_B (a mirrored pair).
    const { db, calls } = fakeDb({
      'shop_reminders:insert': [{ data: null, error: { code: 'P0001', message: 'REMINDER_LINK_INVALID:vehicle' } }],
    });
    const failure = await createReminderDomain({ db, context: context() })
      .create({ ...input, vehicleId: '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b' }).catch(e => e);
    // Only one call: the insert, into the active shop. The vehicle's own shop
    // is never looked up and never used.
    expect(calls.map(c => `${c.table}:${c.op}`)).toEqual(['shop_reminders:insert']);
    expect(calls[0].payload!.shop_id).toBe(SHOP_A);
    expect(failure).toBeInstanceOf(ReminderError);
    expect(failure.message).toMatch(/not in the location you are working in/);
  });

  it('a user in one shop creates in that shop', async () => {
    const single = createDomainContext({ shopId: SHOP_B, actor: { type: 'user', userId: USER, role: 'owner' } });
    const { db, calls } = fakeDb({ 'shop_reminders:insert': [{ data: row({ shop_id: SHOP_B }), error: null }] });
    await createReminderDomain({ db, context: single }).create(input);
    expect(calls[0].payload!.shop_id).toBe(SHOP_B);
  });

  it('the link refusal reads the same whether the record is missing or in another shop', async () => {
    const { reminderRefusalMessage } = jest.requireActual('@/lib/reminders/entitlements');
    const text = reminderRefusalMessage({ kind: 'link_invalid', entity: 'customer' });
    expect(text).not.toMatch(/another shop has|exists|belongs to shop/i);
  });

  it('flag off: a create is refused with a sentence, and offers no upgrade', async () => {
    const { db } = fakeDb({ 'shop_reminders:insert': [{ data: null, error: { code: 'P0001', message: 'REMINDERS_DISABLED' } }] });
    const failure = await createReminderDomain({ db, context: context() }).create(input).catch(e => e);
    expect(failure.message).toBe('Reminders are turned off for this shop.');
    expect(failure.upgrade).toBe(false);
  });

  it('a retried create returns the reminder the first attempt made', async () => {
    const { db, calls } = fakeDb({
      'shop_reminders:insert': [{ data: null, error: { code: '23505', message: 'duplicate key value' } }],
      'shop_reminders:select': [{ data: row(), error: null }],
    });
    const r = await createReminderDomain({ db, context: context() }).create({ ...input, id: REMINDER });
    expect(r.id).toBe(REMINDER);
    expect(calls.filter(c => c.op === 'insert')).toHaveLength(1);
  });

  it('turns the Free Forever cap into an upgrade-able sentence', async () => {
    const { db } = fakeDb({ 'shop_reminders:insert': [{ data: null, error: { code: 'P0001', message: 'REMINDER_LIMIT:3' } }] });
    const failure = await createReminderDomain({ db, context: context() }).create(input).catch(e => e);
    expect(failure).toBeInstanceOf(ReminderError);
    expect(failure.upgrade).toBe(true);
    expect(failure.message).toMatch(/3 open reminders/);
  });

  it('an RLS refusal on create says no access, and offers no upgrade', async () => {
    const { db } = fakeDb({ 'shop_reminders:insert': [{ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "shop_reminders"' } }] });
    const failure = await createReminderDomain({ db, context: context() }).create(input).catch(e => e);
    expect(failure.message).toMatch(/do not have access/);
    expect(failure.upgrade).toBe(false);
  });

  it('passes a genuine failure through rather than disguising it', async () => {
    const { db } = fakeDb({ 'shop_reminders:insert': [{ data: null, error: new Error('fetch failed') }] });
    await expect(createReminderDomain({ db, context: context() }).create(input)).rejects.toThrow('fetch failed');
  });
});

describe('status changes', () => {
  it('complete sends only the status — the database stamps who and when', async () => {
    const { db, calls } = fakeDb({ 'shop_reminders:update': [{ data: row({ status: 'completed', completed_at: '2026-09-29T10:00:00Z', completed_by: USER }), error: null }] });
    const r = await createReminderDomain({ db, context: context() }).complete(REMINDER);
    expect(r.status).toBe('completed');
    const update = calls.find(c => c.op === 'update')!;
    expect(update.payload).toEqual({ status: 'completed' });
    expect(update.filters).toMatchObject({ id: REMINDER, shop_id: [SHOP_A, SHOP_B] });
  });

  it('reopen and cancel send their status', async () => {
    const { db, calls } = fakeDb({
      'shop_reminders:update': [{ data: row(), error: null }, { data: row({ status: 'cancelled' }), error: null }],
    });
    const domain = createReminderDomain({ db, context: context() });
    await domain.reopen(REMINDER);
    await domain.cancel(REMINDER);
    expect(calls.filter(c => c.op === 'update').map(c => c.payload)).toEqual([{ status: 'open' }, { status: 'cancelled' }]);
  });

  it('a reminder nobody can see reads as not found, whether or not it exists', async () => {
    const { db } = fakeDb({ 'shop_reminders:update': [{ data: null, error: null }] });
    const domain = createReminderDomain({ db, context: context() });
    const missing = await domain.complete(REMINDER).catch(e => e);
    const malformed = await domain.complete('not-an-id').catch(e => e);
    expect(missing.message).toBe(malformed.message);
    expect(missing.message).toMatch(/could not be found/);
  });

  it('reopening past the cap is refused with the upgrade sentence', async () => {
    const { db } = fakeDb({ 'shop_reminders:update': [{ data: null, error: { message: 'REMINDER_LIMIT:3' } }] });
    const failure = await createReminderDomain({ db, context: context() }).reopen(REMINDER).catch(e => e);
    expect(failure.upgrade).toBe(true);
  });
});

describe('update', () => {
  it('sends only the fields that were given', async () => {
    const { db, calls } = fakeDb({ 'shop_reminders:update': [{ data: row({ priority: 'high' }), error: null }] });
    await createReminderDomain({ db, context: context() }).update(REMINDER, { priority: 'high' });
    expect(calls.find(c => c.op === 'update')!.payload).toEqual({ priority: 'high' });
  });

  it('refuses a status or shop change smuggled through an edit', async () => {
    const { db, calls } = fakeDb();
    const domain = createReminderDomain({ db, context: context() });
    await expect(domain.update(REMINDER, { status: 'completed' } as never)).rejects.toBeInstanceOf(ReminderError);
    await expect(domain.update(REMINDER, { shopId: SHOP_B } as never)).rejects.toBeInstanceOf(ReminderError);
    expect(calls).toHaveLength(0);
  });

  it('team assignment refused by the plan comes back as an upgrade prompt', async () => {
    const { db } = fakeDb({ 'shop_reminders:update': [{ data: null, error: { message: 'REMINDER_TEAM_PLAN' } }] });
    const failure = await createReminderDomain({ db, context: context() })
      .update(REMINDER, { assignedTo: '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f' }).catch(e => e);
    expect(failure.upgrade).toBe(true);
    expect(failure.message).toMatch(/Starter or above/);
  });
});

describe('reads', () => {
  it('lists within the context\'s shops', async () => {
    const { db, calls } = fakeDb({ 'shop_reminders:select': [{ data: [row()], error: null }] });
    const list = await createReminderDomain({ db, context: context() }).list({ state: 'open' });
    expect(list).toHaveLength(1);
    expect(calls[0].filters).toMatchObject({ shop_id: [SHOP_A, SHOP_B], status: 'open' });
  });

  it('link labels never ask for a VIN', async () => {
    const { db, calls } = fakeDb({
      'customers:select': [{ data: [{ id: 'CUST-1', name: 'Somchai' }], error: null }],
      'vehicles:select': [{ data: [{ id: 'v1', year: 2019, make: 'Toyota', model: 'Hilux', plate: 'ກກ 1234' }], error: null }],
    });
    const linked = { customerId: 'CUST-1', vehicleId: 'v1', jobCardId: 'JC-1' };
    const labels = await createReminderDomain({ db, context: context() }).linkLabels([linked as never]);
    expect(labels).toEqual({ 'customer:CUST-1': 'Somchai', 'vehicle:v1': '2019 Toyota Hilux · ກກ 1234', 'job_card:JC-1': 'JC-1' });
    for (const c of calls) expect(c.select ?? '').not.toMatch(/vin/i);
  });

  it('asks the database for the plan tier rather than guessing', async () => {
    const { db, rpcCalls } = fakeDb({ 'rpc:reminder_plan_tier': [{ data: 'solo', error: null }] });
    expect(await createReminderDomain({ db, context: context() }).tier()).toBe('solo');
    expect(rpcCalls).toEqual([{ fn: 'reminder_plan_tier', args: { p_shop_id: SHOP_A } }]);
  });
});
