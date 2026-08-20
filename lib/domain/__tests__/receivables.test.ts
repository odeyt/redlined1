/**
 * Receivables.
 *
 * All arithmetic, no new tables — so this is nearly all unit tests, which is
 * the right shape: the risk here is a wrong number that looks plausible, not a
 * failed write.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  receivablesFrom, agingSummary, byCustomer, bucketFor, daysBetween,
} from '../receivables';
import type { InvoiceFull } from '../invoiceMath';
import type { DomainPayment } from '../payments';

const TODAY = '2026-08-20';

function invoice(over: Partial<InvoiceFull>): InvoiceFull {
  return {
    id: 'i', invoiceNumber: 'INV-1', customerName: 'John', customerId: 'C-1',
    vehicle: 'Hilux', jobCardId: '', status: 'Sent',
    lines: [{ note: '', description: 'Labour', qty: 1, rate: 100 }],
    discount: 0, shopSupplies: 0, taxRate: 0, notes: '',
    dueDate: '2026-08-01', paidDate: null, createdAt: '', currency: 'USD',
    ...over,
  } as InvoiceFull;
}

function payment(over: Partial<DomainPayment>): DomainPayment {
  return {
    id: 'p', invoiceNumber: 'INV-1', customerName: 'John', customerId: 'C-1',
    amount: 40, method: 'Cash', methodDetail: '', status: 'Completed', notes: '',
    currency: 'USD', referenceNumber: '', paymentDate: '2026-08-05', createdAt: '',
    entryType: 'payment', reversesPaymentId: null,
    ...over,
  } as DomainPayment;
}

describe('what is still owed', () => {
  it('is the invoice total minus what was paid', () => {
    const [r] = receivablesFrom([invoice({})], [payment({ amount: 40 })], TODAY);
    expect(r.total).toBe(100);
    expect(r.paid).toBe(40);
    expect(r.balance).toBe(60);
  });

  it('counts a reversal automatically, because it is a negative entry', () => {
    // M2 made reversals negative rows rather than deletions precisely so that
    // every existing sum stays correct. This is that paying off.
    const [r] = receivablesFrom([invoice({})], [
      payment({ id: 'p1', amount: 40 }),
      payment({ id: 'p2', amount: -40, entryType: 'reversal', reversesPaymentId: 'p1' }),
    ], TODAY);
    expect(r.paid).toBe(0);
    expect(r.balance).toBe(100);
  });

  it('drops an invoice that is fully paid even if its status was never updated', () => {
    // Nobody needs to chase it, and a list padded with settled invoices is one
    // people stop reading.
    expect(receivablesFrom([invoice({})], [payment({ amount: 100 })], TODAY)).toEqual([]);
  });

  it('reports an overpayment rather than a negative balance', () => {
    const [r] = receivablesFrom([invoice({})], [
      payment({ id: 'p1', amount: 100 }),
      payment({ id: 'p2', amount: 30 }),
    ], TODAY);
    // Balance floors at zero — a customer in credit does not owe minus thirty —
    // and the row is kept, because an overpayment is either a deposit to
    // allocate or money to refund, and this is the only screen that shows it.
    expect(r.balance).toBe(0);
    expect(r.overpaid).toBe(30);
  });

  it('excludes drafts, because nobody owes an unissued invoice', () => {
    // There were 26 stranded drafts in this database from the August payment
    // outage. Counting them would inflate what the business is owed by work it
    // never billed for.
    expect(receivablesFrom([invoice({ status: 'Draft' })], [], TODAY)).toEqual([]);
  });

  it('excludes cancelled and void invoices', () => {
    expect(receivablesFrom([
      invoice({ invoiceNumber: 'INV-2', status: 'Cancelled' }),
      invoice({ invoiceNumber: 'INV-3', status: 'Void' }),
    ], [], TODAY)).toEqual([]);
  });

  it('ignores a payment with no invoice number', () => {
    // Money in the ledger attached to nothing is a real state — see M2 — but
    // it is not a payment against any particular balance.
    const [r] = receivablesFrom([invoice({})], [payment({ invoiceNumber: '', amount: 100 })], TODAY);
    expect(r.balance).toBe(100);
  });
});

describe('a payment in the wrong currency', () => {
  it('is not added to the balance', () => {
    // The alternatives are inventing an exchange rate or quietly understating
    // what the customer owes. Both are worse than saying so.
    const [r] = receivablesFrom([invoice({})], [payment({ amount: 2000, currency: 'THB' })], TODAY);
    expect(r.paid).toBe(0);
    expect(r.balance).toBe(100);
  });

  it('is reported so a person can look', () => {
    const [r] = receivablesFrom([invoice({})], [payment({ amount: 2000, currency: 'THB' })], TODAY);
    expect(r.currencyMismatches).toEqual([{ currency: 'THB', amount: 2000 }]);
  });

  it('keeps an invoice visible even when its balance nets to zero', () => {
    // Otherwise a fully-paid-in-the-wrong-currency invoice would vanish
    // silently, which is the worst of both.
    const rows = receivablesFrom([invoice({})], [
      payment({ id: 'p1', amount: 100 }),
      payment({ id: 'p2', amount: 500, currency: 'LAK' }),
    ], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(0);
    expect(rows[0].currencyMismatches).toHaveLength(1);
  });
});

describe('how overdue', () => {
  it('counts days past the due date', () => {
    const [r] = receivablesFrom([invoice({ dueDate: '2026-08-01' })], [], TODAY);
    expect(r.daysOverdue).toBe(19);
  });

  it('is zero for an invoice not yet due', () => {
    const [r] = receivablesFrom([invoice({ dueDate: '2026-09-01' })], [], TODAY);
    expect(r.daysOverdue).toBe(0);
  });

  it('is zero when no due date was ever set', () => {
    // Guessing one would invent an overdue debt out of a blank field.
    const [r] = receivablesFrom([invoice({ dueDate: '' })], [], TODAY);
    expect(r.daysOverdue).toBe(0);
  });

  it('puts days in the right bucket', () => {
    expect(bucketFor(0)).toBe('Not due');
    expect(bucketFor(1)).toBe('1–30');
    expect(bucketFor(30)).toBe('1–30');
    expect(bucketFor(31)).toBe('31–60');
    expect(bucketFor(91)).toBe('90+');
  });

  it('measures days across a month boundary', () => {
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1);
    expect(daysBetween('2026-08-01', '2026-07-31')).toBe(-1);
  });
});

describe('aging summary', () => {
  it('keeps currencies apart', () => {
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', dueDate: '2026-08-01' }),
      invoice({ invoiceNumber: 'B', currency: 'THB', dueDate: '2026-05-01',
                lines: [{ note: '', description: 'x', qty: 1, rate: 5000 }] }),
    ], [], TODAY);

    const summary = agingSummary(rows);
    const usd = summary.find(s => s.currency === 'USD');
    const thb = summary.find(s => s.currency === 'THB');

    expect(usd?.buckets['1–30']).toBe(100);
    expect(thb?.buckets['90+']).toBe(5000);
    expect(summary).toHaveLength(2);
  });

  it('totals within a currency only', () => {
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', dueDate: '2026-08-01' }),
      invoice({ invoiceNumber: 'B', dueDate: '2026-08-19' }),
    ], [], TODAY);
    expect(agingSummary(rows)[0].total).toBe(200);
  });
});

describe('by customer', () => {
  it('adds up one customer\'s invoices and shows the oldest', () => {
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', customerName: 'John', dueDate: '2026-08-01' }),
      invoice({ invoiceNumber: 'B', customerName: 'John', dueDate: '2026-06-01' }),
    ], [], TODAY);

    const [john] = byCustomer(rows);
    expect(john.balance).toBe(200);
    expect(john.invoices).toBe(2);
    expect(john.oldestDays).toBe(80);
  });

  it('does not merge one customer\'s two currencies', () => {
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', customerName: 'John' }),
      invoice({ invoiceNumber: 'B', customerName: 'John', currency: 'THB',
                lines: [{ note: '', description: 'x', qty: 1, rate: 3000 }] }),
    ], [], TODAY);
    expect(byCustomer(rows)).toHaveLength(2);
  });

  it('puts the longest overdue first', () => {
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', customerName: 'Recent', dueDate: '2026-08-18' }),
      invoice({ invoiceNumber: 'B', customerName: 'Ancient', dueDate: '2026-01-01' }),
    ], [], TODAY);
    expect(byCustomer(rows)[0].customerName).toBe('Ancient');
  });
});

describe('the grouping key cannot collide', () => {
  it('keeps a customer whose name looks like a key apart from a real one', () => {
    // "John USD" joined to a currency with a separator produces the same key
    // as John's USD row. The merged total would look entirely plausible, which
    // is what makes this worth a test rather than a comment.
    const rows = receivablesFrom([
      invoice({ invoiceNumber: 'A', customerName: 'John' }),
      invoice({ invoiceNumber: 'B', customerName: 'John USD' }),
    ], [], TODAY);
    expect(byCustomer(rows)).toHaveLength(2);
  });

  it('has no control characters in the source', () => {
    // A raw NUL byte made git treat this file as binary — it compiled and the
    // tests passed, so nothing else would have noticed.
    const source = readFileSync(join(__dirname, '..', 'receivables.ts'), 'utf8');
    expect(source).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });
});
