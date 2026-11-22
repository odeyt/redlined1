/**
 * Redline AI — deterministic layer tests.
 *
 * The pure builders are the source of truth for every figure the panel
 * states, so they are tested without any LLM: status classification across
 * the codebase's two status eras, aging, per-customer grouping (never
 * summing across currencies), the "start with these 3" priority order, and
 * drafts that cite the record they came from.
 */
import {
  ageInDays,
  buildMorningBriefAnswer,
  buildWhoOwesAnswer,
  draftEstimateFollowUp,
  draftInvoiceFollowUp,
  groupOwes,
  isAwaitingReply,
  isOpenJob,
  pickStartWith,
} from '../answers';
import { fetchAwaitingEstimates, fetchOwed, mapEstimateRow } from '../queries';
import { receivablesFrom } from '@/lib/domain/receivables';
import type { InvoiceFull } from '@/lib/domain/invoiceMath';
import type { DomainPayment } from '@/lib/domain/payments';
import type { EstimateFact, JobFact } from '../types';

const TODAY = '2026-11-22';

describe('status classification', () => {
  it('treats both status eras as awaiting reply', () => {
    for (const s of ['Sent', 'sent', 'Pending', 'pending', 'Pending Customer', 'viewed', 'Quoted']) {
      expect(isAwaitingReply(s)).toBe(true);
    }
    for (const s of ['Draft', 'draft', 'Approved', 'approved', 'Declined', 'declined', 'Converted', 'Expired', '']) {
      expect(isAwaitingReply(s)).toBe(false);
    }
  });

  it('knows which job statuses are closed', () => {
    for (const s of ['Closed', 'Completed', 'complete', 'Invoiced', 'Done']) {
      expect(isOpenJob(s)).toBe(false);
    }
    for (const s of ['Booked', 'In Progress', 'Waiting', 'Ready', '']) {
      expect(isOpenJob(s)).toBe(true);
    }
  });

  it('ages records in whole days', () => {
    expect(ageInDays('2026-11-22', TODAY)).toBe(0);
    expect(ageInDays('2026-11-19T08:30:00Z', TODAY)).toBe(3);
    expect(ageInDays('2026-10-23', TODAY)).toBe(30);
    expect(ageInDays(null, TODAY)).toBe(0);
    expect(ageInDays('not-a-date', TODAY)).toBe(0);
  });
});

// ── Money fixtures ───────────────────────────────────────────────────────────

function invoice(partial: Partial<InvoiceFull>): InvoiceFull {
  return {
    id: 'INV-0',
    invoiceNumber: 'INV-0',
    customerName: 'Alice',
    customerId: 'cust-a',
    vehicle: '2020 Civic',
    jobCardId: '',
    status: 'Sent',
    lines: [{ qty: 1, rate: 100, description: 'Work', note: '' }],
    discount: 0,
    shopSupplies: 0,
    taxRate: 0,
    notes: '',
    dueDate: '',
    paidDate: null,
    createdAt: '2026-11-01',
    currency: 'USD',
    ...partial,
  };
}

function payment(partial: Partial<DomainPayment>): DomainPayment {
  return {
    id: 'pay-0',
    invoiceNumber: 'INV-0',
    customerName: 'Alice',
    customerId: 'cust-a',
    amount: 0,
    method: 'Cash',
    methodDetail: '',
    status: 'Recorded',
    notes: '',
    currency: 'USD',
    referenceNumber: '',
    paymentDate: '2026-11-05',
    createdAt: '2026-11-05',
    entryType: 'payment',
    reversesPaymentId: null,
    reason: '',
    ...partial,
  };
}

const invoices: InvoiceFull[] = [
  invoice({ id: 'INV-1', invoiceNumber: 'INV-1', dueDate: '2026-11-01' }),                    // 100, pays 40 → 60 owed, 21d overdue
  invoice({ id: 'INV-2', invoiceNumber: 'INV-2', lines: [{ qty: 1, rate: 50, description: 'Work', note: '' }], dueDate: '2026-12-01' }), // 50 owed, not due
  invoice({ id: 'INV-3', invoiceNumber: 'INV-3', customerName: 'Bob', customerId: 'cust-b', lines: [{ qty: 1, rate: 200, currency: 'THB', description: 'Work', note: '' }], currency: 'THB', dueDate: '2026-10-01' }), // 200 THB, 52d overdue
  invoice({ id: 'INV-4', invoiceNumber: 'INV-4', status: 'Draft' }),                          // excluded
  invoice({ id: 'INV-5', invoiceNumber: 'INV-5', status: 'Paid' }),                           // excluded
];
const payments: DomainPayment[] = [
  payment({ id: 'pay-1', invoiceNumber: 'INV-1', amount: 40 }),
];

