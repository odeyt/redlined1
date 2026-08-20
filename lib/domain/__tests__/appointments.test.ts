/**
 * Appointment rules, ported out of the browser service.
 *
 * The model is unusual and these tests exist mostly to stop someone
 * "improving" it: there is no timestamp, no duration, no end time, no shop
 * timezone, no foreign keys and no status machine. Each of those is a
 * deliberate reflection of what Redlined1 actually stores.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  dateProblem, timeProblem, DEFAULT_REMINDER,
  createAppointmentDomain, AppointmentError,
} from '../appointments';
import { createDomainContext } from '../context';

describe('the date is a calendar date, checked against the calendar', () => {
  it('accepts a real date', () => {
    expect(dateProblem('2026-08-21')).toBeNull();
  });

  it('refuses a date that matches the shape but does not exist', () => {
    // "2026-02-30" passes any regex and is not a day. Accepted, it becomes an
    // appointment nobody can attend.
    expect(dateProblem('2026-02-30')).toBeTruthy();
    expect(dateProblem('2026-13-01')).toBeTruthy();
  });

  it('accepts a real leap day and refuses a fake one', () => {
    expect(dateProblem('2028-02-29')).toBeNull();
    expect(dateProblem('2026-02-29')).toBeTruthy();
  });

  it.each(['21-08-2026', '2026/08/21', '2026-8-1', 'today', ''])('refuses %s', bad => {
    expect(dateProblem(bad)).toBeTruthy();
  });
});

describe('the time is a 24-hour wall clock', () => {
  it.each(['09:00', '10:10', '00:00', '23:59'])('accepts %s', good => {
    expect(timeProblem(good)).toBeNull();
  });

  it.each(['9:00', '24:00', '10:60', '9am', '10:10:00', ''])('refuses %s', bad => {
    // The column is TEXT and ordering is lexicographic, so a stray format
    // does not just look odd — it sorts into the wrong place forever.
    expect(timeProblem(bad)).toBeTruthy();
  });
});

describe('creating an appointment', () => {
  const SHOP = '11111111-1111-4111-8111-111111111111';

  const context = createDomainContext({
    organizationId: '22222222-2222-4222-8222-222222222222',
    shopId: SHOP,
    shopIds: [SHOP],
    actor: { userId: null, type: 'api', role: 'api_key' },
    capabilities: ['appointments.read', 'appointments.manage'],
  });

  function fakeDb() {
    const calls: { table: string; op: string; payload?: unknown }[] = [];
    const chainFor = (table: string, op: string, payload?: unknown) => {
      calls.push({ table, op, payload });
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain, eq: () => chain, in: () => chain,
        gte: () => chain, lte: () => chain, order: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({
          data: { id: 'A-1', shop_id: SHOP, ...(payload as Record<string, unknown>) },
          error: null,
        }),
      });
      return chain;
    };
    return {
      calls,
      from: (table: string) => ({
        select: () => chainFor(table, 'select'),
        insert: (p: unknown) => chainFor(table, 'insert', p),
        update: (p: unknown) => chainFor(table, 'update', p),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
  }

  const domain = (db: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createAppointmentDomain({ db: db as any, context });

  it('writes shop_id from the context', async () => {
    const db = fakeDb();
    await domain(db).create({ date: '2026-08-21', time: '09:00' });
    const insert = db.calls.find(c => c.table === 'appointments' && c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).shop_id).toBe(SHOP);
  });

  it('refuses an impossible date before touching the database', async () => {
    const db = fakeDb();
    await expect(domain(db).create({ date: '2026-02-30', time: '09:00' }))
      .rejects.toMatchObject({ reason: 'INVALID_DATE' });
    expect(db.calls.filter(c => c.op === 'insert')).toHaveLength(0);
  });

  it('refuses an impossible time before touching the database', async () => {
    const db = fakeDb();
    await expect(domain(db).create({ date: '2026-08-21', time: '25:00' }))
      .rejects.toMatchObject({ reason: 'INVALID_TIME' });
    expect(db.calls.filter(c => c.op === 'insert')).toHaveLength(0);
  });

  it('defaults the reminder to the value the old service used', async () => {
    const db = fakeDb();
    await domain(db).create({ date: '2026-08-21', time: '09:00' });
    const insert = db.calls.find(c => c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).reminder).toBe(DEFAULT_REMINDER);
  });

  it('does not look up a customer, vehicle or technician', async () => {
    const db = fakeDb();
    await domain(db).create({
      date: '2026-08-21', time: '09:00',
      customer: 'SAISAVANH MOTOR', vehicle: 'Audi R8 2008 #6666', technician: 'Beck',
    });
    // They are free text, not references — there is nothing to resolve. A
    // lookup here would imply a relationship the schema does not have.
    expect(db.calls.filter(c => ['customers', 'vehicles', 'technicians'].includes(c.table))).toHaveLength(0);
  });

  it('stores those three as the text they are', async () => {
    const db = fakeDb();
    await domain(db).create({ date: '2026-08-21', time: '09:00', customer: 'SAISAVANH MOTOR' });
    const insert = db.calls.find(c => c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).customer).toBe('SAISAVANH MOTOR');
  });

  it('refuses without the capability', async () => {
    const readOnly = createDomainContext({
      organizationId: '2', shopId: SHOP, shopIds: [SHOP],
      actor: { userId: null, type: 'api', role: 'api_key' },
      capabilities: ['appointments.read'],
    });
    const db = fakeDb();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createAppointmentDomain({ db: db as any, context: readOnly }).create({ date: '2026-08-21', time: '09:00' }),
    ).rejects.toThrow();
  });

  it('reports a missing appointment on patch rather than updating nothing', async () => {
    const db = fakeDb(); // maybeSingle returns null, so `get` finds nothing
    await expect(domain(db).patch('A-missing', { time: '10:00' }))
      .rejects.toBeInstanceOf(AppointmentError);
    expect(db.calls.filter(c => c.op === 'update')).toHaveLength(0);
  });
});

describe('what this model deliberately does NOT have', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'domain', 'appointments.ts'), 'utf8');

  it('has no duration or end time in the domain shape', () => {
    // If someone adds these, they must add the columns and the migration too —
    // failing here is the reminder that the data does not carry them.
    expect(source).not.toMatch(/\bduration\b\s*:/);
    expect(source).not.toMatch(/\bendTime\b/);
  });

  it('does not convert the wall clock into an instant', () => {
    // No timezone exists to convert with: shops has no timezone column.
    expect(source).not.toContain('toISOString');
    expect(source).not.toContain('getTimezoneOffset');
  });
});
