/**
 * Deposits and credits must survive into the totals.
 *
 * Reported: a THB 6,000 deposit entered as a negative line showed "—" and the
 * invoice still totalled THB 12,000, billing the customer for money they had
 * already paid.
 *
 * The maths in calculateTotals was never the problem — it sums qty * rate and
 * handles negatives fine. The loss happened upstream in the editor, where
 * `if (!cost || cost <= 0)` forced rate to '0' for any negative cost, so the
 * line reached this function already worth nothing. These tests pin the
 * arithmetic that the editor fix now feeds correctly.
 */
import { calculateTotals, getEffectiveTotal, type InvoiceFull } from '../invoiceService';

function invoice(partial: Partial<InvoiceFull>): InvoiceFull {
  return {
    id: 'INV-1', invoiceNumber: 'INV-1', customerName: '', customerId: '',
    vehicle: '', jobCardId: '', status: 'Draft', lines: [], discount: 0,
    shopSupplies: 0, taxRate: 0, notes: '', dueDate: '', paidDate: null,
    createdAt: '', currency: 'THB',
    ...partial,
  } as InvoiceFull;
}

const WORK = [
  { description: 'variable valve solenoid', qty: 1, rate: 5500 },
  { description: 'repair AC return to factory', qty: 1, rate: 2500 },
  { description: 'clean electrical wirings', qty: 1, rate: 900 },
  { description: 'labor', qty: 1, rate: 3100 },
];

describe('a deposit entered as a negative line', () => {
  it('reduces the subtotal by its amount', () => {
    // The reported invoice: 12,000 of work against a 6,000 deposit.
    const t = calculateTotals(invoice({
      lines: [...WORK, { description: 'deposited', qty: 1, rate: -6000 }] as InvoiceFull['lines'],
    }));
    expect(t.subtotal).toBe(6000);
  });

  it('leaves the work total alone when there is no deposit', () => {
    const t = calculateTotals(invoice({ lines: WORK as InvoiceFull['lines'] }));
    expect(t.subtotal).toBe(12000);
  });

  it('is taxed on the net, not the gross', () => {
    // Tax on 12,000 when 6,000 was already paid overcharges the customer.
    const t = calculateTotals(invoice({
      lines: [...WORK, { description: 'deposited', qty: 1, rate: -6000 }] as InvoiceFull['lines'],
      taxRate: 0.07,
    }));
    expect(t.tax).toBeCloseTo(420);   // 6,000 * 7%
    expect(t.total).toBeCloseTo(6420);
  });
});

describe('a zero-rate line', () => {
  it('is kept rather than treated as an unfinished edit', () => {
    // "reset codes" at no charge documents work performed. It contributes
    // nothing, but it must not disturb the total either.
    const t = calculateTotals(invoice({
      lines: [...WORK, { description: 'reset codes', qty: 1, rate: 0 }] as InvoiceFull['lines'],
    }));
    expect(t.subtotal).toBe(12000);
  });
});

describe('discount alongside a credit line', () => {
  it('applies to the amount left after the deposit', () => {
    const t = calculateTotals(invoice({
      lines: [...WORK, { description: 'deposited', qty: 1, rate: -6000 }] as InvoiceFull['lines'],
      discount: 1000,
    }));
    expect(t.subtotal).toBe(6000);
    expect(t.total).toBe(5000);
  });

  it('never drives the total below zero', () => {
    // A discount larger than the balance owed should settle the invoice, not
    // turn it into a refund the shop never agreed to.
    const t = calculateTotals(invoice({
      lines: [...WORK, { description: 'deposited', qty: 1, rate: -6000 }] as InvoiceFull['lines'],
      discount: 99999,
    }));
    expect(t.total).toBe(0);
  });
});

describe('the same invoice billed entirely in a foreign currency', () => {
  it('still nets the deposit off', () => {
    // Lines carry their own currency and the base currency has no lines, so
    // the effective-total path is what the customer is charged.
    const inv = invoice({
      currency: 'USD',
      lines: [
        { description: 'work', qty: 1, rate: 12000, currency: 'THB' },
        { description: 'deposited', qty: 1, rate: -6000, currency: 'THB' },
      ] as InvoiceFull['lines'],
    });
    const eff = getEffectiveTotal(inv);
    expect(eff.currency).toBe('THB');
    expect(eff.amount).toBe(6000);
  });
});