describe('groupOwes', () => {
  const groups = groupOwes(receivablesFrom(invoices, payments, TODAY));

  it('excludes drafts and settled invoices, nets payments', () => {
    const all = groups.flatMap(g => g.invoices);
    expect(all.map(i => i.invoiceNumber).sort()).toEqual(['INV-1', 'INV-2', 'INV-3']);
    expect(all.find(i => i.invoiceNumber === 'INV-1')?.balance).toBe(60);
    expect(all.find(i => i.invoiceNumber === 'INV-1')?.daysOverdue).toBe(21);
  });

  it('groups by customer, oldest debt first, never mixing currencies', () => {
    expect(groups.map(g => g.customerName)).toEqual(['Bob', 'Alice']); // 52d beats 21d
    const alice = groups.find(g => g.customerName === 'Alice')!;
    expect(alice.totalsByCurrency).toEqual({ USD: 110 });
    const bob = groups.find(g => g.customerName === 'Bob')!;
    expect(bob.totalsByCurrency).toEqual({ THB: 200 });
  });

  it('the answer cites invoice numbers, balances and overdue days', () => {
    const text = buildWhoOwesAnswer(groups);
    expect(text).toContain('Invoice INV-1');
    expect(text).toContain('USD 60.00');
    expect(text).toContain('21 days overdue');
    expect(text).toContain('THB 200.00');
  });

  it('says so plainly when nobody owes anything', () => {
    expect(buildWhoOwesAnswer([])).toMatch(/Nobody owes you money/);
  });
});

// ── Estimates ────────────────────────────────────────────────────────────────

function estimateRow(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'est-1',
    estimate_number: 'EST-0142',
    status: 'Sent',
    customer_name: 'Jane Doe',
    vehicle: '2021 Civic',
    currency: 'USD',
    created_at: '2026-11-10T09:00:00Z',
    ...partial,
  };
}

describe('mapEstimateRow', () => {
  it('uses total_amount when stored and ages from created_at', () => {
    const e = mapEstimateRow(estimateRow({ total_amount: 2500 }), TODAY);
    expect(e.number).toBe('EST-0142');
    expect(e.total).toBe(2500);
    expect(e.ageDays).toBe(12);
    expect(e.awaitingReply).toBe(true);
    expect(e.stale).toBe(true);
  });

  it('computes the total from lines when total_amount is absent', () => {
    const e = mapEstimateRow(estimateRow({
      total_amount: null,
      lines: [{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }],
      discount: 0,
      tax_rate: 0,
    }), TODAY);
    expect(e.total).toBe(250);
  });

  it('a fresh estimate is awaiting but not stale; an approved one is neither', () => {
    const fresh = mapEstimateRow(estimateRow({ created_at: '2026-11-21T09:00:00Z', total_amount: 10 }), TODAY);
    expect(fresh.awaitingReply).toBe(true);
    expect(fresh.stale).toBe(false);
    const approved = mapEstimateRow(estimateRow({ status: 'Approved', total_amount: 10 }), TODAY);
    expect(approved.awaitingReply).toBe(false);
  });

  it('prefers sent_at over created_at for the age', () => {
    const e = mapEstimateRow(estimateRow({
      created_at: '2026-09-01T09:00:00Z',
      sent_at: '2026-11-20T09:00:00Z',
      total_amount: 10,
    }), TODAY);
    expect(e.ageDays).toBe(2);
    expect(e.stale).toBe(false);
  });
});

// ── Morning brief priorities ─────────────────────────────────────────────────

function estimateFact(partial: Partial<EstimateFact>): EstimateFact {
  return {
    id: 'e', number: 'EST-1', status: 'Sent', customerName: 'Jane', vehicleLabel: '',
    total: 100, currency: 'USD', sentAt: '2026-11-01', createdAt: '2026-11-01',
    ageDays: 21, awaitingReply: true, stale: true, ...partial,
  };
}

function jobFact(partial: Partial<JobFact>): JobFact {
  return {
    id: 'j', ro: 'RO-1', customerName: 'Jane', vehicleLabel: 'Civic', serviceType: '',
    status: 'In Progress', checkInDate: '2026-11-01', ageDays: 21, ...partial,
  };
}

