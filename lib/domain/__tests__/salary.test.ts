/**
 * Salary and advances.
 *
 * The behavioural half runs against a fake database; the access rules are
 * pinned to the migration, since nothing here executes SQL.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import {
  createSalaryDomain, SalaryError, salaryOn, outstandingFrom,
  type SalaryAdvance, type SalaryRecord,
} from '../salary';
import type { DomainDb } from '../db';
import { DEFAULT_CAPABILITIES, CAPABILITIES } from '@/lib/auth/capabilities';

interface Recorded { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }

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

const context = (role: 'owner' | 'manager' | 'technician' = 'owner') => createDomainContext({
  organizationId: 'org-1',
  shopId: 'shop-A',
  shopIds: ['shop-A'],
  actor: { type: 'user', userId: 'u-1', role },
  capabilities: DEFAULT_CAPABILITIES[role],
});

const RECORD = {
  id: 'S-1', organization_id: 'org-1', employee_id: 'E-1',
  effective_from: '2026-01-01', pay_type: 'Monthly', amount: '500.00', currency: 'USD',
};

const ADVANCE = {
  id: 'AD-1', organization_id: 'org-1', employee_id: 'E-1',
  amount: '100.00', currency: 'USD', requested_on: '2026-08-01',
  status: 'Pending', repaid_amount: '0',
};

function record(over: Partial<SalaryRecord>): SalaryRecord {
  return {
    id: 'x', organizationId: 'org-1', employeeId: 'E-1', effectiveFrom: '2026-01-01',
    payType: 'Monthly', amount: 500, currency: 'USD', notes: '', recordedBy: null,
    createdAt: '', ...over,
  };
}

function advance(over: Partial<SalaryAdvance>): SalaryAdvance {
  return {
    id: 'x', organizationId: 'org-1', employeeId: 'E-1', amount: 100, currency: 'USD',
    requestedOn: '2026-08-01', reason: '', status: 'Paid', paidOn: '2026-08-02',
    repaidAmount: 0, requestedBy: null, decidedBy: null, decidedAt: null,
    decisionNote: '', createdAt: '', ...over,
  };
}

describe('salary is a history, not a number', () => {
  it('answers what someone earned on a past date', () => {
    // The question payroll asks every run. A single current-value column
    // cannot answer it, which is the whole reason this table exists.
    const history = [
      record({ effectiveFrom: '2026-01-01', amount: 500 }),
      record({ effectiveFrom: '2026-06-01', amount: 700 }),
    ];
    expect(salaryOn(history, '2026-03-15')?.amount).toBe(500);
    expect(salaryOn(history, '2026-07-15')?.amount).toBe(700);
  });

  it('ignores a rise that has not started yet', () => {
    // A raise dated next month must not be applied to last month's payroll.
    const history = [
      record({ effectiveFrom: '2026-01-01', amount: 500 }),
      record({ effectiveFrom: '2026-09-01', amount: 900 }),
    ];
    expect(salaryOn(history, '2026-08-20')?.amount).toBe(500);
  });

  it('applies a rate on the day it starts', () => {
    const history = [record({ effectiveFrom: '2026-06-01', amount: 700 })];
    expect(salaryOn(history, '2026-06-01')?.amount).toBe(700);
  });

  it('says nothing rather than guessing for a date before the first rate', () => {
    // Someone hired in June has no March salary. Inventing one would put a
    // number on a payslip that nobody ever agreed to.
    const history = [record({ effectiveFrom: '2026-06-01', amount: 700 })];
    expect(salaryOn(history, '2026-03-01')).toBeNull();
  });

  it('inserts rather than updates', async () => {
    // Correcting a rate means adding the right row. A wrong row that was never
    // used is harmless next to a history that can be rewritten.
    const { db, calls } = fakeDb([RECORD]);
    await createSalaryDomain({ db, context: context() }).setSalary({
      employeeId: 'E-1', effectiveFrom: '2026-09-01', payType: 'Monthly', amount: 700, currency: 'USD',
    });
    expect(calls.some(c => c.table === 'salary_records' && c.op === 'update')).toBe(false);
    expect(calls[0].op).toBe('insert');
  });

  it('refuses a negative rate', async () => {
    const { db } = fakeDb([RECORD]);
    await expect(
      createSalaryDomain({ db, context: context() }).setSalary({
        employeeId: 'E-1', effectiveFrom: '2026-09-01', payType: 'Monthly', amount: -1, currency: 'USD',
      }),
    ).rejects.toThrow(SalaryError);
  });

  it('refuses a rate with no currency', async () => {
    // The same class of bug as parts quotations recording THB while every line
    // was priced in USD.
    const { db } = fakeDb([RECORD]);
    await expect(
      createSalaryDomain({ db, context: context() }).setSalary({
        employeeId: 'E-1', effectiveFrom: '2026-09-01', payType: 'Monthly', amount: 700, currency: '',
      }),
    ).rejects.toThrow(/currency/);
  });

  it('turns a duplicate start date into a sentence', async () => {
    const db = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }),
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as DomainDb;

    await expect(
      createSalaryDomain({ db, context: context() }).setSalary({
        employeeId: 'E-1', effectiveFrom: '2026-01-01', payType: 'Monthly', amount: 700, currency: 'USD',
      }),
    ).rejects.toThrow(/already starts on that date/);
  });
});

describe('who may see and set pay', () => {
  it('does not let a manager see everyone\'s pay', async () => {
    // Managers hold attendance and leave. What each person earns is needed for
    // neither, and the audit narrowed them for exactly this reason.
    const { db } = fakeDb([RECORD]);
    await expect(
      createSalaryDomain({ db, context: context('manager') }).currentForAll(),
    ).rejects.toThrow();
    expect(DEFAULT_CAPABILITIES.manager).not.toContain('salary.read_all');
  });

  it('does not let a manager or technician set pay', () => {
    expect(DEFAULT_CAPABILITIES.manager).not.toContain('salary.manage');
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('salary.manage');
    expect(DEFAULT_CAPABILITIES.owner).toContain('salary.manage');
  });

  it('lets everyone ask about their own pay and request an advance', () => {
    for (const role of ['manager', 'advisor', 'technician'] as const) {
      expect(DEFAULT_CAPABILITIES[role]).toContain('salary.read_own');
      expect(DEFAULT_CAPABILITIES[role]).toContain('salary_advances.request');
      expect(DEFAULT_CAPABILITIES[role]).not.toContain('salary_advances.approve');
    }
  });
});

describe('advances', () => {
  it('always starts Pending', async () => {
    const { db, calls } = fakeDb([ADVANCE]);
    await createSalaryDomain({ db, context: context() }).requestAdvance({
      employeeId: 'E-1', amount: 100, currency: 'USD',
    });
    expect((calls[0].payload as Record<string, unknown>).status).toBe('Pending');
  });

  it('refuses an advance for nothing', async () => {
    const { db } = fakeDb([ADVANCE]);
    await expect(
      createSalaryDomain({ db, context: context() }).requestAdvance({
        employeeId: 'E-1', amount: 0, currency: 'USD',
      }),
    ).rejects.toThrow(SalaryError);
  });

  it('only decides one that is still pending', async () => {
    const { db, calls } = fakeDb([{ ...ADVANCE, status: 'Approved' }]);
    await createSalaryDomain({ db, context: context() }).decideAdvance('AD-1', 'Approved');
    // The status filter is what stops two approvers racing each other.
    expect(calls[0].filters.status).toBe('Pending');
  });

  it('only pays one that was approved', async () => {
    const { db, calls } = fakeDb([{ ...ADVANCE, status: 'Paid', paid_on: '2026-08-02' }]);
    await createSalaryDomain({ db, context: context() }).markAdvancePaid('AD-1');
    expect(calls[0].filters.status).toBe('Approved');
  });

  it('records paying separately from approving', async () => {
    // Payroll deducts what was handed over, not what was promised.
    const { db, rpcCalls } = fakeDb([{ ...ADVANCE, status: 'Paid', paid_on: '2026-08-02' }]);
    await createSalaryDomain({ db, context: context() }).markAdvancePaid('AD-1');
    expect(rpcCalls[0].args).toMatchObject({ p_action: 'salary_advance.paid' });
  });
});

describe('what is still owed', () => {
  it('counts only advances actually paid', () => {
    // An approved advance that was never handed over is not a debt. Deducting
    // it would take back money the person never received.
    expect(outstandingFrom([
      advance({ amount: 100, status: 'Paid' }),
      advance({ amount: 500, status: 'Approved' }),
      advance({ amount: 900, status: 'Pending' }),
    ])).toEqual([{ currency: 'USD', amount: 100 }]);
  });

  it('subtracts what has been repaid', () => {
    expect(outstandingFrom([advance({ amount: 100, repaidAmount: 40 })]))
      .toEqual([{ currency: 'USD', amount: 60 }]);
  });

  it('drops one that is fully repaid', () => {
    expect(outstandingFrom([advance({ amount: 100, repaidAmount: 100 })])).toEqual([]);
  });

  it('keeps currencies apart instead of adding them up', () => {
    // This shop pays in USD, THB and LAK. One total across them would be
    // wrong by a factor of about twenty thousand between the extremes.
    const result = outstandingFrom([
      advance({ amount: 100, currency: 'USD' }),
      advance({ amount: 2000, currency: 'THB' }),
      advance({ amount: 50, currency: 'USD' }),
    ]);
    expect(result).toEqual(expect.arrayContaining([
      { currency: 'USD', amount: 150 },
      { currency: 'THB', amount: 2000 },
    ]));
    expect(result).toHaveLength(2);
  });
});

describe('the migration says what the application says', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m7_salary.sql'),
    'utf8',
  );

  it('makes the outstanding view obey RLS', () => {
    // Without security_invoker a view reads with the definer's rights, and
    // this one would hand every person's balance to anyone who queried it
    // instead of the table.
    expect(SQL).toMatch(/security_invoker = true/);
  });

  it('does not let salary history be edited or deleted', () => {
    expect(SQL).toMatch(/GRANT SELECT, INSERT\s+ON public\.salary_records\s+TO authenticated/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.salary_records\s+FROM PUBLIC/);
    expect(SQL).not.toMatch(/GRANT[^;]*UPDATE[^;]*salary_records/);
  });

  it('lets a person read their own pay whatever their role', () => {
    expect(SQL).toMatch(/e\.user_id = auth\.uid\(\)/);
  });

  it('marks the pay capabilities enforced, since something now enforces them', () => {
    for (const id of ['salary.read_own', 'salary.read_all', 'salary.manage',
                      'salary_advances.request', 'salary_advances.approve']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
    }
  });
});
