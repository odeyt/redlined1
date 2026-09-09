/**
 * A parts order only ever deducts money expressed in ITS OWN currency.
 *
 * Reported with a screenshot on 2026-09-09: a headlight priced at THB 900 with
 * 380,000 kip put down. The deposit field was labelled "Deposit Paid (THB)" —
 * there was nowhere to say the cash arrived as kip — so 380,000 was subtracted
 * from 900 and the balance clamped to zero. The sheet said the customer had
 * paid in full when they had paid roughly half.
 *
 * Between LAK and THB the error is about 700x, so this is not a rounding
 * question. It is the difference between an order that is settled and one that
 * is not.
 *
 * The rule asserted here: money in another currency is deducted only when a
 * converted figure is supplied. Absent one, NOTHING comes off. Overstating
 * what is owed gets corrected at the counter in seconds; understating it means
 * nobody ever asks for the rest.
 */
import { buildOrderPayload } from '../partsOrderService';

/** Only the fields buildOrderPayload reads for this rule; the rest is filler. */
function order(over: Record<string, unknown>) {
  return {
    lineItems: [{ partName: 'Headlight', partNumber: 'H1', condition: 'New', quantity: 1, unitCost: 900 }],
    partName: 'Headlight', partNumber: 'H1', condition: 'New', quantity: 1, unitCost: 900,
    vendorName: '', vendorPhone: '', vendorEmail: '',
    coreCharge: 0, depositPaid: 0, totalCost: 900, balanceDue: 0,
    status: 'Quote', paymentStatus: 'Unpaid',
    orderDate: '', etr: '', receivedDate: '',
    jobCardNumber: '', repairOrderNumber: '', estimateNumber: '', invoiceNumber: '',
    vehicle: '', customerName: '', warranty: '', notes: '',
    currency: 'THB',
    ...over,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('a deposit in another currency is not subtracted at face value', () => {
  it('does NOT take 380,000 kip off a THB 900 order — the reported bug', () => {
    const row = buildOrderPayload(order({ depositPaid: 380000, depositCurrency: 'LAK' }));
    // The balance stays the full 900. It must not be 0.
    expect(row.balance_due).toBe(900);
  });

  it('records what was actually handed over, unconverted', () => {
    const row = buildOrderPayload(order({ depositPaid: 380000, depositCurrency: 'LAK' }));
    expect(row.deposit_paid).toBe(380000);
    expect(row.deposit_currency).toBe('LAK');
  });

  it('deducts the converted figure when the caller supplies one', () => {
    // 380,000 kip ≈ THB 570 on the day. The balance is what remains.
    const row = buildOrderPayload(order({ depositPaid: 380000, depositCurrency: 'LAK', depositBaseAmount: 570 }));
    expect(row.balance_due).toBe(330);
  });

  it('ignores a nonsense converted figure rather than trusting it', () => {
    for (const bad of [0, -5, NaN, undefined]) {
      const row = buildOrderPayload(order({ depositPaid: 380000, depositCurrency: 'LAK', depositBaseAmount: bad }));
      expect(row.balance_due).toBe(900);
    }
  });
});

describe('the ordinary same-currency case is untouched', () => {
  it('deducts a THB deposit from a THB order directly', () => {
    const row = buildOrderPayload(order({ depositPaid: 400, depositCurrency: 'THB' }));
    expect(row.balance_due).toBe(500);
  });

  it('treats an absent deposit currency as the order currency', () => {
    // Every order written before 2026-09-09 is this shape. It must behave
    // exactly as it did, or the migration would change the meaning of history.
    const row = buildOrderPayload(order({ depositPaid: 400 }));
    expect(row.balance_due).toBe(500);
    expect(row.deposit_currency).toBe('THB');
  });

  it('still includes the core charge', () => {
    const row = buildOrderPayload(order({ depositPaid: 400, coreCharge: 100 }));
    expect(row.balance_due).toBe(600);
  });

  it('never reports a negative balance', () => {
    const row = buildOrderPayload(order({ depositPaid: 2000 }));
    expect(row.balance_due).toBe(0);
  });
});
