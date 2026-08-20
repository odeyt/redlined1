/**
 * Expenses.
 *
 * The behavioural half runs against a fake database; the access rules and the
 * freeze are pinned to the migration, since nothing here executes SQL.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDomainContext } from '../context';
import {
  createExpenseDomain, ExpenseError,
  totalsByCurrency, byCategory, reimbursementsOwed,
  type Expense, type ExpenseCategory,
} from '../expenses';
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
    for (const m of ['select', 'order', 'eq', 'in', 'is', 'not', 'gte', 'lte', 'maybeSingle', 'single']) {
      chain[m] = (...args: unknown[]) => {
        if (['eq', 'in', 'is', 'gte', 'lte'].includes(m)) rec.filters[String(args[0])] = args[1];
        if (m === 'not') rec.filters['not:' + String(args[0])] = true;
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

const ROW = {
  id: 'X-1', organization_id: 'org-1', shop_id: 'shop-A', category_id: 'C-1',
  amount: '50.00', currency: 'USD', spent_on: '2026-08-10', status: 'Pending',
};

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'x', organizationId: 'org-1', shopId: 'shop-A', categoryId: 'C-1',
    amount: 50, currency: 'USD', spentOn: '2026-08-10', payee: '', description: '',
    paymentMethod: '', status: 'Approved', paidByEmployee: null, reimbursedOn: null,
    submittedBy: null, decidedBy: null, decidedAt: null, decisionNote: '',
    createdAt: '', ...over,
  };
}

const CATEGORIES: ExpenseCategory[] = [
  { id: 'C-1', organizationId: 'org-1', name: 'Fuel', isActive: true },
  { id: 'C-2', organizationId: 'org-1', name: 'Rent', isActive: true },
];

describe('submitting', () => {
  it('always starts Pending', async () => {
    // There is no path that files an already-approved expense, so approving
    // always leaves a decision naming who made it.
    const { db, calls } = fakeDb([ROW]);
    await createExpenseDomain({ db, context: context() }).submit({
      categoryId: 'C-1', amount: 50, currency: 'USD', spentOn: '2026-08-10',
    });
    expect((calls[0].payload as Record<string, unknown>).status).toBe('Pending');
  });

  it('refuses an expense for nothing', async () => {
    const { db } = fakeDb([ROW]);
    await expect(
      createExpenseDomain({ db, context: context() }).submit({
        categoryId: 'C-1', amount: 0, currency: 'USD', spentOn: '2026-08-10',
      }),
    ).rejects.toThrow(ExpenseError);
  });

  it('refuses one with no currency', async () => {
    const { db } = fakeDb([ROW]);
    await expect(
      createExpenseDomain({ db, context: context() }).submit({
        categoryId: 'C-1', amount: 50, currency: '', spentOn: '2026-08-10',
      }),
    ).rejects.toThrow(/currency/);
  });

  it('records which shop spent it', async () => {
    // An expense with no location cannot be reported per shop, which is most
    // of what an owner with two branches wants to know.
    const { db, calls } = fakeDb([ROW]);
    await createExpenseDomain({ db, context: context() }).submit({
      categoryId: 'C-1', amount: 50, currency: 'USD', spentOn: '2026-08-10',
    });
    expect((calls[0].payload as Record<string, unknown>).shop_id).toBe('shop-A');
  });

  it('lets a technician submit but not approve', async () => {
    const { db } = fakeDb([ROW]);
    const domain = createExpenseDomain({ db, context: context('technician') });
    await expect(domain.submit({
      categoryId: 'C-1', amount: 50, currency: 'USD', spentOn: '2026-08-10',
    })).resolves.toBeDefined();
    await expect(domain.decide('X-1', 'Approved')).rejects.toThrow();
  });

  it('lets a manager submit and read but not approve', () => {
    expect(DEFAULT_CAPABILITIES.manager).toContain('expenses.create');
    expect(DEFAULT_CAPABILITIES.manager).toContain('expenses.read');
    expect(DEFAULT_CAPABILITIES.manager).not.toContain('expenses.approve');
    expect(DEFAULT_CAPABILITIES.owner).toContain('expenses.approve');
  });
});

describe('deciding', () => {
  it('only decides one that is still pending', async () => {
    // The status filter is what stops two approvers racing each other.
    const { db, calls } = fakeDb([{ ...ROW, status: 'Approved' }]);
    await createExpenseDomain({ db, context: context() }).decide('X-1', 'Approved');
    expect(calls[0].filters.status).toBe('Pending');
  });

  it('only reimburses an out-of-pocket claim', async () => {
    // Marking a directly-paid expense reimbursed would claim money moved when
    // it did not.
    const { db, calls } = fakeDb([{ ...ROW, status: 'Approved', paid_by_employee: 'E-1', reimbursed_on: '2026-08-12' }]);
    await createExpenseDomain({ db, context: context() }).markReimbursed('X-1');
    expect(calls[0].filters.status).toBe('Approved');
    expect(calls[0].filters['not:paid_by_employee']).toBe(true);
  });
});

describe('what the totals mean', () => {
  it('counts only approved spending', () => {
    // A pending claim is a request; a rejected one never happened as far as
    // the business is concerned.
    expect(totalsByCurrency([
      expense({ amount: 50, status: 'Approved' }),
      expense({ amount: 900, status: 'Pending' }),
      expense({ amount: 700, status: 'Rejected' }),
    ])).toEqual([{ currency: 'USD', amount: 50 }]);
  });

  it('keeps currencies apart', () => {
    // Rent in LAK, parts in THB, some billing in USD — three real numbers.
    const totals = totalsByCurrency([
      expense({ amount: 50, currency: 'USD' }),
      expense({ amount: 2000000, currency: 'LAK' }),
      expense({ amount: 25, currency: 'USD' }),
    ]);
    expect(totals).toEqual(expect.arrayContaining([
      { currency: 'USD', amount: 75 },
      { currency: 'LAK', amount: 2000000 },
    ]));
    expect(totals).toHaveLength(2);
  });

  it('groups by category within one currency', () => {
    const result = byCategory([
      expense({ amount: 30, categoryId: 'C-1' }),
      expense({ amount: 500, categoryId: 'C-2' }),
      expense({ amount: 20, categoryId: 'C-1' }),
      expense({ amount: 999, categoryId: 'C-2', currency: 'THB' }),
    ], CATEGORIES, 'USD');
    expect(result).toEqual([
      { category: 'Rent', amount: 500 },
      { category: 'Fuel', amount: 50 },
    ]);
  });

  it('names an expense with no category rather than dropping it', () => {
    const result = byCategory([expense({ amount: 10, categoryId: null })], CATEGORIES, 'USD');
    expect(result).toEqual([{ category: 'Uncategorised', amount: 10 }]);
  });
});

describe('money owed back to people', () => {
  it('counts approved out-of-pocket claims not yet repaid', () => {
    expect(reimbursementsOwed([
      expense({ amount: 40, paidByEmployee: 'E-1' }),
      expense({ amount: 60, paidByEmployee: 'E-2' }),
    ])).toEqual([{ currency: 'USD', amount: 100 }]);
  });

  it('ignores what the business paid directly', () => {
    expect(reimbursementsOwed([expense({ amount: 500, paidByEmployee: null })])).toEqual([]);
  });

  it('ignores what has already been paid back', () => {
    expect(reimbursementsOwed([
      expense({ amount: 40, paidByEmployee: 'E-1', reimbursedOn: '2026-08-12' }),
    ])).toEqual([]);
  });

  it('ignores a claim that was never approved', () => {
    expect(reimbursementsOwed([
      expense({ amount: 40, paidByEmployee: 'E-1', status: 'Pending' }),
    ])).toEqual([]);
  });
});

describe('the migration says what the application says', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m9_expenses.sql'),
    'utf8',
  );

  it('freezes the figures once an expense is decided', () => {
    expect(SQL).toMatch(/expenses_settled/);
    expect(SQL).toMatch(/amount, date, category and location cannot change/);
  });

  it('still allows the reimbursement date to change afterwards', () => {
    // Naming the frozen fields rather than freezing the row is the difference
    // between a rule and an obstruction: money goes back days later.
    const trigger = SQL.slice(SQL.indexOf('expense_is_settled'), SQL.indexOf('expenses_settled ON'));
    expect(trigger).not.toMatch(/reimbursed_on/);
  });

  it('lets nobody delete an expense', () => {
    // Cancelled or rejected, both of which leave the row. Otherwise the only
    // trace of a rejected claim is that it stopped being there.
    expect(SQL).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.expenses\s+TO authenticated/);
    expect(SQL).not.toMatch(/GRANT[^;]*DELETE[^;]*public\.expenses/);
  });

  it('lets whoever paid see their own claim', () => {
    expect(SQL).toMatch(/expenses\.submitted_by = auth\.uid\(\)/);
    expect(SQL).toMatch(/e\.id = expenses\.paid_by_employee/);
  });

  it('marks the expense capabilities enforced', () => {
    for (const id of ['expenses.read', 'expenses.create', 'expenses.approve']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
    }
  });
});
