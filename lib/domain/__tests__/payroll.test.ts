/**
 * Payroll.
 *
 * Most of this is the calculation, because it decides what people are paid and
 * it is the part with no second chance: a wrong figure that reaches a payslip
 * has already been handed over in cash by the time anyone checks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import {
  createPayrollDomain, calculateLine, netOf, totalsByCurrency, PayrollError,
  type PayrollLine,
} from '../payroll';
import type { SalaryRecord } from '../salary';
import type { AttendanceDay, AttendanceStatus } from '../attendance';
import type { DomainDb } from '../db';
import { DEFAULT_CAPABILITIES, CAPABILITIES } from '@/lib/auth/capabilities';

function rate(over: Partial<SalaryRecord>): SalaryRecord {
  return {
    id: 'S-1', organizationId: 'org-1', employeeId: 'E-1', effectiveFrom: '2026-01-01',
    payType: 'Monthly', amount: 500, currency: 'USD', notes: '', recordedBy: null,
    createdAt: '', ...over,
  };
}

function day(status: AttendanceStatus, minutes: number | null = null): AttendanceDay {
  return {
    id: 'A', organizationId: 'org-1', shopId: 'shop-A', employeeId: 'E-1',
    workDate: '2026-08-01', status, firstIn: null, lastOut: null,
    minutesWorked: minutes, notes: '', recordedBy: null, createdAt: '', updatedAt: '',
  };
}

function line(over: Partial<PayrollLine>): PayrollLine {
  return {
    id: 'L', runId: 'R', organizationId: 'org-1', employeeId: 'E-1',
    currency: 'USD', payType: 'Monthly', rateAmount: 500, salaryRecordId: null,
    daysWorked: 0, daysLeavePaid: 0, daysAbsent: 0, hoursWorked: 0,
    gross: 500, advanceDeducted: 0, otherDeduction: 0, net: 500, notes: '', ...over,
  };
}

describe('working out one person\'s pay', () => {
  it('uses the rate that applied at the end of the period', () => {
    // Pay agreed mid-period applies to the period it was agreed for. Being
    // told "you are on 700 from June" and then paid 500 for June is the
    // complaint this prevents.
    const history = [rate({ amount: 500, effectiveFrom: '2026-01-01' }),
                     rate({ id: 'S-2', amount: 700, effectiveFrom: '2026-06-15' })];
    const result = calculateLine('E-1', history, [], '2026-06-30');
    expect(result.rateAmount).toBe(700);
    expect(result.salaryRecordId).toBe('S-2');
  });

  it('says so when there is no rate at all', () => {
    // Silently paying zero is the worst available answer.
    const result = calculateLine('E-1', [], [day('Present')], '2026-08-31');
    expect(result.gross).toBe(0);
    expect(result.notes).toMatch(/No pay rate recorded/);
  });

  it('pays an hourly person for the hours actually recorded', () => {
    const history = [rate({ payType: 'Hourly', amount: 5 })];
    const days = [day('Present', 480), day('Present', 450)];
    expect(calculateLine('E-1', history, days, '2026-08-31').gross).toBe(77.5);
  });

  it('flags an hourly person marked present with no hours', () => {
    // Paying zero would be wrong, and wrong silently.
    const history = [rate({ payType: 'Hourly', amount: 5 })];
    const result = calculateLine('E-1', history, [day('Present'), day('Present')], '2026-08-31');
    expect(result.gross).toBe(0);
    expect(result.notes).toMatch(/no hours recorded/);
  });

  it('pays a daily person for days worked AND paid leave', () => {
    // Paid leave is paid. That is what makes it paid leave.
    const history = [rate({ payType: 'Daily', amount: 20 })];
    const days = [day('Present'), day('Present'), day('Leave'), day('Absent')];
    expect(calculateLine('E-1', history, days, '2026-08-31').gross).toBe(60);
  });

  it('counts a half day as half', () => {
    const history = [rate({ payType: 'Daily', amount: 20 })];
    expect(calculateLine('E-1', history, [day('Half day'), day('Present')], '2026-08-31').gross).toBe(30);
  });

  it('does not pro-rate a monthly rate for absence', () => {
    // The divisor for a day's worth of a month is a policy nobody has set
    // here. Inventing one is how somebody is underpaid by a rule they never
    // agreed to — so the full rate is shown and the absences are flagged.
    const history = [rate({ payType: 'Monthly', amount: 500 })];
    const result = calculateLine('E-1', history, [day('Absent'), day('Absent'), day('Present')], '2026-08-31');
    expect(result.gross).toBe(500);
    expect(result.daysAbsent).toBe(2);
    expect(result.notes).toMatch(/2 absent day\(s\)/);
  });

  it('refuses to guess per-job pay', () => {
    const history = [rate({ payType: 'Per job', amount: 30 })];
    const result = calculateLine('E-1', history, [day('Present'), day('Present')], '2026-08-31');
    expect(result.gross).toBe(0);
    expect(result.notes).toMatch(/Enter the amount/);
  });

  it('treats a holiday as neither worked nor absent', () => {
    // Nobody was expected in. Counting it either way distorts both numbers.
    const history = [rate({ payType: 'Daily', amount: 20 })];
    const result = calculateLine('E-1', history, [day('Holiday'), day('Rest day'), day('Present')], '2026-08-31');
    expect(result.daysWorked).toBe(1);
    expect(result.daysAbsent).toBe(0);
    expect(result.gross).toBe(20);
  });

  it('carries the person\'s own currency onto the line', () => {
    // No conversion anywhere: a THB rate is paid in THB.
    const history = [rate({ currency: 'THB', amount: 12000 })];
    expect(calculateLine('E-1', history, [], '2026-08-31').currency).toBe('THB');
  });
});

describe('net pay', () => {
  it('subtracts advances and other deductions', () => {
    expect(netOf(500, 100, 20)).toBe(380);
  });

  it('never goes below zero', () => {
    // A deduction bigger than the pay means taking money off somebody, which
    // has to be a deliberate act elsewhere — not a subtraction that quietly
    // went past zero.
    expect(netOf(100, 200, 0)).toBe(0);
  });

  it('rounds to whole cents', () => {
    expect(netOf(0.1 + 0.2, 0, 0)).toBe(0.3);
  });
});

describe('run totals', () => {
  it('keeps currencies apart', () => {
    // Three subtotals is the correct answer. One total across USD, THB and LAK
    // would be wrong by a factor of about twenty thousand.
    const totals = totalsByCurrency([
      line({ currency: 'USD', gross: 500, net: 400 }),
      line({ currency: 'THB', gross: 12000, net: 12000 }),
      line({ currency: 'USD', gross: 300, net: 300 }),
    ]);
    expect(totals).toEqual(expect.arrayContaining([
      { currency: 'USD', gross: 800, net: 700 },
      { currency: 'THB', gross: 12000, net: 12000 },
    ]));
    expect(totals).toHaveLength(2);
  });
});

describe('who may run payroll', () => {
  it('is the owner and nobody else', () => {
    // A payroll run holds everyone's pay, so a manager who could read one has
    // been handed salary.read_all by another route.
    expect(DEFAULT_CAPABILITIES.owner).toContain('payroll.manage');
    for (const role of ['manager', 'advisor', 'technician'] as const) {
      expect(DEFAULT_CAPABILITIES[role]).not.toContain('payroll.read');
      expect(DEFAULT_CAPABILITIES[role]).not.toContain('payroll.manage');
    }
  });

  it('is enforced, not planned', () => {
    for (const id of ['payroll.read', 'payroll.manage']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
    }
  });
});

describe('editing a run', () => {
  function fakeDb(runStatus: string) {
    const calls: { table: string; op: string }[] = [];
    const db = {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { status: runStatus }, error: null }) }),
          }),
          delete: () => { calls.push({ table, op: 'delete' }); return { eq: () => Promise.resolve({ error: null }) }; },
          insert: () => { calls.push({ table, op: 'insert' }); return { select: () => Promise.resolve({ data: [], error: null }) }; },
        };
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as DomainDb;
    return { db, calls };
  }

  const owner = createDomainContext({
    organizationId: 'org-1', shopId: 'shop-A', shopIds: ['shop-A'],
    actor: { type: 'user', userId: 'u-1', role: 'owner' },
    capabilities: DEFAULT_CAPABILITIES.owner,
  });

  it('refuses to change a finalised run', async () => {
    // The database blocks this too, with a trigger. Both, because a payslip
    // that changed after it was issued is not a record of anything.
    const { db } = fakeDb('Finalised');
    await expect(
      createPayrollDomain({ db, context: owner }).saveLines('R-1', []),
    ).rejects.toThrow(/finalised/i);
  });

  it('replaces a draft\'s lines rather than merging them', async () => {
    // Recalculating is the normal way to use a draft, and merging would leave
    // lines for people who have since left.
    const { db, calls } = fakeDb('Draft');
    await createPayrollDomain({ db, context: owner }).saveLines('R-1', [
      { employeeId: 'E-1', currency: 'USD', payType: 'Monthly', rateAmount: 500,
        salaryRecordId: null, daysWorked: 20, daysLeavePaid: 0, daysAbsent: 0,
        hoursWorked: 0, gross: 500, advanceDeducted: 0, otherDeduction: 0, net: 500, notes: '' },
    ]);
    expect(calls[0]).toEqual({ table: 'payroll_lines', op: 'delete' });
    expect(calls[1]).toEqual({ table: 'payroll_lines', op: 'insert' });
  });

  it('rejects a period that ends before it starts', async () => {
    const { db } = fakeDb('Draft');
    await expect(
      createPayrollDomain({ db, context: owner }).createRun('2026-08-31', '2026-08-01'),
    ).rejects.toThrow(PayrollError);
  });
});

describe('the migration says what the application says', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m8_payroll.sql'),
    'utf8',
  );

  it('recovers advances inside one transaction', () => {
    // Three tables have to move together. Done from a browser as three calls,
    // a lost connection leaves an advance recovered on the payslip but not in
    // the ledger.
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.finalise_payroll_run/);
    expect(SQL).toMatch(/SECURITY DEFINER/);
  });

  it('checks permission itself, since SECURITY DEFINER bypasses RLS', () => {
    // Without this, any signed-in user could finalise anyone's payroll by
    // calling the function directly.
    expect(SQL).toMatch(/has_capability\(s\.id, 'payroll\.manage'\)/);
    expect(SQL).toMatch(/You do not have permission to finalise payroll/);
  });

  it('locks each advance while recovering it', () => {
    // Two runs finalising at once must not both recover the same balance.
    expect(SQL).toMatch(/FOR UPDATE/);
  });

  it('recovers only advances that were actually paid', () => {
    // An approved advance never handed over is not a debt.
    expect(SQL).toMatch(/a\.status = 'Paid'/);
  });

  it('stops rather than deduct more than is owed', () => {
    expect(SQL).toMatch(/more than the person has outstanding/);
  });

  it('freezes a finalised line with a trigger, not just a grant', () => {
    // Draft lines are edited in place, so UPDATE has to be granted — the
    // trigger is what makes the freeze real.
    expect(SQL).toMatch(/payroll_lines_frozen/);
    expect(SQL).toMatch(/BEFORE UPDATE OR DELETE ON public\.payroll_lines/);
  });

  it('lets nobody hand-write an advance recovery', () => {
    // A recovery row claims an advance was repaid. Only finalising may say so.
    expect(SQL).toMatch(/GRANT SELECT\s+ON public\.payroll_advance_recoveries TO authenticated/);
    expect(SQL).not.toMatch(/GRANT[^;]*INSERT[^;]*payroll_advance_recoveries/);
  });

  it('lets a person see their own payslip', () => {
    expect(SQL).toMatch(/e\.user_id = auth\.uid\(\)/);
  });
});