describe('pickStartWith / morning brief', () => {
  it('orders: most overdue invoice, biggest stale estimate, longest-open job', () => {
    const owed = groupOwes(receivablesFrom(invoices, payments, TODAY));
    const picks = pickStartWith({
      openJobs: [jobFact({}), jobFact({ id: 'j2', ro: 'RO-2', ageDays: 5 })],
      awaitingEstimates: [
        estimateFact({}),
        estimateFact({ id: 'e2', number: 'EST-2', total: 900 }),
      ],
      owedGroups: owed,
    });
    expect(picks).toHaveLength(3);
    expect(picks[0]).toContain('INV-3'); // 52 days overdue beats INV-1's 21
    expect(picks[1]).toContain('EST-2'); // 900 beats 100
    expect(picks[2]).toContain('RO-1');  // 21 days open beats 5
  });

  it('the brief counts cite the same facts', () => {
    const owed = groupOwes(receivablesFrom(invoices, payments, TODAY));
    const text = buildMorningBriefAnswer({
      openJobs: [jobFact({})],
      awaitingEstimates: [estimateFact({})],
      owedGroups: owed,
    }, TODAY);
    expect(text).toContain('1 open job');
    expect(text).toContain('1 stale estimate');
    expect(text).toContain('3 unpaid invoices, 2 overdue');
  });
});

// ── Drafts ───────────────────────────────────────────────────────────────────

describe('deterministic drafts', () => {
  it('estimate draft cites number, total, vehicle and sent date', () => {
    const draft = draftEstimateFollowUp(estimateFact({ total: 2500 }), 'D1 Imports');
    expect(draft).toContain('estimate EST-1');
    expect(draft).toContain('USD 2,500.00');
    expect(draft).toContain('2026-11-01');
    expect(draft).toContain('D1 Imports');
  });

  it('invoice draft cites the balance, due date and any part-payment', () => {
    const draft = draftInvoiceFollowUp({
      invoiceNumber: 'INV-1', customerName: 'Alice', vehicleLabel: '2020 Civic',
      currency: 'USD', total: 100, paid: 40, balance: 60,
      dueDate: '2026-11-01', daysOverdue: 21, status: 'Sent',
    }, 'D1 Imports');
    expect(draft).toContain('invoice INV-1');
    expect(draft).toContain('USD 60.00');
    expect(draft).toContain('due on 2026-11-01 (21 days ago)');
    expect(draft).toContain('received USD 40.00');
  });
});

// ── Query scope ──────────────────────────────────────────────────────────────

/** A Supabase-shaped stub: records the shop scope it was queried with. */
function stubDb(fixtures: Record<string, Record<string, unknown>[]>) {
  const seenScopes: Record<string, unknown[][]> = {};
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: (col: string, vals: unknown[]) => {
          if (col === 'shop_id') (seenScopes[table] ??= []).push(vals);
          return chain;
        },
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: fixtures[table] ?? [], error: null }),
      };
      return chain;
    },
  };
  return { db, seenScopes };
}

describe('query scope', () => {
  it('fetchAwaitingEstimates only reads inside the given scope', async () => {
    const { db, seenScopes } = stubDb({
      estimates: [
        estimateRow({ id: 'e1', total_amount: 10 }),
        estimateRow({ id: 'e2', estimate_number: 'EST-2', status: 'Approved', total_amount: 10 }),
        estimateRow({ id: 'e3', estimate_number: 'EST-3', status: 'sent', total_amount: 10 }),
      ],
      customers: [],
      // mergedShopScope lookups — no mirrors, no archived shops
      shop_mirrors: [],
      shops: [],
    });
    const out = await fetchAwaitingEstimates(db as never, ['shop-1'], TODAY);
    expect(out.map(e => e.id)).toEqual(['e1', 'e3']); // approved filtered out
    expect(seenScopes.estimates?.[0]).toEqual(['shop-1']);
  });

  it('fetchOwed only reads invoices/payments inside the given scope', async () => {
    const { db, seenScopes } = stubDb({
      invoices: [
        { number: 'INV-9', customer: 'Alice', status: 'Sent', currency: 'USD', lines: [{ qty: 1, rate: 75 }], discount: 0, tax_rate: 0, due_date: '2026-11-01', created_at: '2026-10-30' },
      ],
      payments: [],
      shop_mirrors: [],
      shops: [],
    });
    const groups = await fetchOwed(db as never, ['shop-1'], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalsByCurrency).toEqual({ USD: 75 });
    expect(seenScopes.invoices?.[0]).toEqual(['shop-1']);
    expect(seenScopes.payments?.[0]).toEqual(['shop-1']);
  });
});
