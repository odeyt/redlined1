/**
 * Attendance and leave.
 *
 * The behavioural half runs against a fake database; the access rules and the
 * overlap constraint are pinned to the migration, since nothing here runs SQL.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import {
  createAttendanceDomain, AttendanceError, datesInRange, leaveDayCount,
  PRESENT_STATUSES,
} from '../attendance';
import type { DomainDb } from '../db';
import { DEFAULT_CAPABILITIES, CAPABILITIES } from '@/lib/auth/capabilities';

interface Recorded {
  table: string;
  op: string;
  filters: Record<string, unknown>;
  payload?: unknown;
  options?: unknown;
}

function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: Recorded[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  function builder(table: string, op: string) {
    const rec: Recorded = { table, op, filters: {} };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'order', 'eq', 'in', 'is', 'gte', 'lte', 'maybeSingle', 'single']) {
      chain[m] = (...args: unknown[]) => {
        if (['eq', 'in', 'is', 'gte', 'lte'].includes(m)) rec.filters[String(args[0])] = args[1];
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
        upsert: (p: unknown, o: unknown) => {
          const b = builder(table, 'upsert');
          calls[calls.length - 1].payload = p;
          calls[calls.length - 1].options = o;
          return b;
        },
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

const context = (role: 'owner' | 'technician' = 'owner') => createDomainContext({
  organizationId: 'org-1',
  shopId: 'shop-A',
  shopIds: ['shop-A', 'shop-B'],
  actor: { type: 'user', userId: 'u-1', role },
  capabilities: DEFAULT_CAPABILITIES[role],
});

const DAY = {
  id: 'A-1', organization_id: 'org-1', shop_id: 'shop-A',
  employee_id: 'E-1', work_date: '2026-08-20', status: 'Present',
};

const REQUEST = {
  id: 'L-1', organization_id: 'org-1', employee_id: 'E-1', leave_type_id: 'T-1',
  start_date: '2026-08-24', end_date: '2026-08-26', half_day: false, status: 'Pending',
};

describe('a working day belongs to the person, not the shop', () => {
  it('reads by organization, so a two-location person has one record', async () => {
    const { db, calls } = fakeDb([DAY]);
    await createAttendanceDomain({ db, context: context() }).listDays('2026-08-01', '2026-08-31');
    expect(calls[0].filters.organization_id).toBe('org-1');
    expect(calls[0].filters).not.toHaveProperty('shop_id');
  });

  it('upserts on the person and the date', async () => {
    // Marking the same day twice means "I got it wrong", not "they worked two
    // Tuesdays". The conflict target is what makes that true.
    const { db, calls } = fakeDb([DAY]);
    await createAttendanceDomain({ db, context: context() }).recordDay({
      employeeId: 'E-1', workDate: '2026-08-20', status: 'Present',
    });
    const upsert = calls.find(c => c.op === 'upsert');
    expect((upsert?.options as { onConflict?: string })?.onConflict).toBe('employee_id,work_date');
  });

  it('clears the clock times when the day is not a working one', async () => {
    // Yesterday's times left on a day since corrected to Absent is how a
    // person reads as both away and on the clock.
    const { db, calls } = fakeDb([DAY]);
    await createAttendanceDomain({ db, context: context() }).recordDay({
      employeeId: 'E-1', workDate: '2026-08-20', status: 'Absent',
      firstIn: '2026-08-20T08:00:00Z', lastOut: '2026-08-20T17:00:00Z', minutesWorked: 540,
    });
    const payload = calls.find(c => c.op === 'upsert')?.payload as Record<string, unknown>;
    expect(payload.first_in).toBeNull();
    expect(payload.last_out).toBeNull();
    expect(payload.minutes_worked).toBeNull();
  });

  it('keeps them when the person was there', async () => {
    const { db, calls } = fakeDb([DAY]);
    await createAttendanceDomain({ db, context: context() }).recordDay({
      employeeId: 'E-1', workDate: '2026-08-20', status: 'Late', minutesWorked: 400,
    });
    const payload = calls.find(c => c.op === 'upsert')?.payload as Record<string, unknown>;
    expect(payload.minutes_worked).toBe(400);
    expect(PRESENT_STATUSES).toContain('Late');
  });

  it('records a correction as a correction, not as a new entry', async () => {
    // The only question anyone asks of this table is who changed a day after
    // the fact. Filing both as "recorded" would bury it.
    const { db, rpcCalls } = fakeDb([DAY]);
    await createAttendanceDomain({ db, context: context() }).recordDay({
      employeeId: 'E-1', workDate: '2026-08-20', status: 'Absent',
    });
    expect(rpcCalls[0].args).toMatchObject({ p_action: 'attendance.corrected' });
  });

  it('rejects a status the database would refuse', async () => {
    const { db } = fakeDb([DAY]);
    await expect(
      createAttendanceDomain({ db, context: context() })
        .recordDay({ employeeId: 'E-1', workDate: '2026-08-20', status: 'Sick' as 'Present' }),
    ).rejects.toThrow(AttendanceError);
  });
});

describe('leave', () => {
  it('always starts Pending, whoever asks', async () => {
    // There is no path that creates an already-approved request, so approval
    // always leaves a decision naming who made it.
    const { db, calls } = fakeDb([REQUEST]);
    await createAttendanceDomain({ db, context: context() }).requestLeave({
      employeeId: 'E-1', leaveTypeId: 'T-1', startDate: '2026-08-24', endDate: '2026-08-26',
    });
    expect((calls[0].payload as Record<string, unknown>).status).toBe('Pending');
  });

  it('turns the overlap constraint into a sentence', async () => {
    const db = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: null,
              error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' },
            }),
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as DomainDb;

    await expect(
      createAttendanceDomain({ db, context: context() }).requestLeave({
        employeeId: 'E-1', leaveTypeId: 'T-1', startDate: '2026-08-24', endDate: '2026-08-26',
      }),
    ).rejects.toThrow(/already has leave booked or requested/);
  });

  it('refuses a half day spanning two dates', async () => {
    const { db } = fakeDb([REQUEST]);
    await expect(
      createAttendanceDomain({ db, context: context() }).requestLeave({
        employeeId: 'E-1', leaveTypeId: 'T-1',
        startDate: '2026-08-24', endDate: '2026-08-25', halfDay: true,
      }),
    ).rejects.toThrow(/same day/);
  });

  it('will not let a technician approve anything', async () => {
    // A technician who could approve their own request is the whole control
    // gone. They may still raise one.
    const { db } = fakeDb([REQUEST]);
    const domain = createAttendanceDomain({ db, context: context('technician') });
    await expect(domain.decideLeave('L-1', 'Approved')).rejects.toThrow();
    expect(DEFAULT_CAPABILITIES.technician).toContain('leave.request');
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('leave.approve');
  });

  it('refuses to decide a request that was already decided', async () => {
    const { db } = fakeDb([{ ...REQUEST, status: 'Approved' }]);
    await expect(
      createAttendanceDomain({ db, context: context() }).decideLeave('L-1', 'Rejected'),
    ).rejects.toThrow(/already approved/i);
  });

  it('writes an attendance day for every date it covers', async () => {
    const { db, calls } = fakeDb([REQUEST]);
    const result = await createAttendanceDomain({ db, context: context() })
      .decideLeave('L-1', 'Approved');
    const upsert = calls.find(c => c.op === 'upsert');
    expect((upsert?.payload as unknown[]).length).toBe(3);   // 24th, 25th, 26th
    expect(result.dayError).toBeNull();
  });

  it('reports a failure to write the days rather than claiming success', async () => {
    // The leave IS granted at that point. Saying nothing would leave a person
    // approved but missing from the calendar, with nobody aware.
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: REQUEST, error: null }) }) }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: { ...REQUEST, status: 'Approved' }, error: null }),
                }),
              }),
            }),
          }),
        }),
        upsert: () => ({
          select: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
        }),
      }),
      rpc: () => Promise.resolve({ data: 'audit-1', error: null }),
    } as unknown as DomainDb;

    const result = await createAttendanceDomain({ db, context: context() })
      .decideLeave('L-1', 'Approved');
    expect(result.request.status).toBe('Approved');
    expect(result.dayError).toMatch(/permission denied/);
  });
});

describe('counting days', () => {
  it('includes both ends', () => {
    expect(datesInRange('2026-08-24', '2026-08-26')).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
  });

  it('survives a month boundary', () => {
    expect(datesInRange('2026-08-31', '2026-09-01')).toEqual(['2026-08-31', '2026-09-01']);
  });

  it('counts a half day as half', () => {
    expect(leaveDayCount({ startDate: '2026-08-24', endDate: '2026-08-24', halfDay: true })).toBe(0.5);
    expect(leaveDayCount({ startDate: '2026-08-24', endDate: '2026-08-26', halfDay: false })).toBe(3);
  });

  it('refuses a backwards range', () => {
    expect(() => datesInRange('2026-08-26', '2026-08-24')).toThrow(AttendanceError);
  });
});

describe('the migration says what the application says', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m6_attendance_leave.sql'),
    'utf8',
  );

  it('stops one person holding two live requests over the same dates', () => {
    // Enforced in the database, not the application: imports, an API and AI
    // callers are all on the roadmap, and a double-booked week only surfaces
    // when payroll disagrees with the rota.
    expect(SQL).toMatch(/EXCLUDE USING gist/);
    expect(SQL).toMatch(/status IN \('Pending', 'Approved'\)/);
  });

  it('lets nobody delete attendance or leave', () => {
    // Employment history. A day is corrected and a request is cancelled; both
    // leave the row behind.
    expect(SQL).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.attendance_days TO authenticated/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.attendance_days FROM PUBLIC/);
    expect(SQL).not.toMatch(/GRANT[^;]*DELETE[^;]*attendance_days/);
  });

  it('lets a person see their own attendance whatever their role', () => {
    // Withholding someone's own record of when they worked, from them, is not
    // defensible when it is what their pay comes from.
    expect(SQL).toMatch(/e\.user_id = auth\.uid\(\)/);
  });

  it('marks attendance and leave enforced, since something now enforces them', () => {
    for (const id of ['attendance.read', 'attendance.manage', 'leave.read', 'leave.request', 'leave.approve']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
    }
  });
});
