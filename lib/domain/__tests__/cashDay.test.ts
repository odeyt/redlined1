/**
 * Closing the day.
 *
 * Most of this is what counts as cash and what "expected" means, because those
 * decide whether the figure a person is asked to match is achievable at all.
 * A reconciliation screen that shows an impossible target gets ignored, and an
 * ignored control is worse than none — it looks like oversight exists.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  expectedCashFor, varianceOf, blockersFor, CASH_METHODS,
  type CashDayLine,
} from '../cashDay';
import type { DomainPayment } from '../payments';
import type { Expense } from '../expenses';
import { DEFAULT_CAPABILITIES, CAPABILITIES } from '@/lib/auth/capabilities';

const DATE = '2026-08-20';
const SHOP = 'shop-A';

function payment(over: Partial<DomainPayment>): DomainPayment {
  return {
    id: 'p', invoiceNumber: 'INV-1', customerName: 'John', customerId: 'C-1',
    amount: 100, method: 'Cash', methodDetail: '', status: 'Completed', notes: '',
    currency: 'USD', referenceNumber: '', paymentDate: DATE, createdAt: '',
    entryType: 'payment', reversesPaymentId: null,
    ...over,
  } as DomainPayment;
}

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'x', organizationId: 'org-1', shopId: SHOP, categoryId: 'C-1',
    amount: 20, currency: 'USD', spentOn: DATE, payee: '', description: '',
    paymentMethod: 'Cash', status: 'Approved', paidByEmployee: null,
    reimbursedOn: null, submittedBy: null, decidedBy: null, decidedAt: null,
    decisionNote: '', createdAt: '',
    ...over,
  };
}

function line(over: Partial<CashDayLine>): CashDayLine {
  return {
    id: 'l', dayId: 'd', currency: 'USD', openingFloat: 0,
    cashIn: 0, cashOut: 0, expectedCash: 100, countedCash: 100,
    variance: 0, notes: '', ...over,
  };
}

describe('what should be in the drawer', () => {
  it('counts cash payments in', () => {
    const [usd] = expectedCashFor([payment({ amount: 100 })], [], DATE, SHOP);
    expect(usd.cashIn).toBe(100);
    expect(usd.expected).toBe(100);
  });

  it('ignores card and transfer payments', () => {
    // They never touch the drawer. Including them produces an expected figure
    // nobody could ever match, and a target nobody can hit gets ignored.
    const result = expectedCashFor([
      payment({ id: 'p1', amount: 100, method: 'Credit Card' }),
      payment({ id: 'p2', amount: 50, method: 'Bank Transfer' }),
    ], [], DATE, SHOP);
    expect(result).toEqual([]);
  });

  it('counts Other (Cash), which lands in the same drawer', () => {
    const [usd] = expectedCashFor([payment({ amount: 70, method: 'Other (Cash)' })], [], DATE, SHOP);
    expect(usd.cashIn).toBe(70);
    expect(CASH_METHODS.has('Other (Cash)')).toBe(true);
  });

  it('nets a cash refund automatically, because a reversal is negative', () => {
    // Money handed back out of the till reduces what should be in it, with no
    // special handling — that is what M2's negative entries bought.
    const [usd] = expectedCashFor([
      payment({ id: 'p1', amount: 100 }),
      payment({ id: 'p2', amount: -30, entryType: 'reversal', reversesPaymentId: 'p1' }),
    ], [], DATE, SHOP);
    expect(usd.expected).toBe(70);
  });

  it('takes cash expenses out', () => {
    const [usd] = expectedCashFor([payment({ amount: 100 })], [expense({ amount: 20 })], DATE, SHOP);
    expect(usd.cashOut).toBe(20);
    expect(usd.expected).toBe(80);
  });

  it('ignores an expense that was not approved', () => {
    // A pending claim is a request. Money has not left the till on the say-so
    // of the claim alone.
    const [usd] = expectedCashFor([payment({ amount: 100 })], [expense({ status: 'Pending' })], DATE, SHOP);
    expect(usd.expected).toBe(100);
  });

  it('ignores an expense paid by card', () => {
    const [usd] = expectedCashFor([payment({ amount: 100 })], [expense({ paymentMethod: 'Card' })], DATE, SHOP);
    expect(usd.expected).toBe(100);
  });

  it('ignores another shop\'s expenses', () => {
    // Two locations, two drawers.
    const [usd] = expectedCashFor([payment({ amount: 100 })], [expense({ shopId: 'shop-B' })], DATE, SHOP);
    expect(usd.expected).toBe(100);
  });

  it('ignores another day', () => {
    const result = expectedCashFor([payment({ paymentDate: '2026-08-19' })], [], DATE, SHOP);
    expect(result).toEqual([]);
  });

  it('matches a payment date that carries a time', () => {
    // paymentDate is sometimes a timestamp. Comparing the whole string would
    // silently drop every payment recorded with one.
    const [usd] = expectedCashFor([payment({ paymentDate: DATE + 'T14:30:00Z' })], [], DATE, SHOP);
    expect(usd.cashIn).toBe(100);
  });

  it('adds the opening float', () => {
    const [usd] = expectedCashFor([payment({ amount: 100 })], [], DATE, SHOP, { USD: 50 });
    expect(usd.expected).toBe(150);
  });

  it('keeps a currency that has a float but no movement', () => {
    // Otherwise yesterday's float silently disappears from today's count.
    const result = expectedCashFor([], [], DATE, SHOP, { LAK: 500000 });
    expect(result).toEqual([{ currency: 'LAK', cashIn: 0, cashOut: 0, expected: 500000 }]);
  });

  it('keeps currencies apart', () => {
    const result = expectedCashFor([
      payment({ id: 'p1', amount: 100, currency: 'USD' }),
      payment({ id: 'p2', amount: 2000, currency: 'THB' }),
    ], [], DATE, SHOP);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.currency === 'THB')?.expected).toBe(2000);
  });
});

describe('variance', () => {
  it('is what was counted minus what was expected', () => {
    expect(varianceOf(95, 100)).toBe(-5);
    expect(varianceOf(105, 100)).toBe(5);
    expect(varianceOf(100, 100)).toBe(0);
  });

  it('is null until somebody counts', () => {
    // Zero would claim the drawer was counted and found empty.
    expect(varianceOf(null, 100)).toBeNull();
  });
});

describe('what stops a day being closed', () => {
  it('nothing, when every line is counted and square', () => {
    expect(blockersFor([line({})])).toEqual([]);
  });

  it('an uncounted currency', () => {
    expect(blockersFor([line({ countedCash: null })])[0]).toMatch(/not been counted/);
  });

  it('a difference with no explanation', () => {
    expect(blockersFor([line({ countedCash: 95, expectedCash: 100 })])[0]).toMatch(/out by -5/);
  });

  it('nothing, when the difference is explained', () => {
    // A variance never blocks the close. Insisting on a match is how you get a
    // count that has been made to match.
    expect(blockersFor([line({ countedCash: 95, expectedCash: 100, notes: 'Short — gave change from the wrong drawer' })]))
      .toEqual([]);
  });

  it('a day with nothing counted at all', () => {
    expect(blockersFor([])[0]).toMatch(/Nothing has been counted/);
  });
});

describe('who may close the day', () => {
  it('is the owner and the manager', () => {
    expect(DEFAULT_CAPABILITIES.owner).toContain('reconciliation.manage');
    expect(DEFAULT_CAPABILITIES.manager).toContain('reconciliation.manage');
  });

  it('is not an advisor or a technician', () => {
    expect(DEFAULT_CAPABILITIES.advisor).not.toContain('reconciliation.manage');
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('reconciliation.manage');
  });

  it('is enforced, not planned', () => {
    expect(CAPABILITIES.find(c => c.id === 'reconciliation.manage')?.status).toBe('enforced');
  });
});

describe('the migration says what the application says', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-20_m10_cash_reconciliation.sql'),
    'utf8',
  );

  it('refuses to close a day with an uncounted currency', () => {
    expect(SQL).toMatch(/has not been counted yet/);
  });

  it('requires an explanation for a difference, but allows the difference', () => {
    expect(SQL).toMatch(/Say why before closing/);
    // No constraint anywhere demanding variance = 0.
    expect(SQL).not.toMatch(/CHECK \([^)]*variance = 0/);
  });

  it('recomputes the variance rather than trusting the browser', () => {
    expect(SQL).toMatch(/variance IS DISTINCT FROM \(v_line\.counted_cash - v_line\.expected_cash\)/);
  });

  it('checks permission inside the function, since SECURITY DEFINER skips RLS', () => {
    expect(SQL).toMatch(/You do not have permission to close the day/);
    expect(SQL).toMatch(/You do not have permission to reopen a closed day/);
  });

  it('allows reopening, but only with a reason', () => {
    // A system that cannot correct a mistake gets worked around instead.
    expect(SQL).toMatch(/Reopening a closed day needs a reason/);
    expect(SQL).toMatch(/cash_day_reopen_has_a_reason/);
  });

  it('keeps who closed it, even after a reopen', () => {
    expect(SQL).toMatch(/closed_by and closed_at are NOT cleared/);
  });

  it('freezes a closed day\'s lines', () => {
    expect(SQL).toMatch(/cash_day_lines_frozen/);
    expect(SQL).toMatch(/That day is closed\. Reopen it first/);
  });

  it('allows one close per till per day', () => {
    expect(SQL).toMatch(/cash_one_day_per_shop/);
  });
});
