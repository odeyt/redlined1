/**
 * Payments, as a ledger.
 *
 * Entries are appended and never changed. A mistake is corrected by REVERSING
 * it — a second row of the opposite amount pointing at the first — so the
 * history stays true and the arithmetic still comes out right.
 *
 * Why that shape rather than an edit:
 *
 *   - Every existing report, dashboard and metric sums `amount`. A reversal is
 *     negative, so all of them stay correct with no changes. (Verified: the
 *     six other readers of this table are SELECT-only.)
 *   - "The customer paid 500 and we later reversed it" is a different fact
 *     from "the customer paid nothing", and only one of them can be
 *     reconciled against a bank statement.
 *   - A deleted row cannot be audited after the fact. A reversed one explains
 *     itself.
 *
 * The database enforces the same rules independently (see
 * 2026-08-17_m2_payment_ledger.sql): payments cannot be updated or deleted at
 * all, a reversal must be the exact negative of its target, in the same
 * currency and shop, and a payment can be reversed only once.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';
import { emitDomainEvent, DOMAIN_EVENTS } from './events';

export type PaymentEntryType = 'payment' | 'reversal';

export interface DomainPayment {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  amount: number;
  method: string;
  methodDetail: string;
  status: string;
  notes: string;
  currency: string;
  referenceNumber: string;
  paymentDate: string;
  createdAt: string;
  /** 'payment' or 'reversal'. Reversals carry a negative amount. */
  entryType: PaymentEntryType;
  /** Set on a reversal: the entry it cancels. */
  reversesPaymentId: string | null;
  /** Why it was reversed. Required by the domain, not by the column. */
  reason: string;
}

export type PaymentInput = Omit<
  DomainPayment, 'id' | 'createdAt' | 'entryType' | 'reversesPaymentId' | 'reason'
>;

export function mapPaymentRow(r: Record<string, unknown>): DomainPayment {
  return {
    id: r.id as string,
    invoiceNumber: (r.invoice_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    amount: Number(r.amount ?? 0),
    method: (r.method as string) || 'Cash',
    methodDetail: (r.method_detail as string) || '',
    status: (r.status as string) || 'Recorded',
    notes: (r.notes as string) || '',
    currency: (r.currency as string) || 'USD',
    referenceNumber: (r.reference_number as string) || '',
    paymentDate: (r.payment_date as string) || '',
    createdAt: (r.created_at as string) || '',
    entryType: ((r.entry_type as PaymentEntryType) || 'payment'),
    reversesPaymentId: (r.reverses_payment_id as string) ?? null,
    reason: (r.reason as string) || '',
  };
}

/**
 * The whole financial record. If anything ever goes wrong with an entry, this
 * snapshot is what makes it reconcilable against a bank statement — an amount
 * without its method, reference and date is not.
 */
function auditView(p: DomainPayment): Record<string, unknown> {
  return {
    id: p.id,
    entryType: p.entryType,
    reversesPaymentId: p.reversesPaymentId,
    invoiceNumber: p.invoiceNumber,
    customerName: p.customerName,
    customerId: p.customerId,
    amount: p.amount,
    currency: p.currency,
    method: p.method,
    methodDetail: p.methodDetail,
    status: p.status,
    referenceNumber: p.referenceNumber,
    paymentDate: p.paymentDate,
    reason: p.reason,
    notes: p.notes,
  };
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * Net of an entry list — payments minus reversals.
 *
 * Exported so a caller never has to remember that reversals are already
 * negative and must NOT be subtracted again. Getting that wrong double-counts
 * a reversal, which is the arithmetic mistake this shape otherwise invites.
 */
export function netAmount(entries: readonly DomainPayment[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/** Entries that are still standing: a payment with no reversal against it. */
export function liveEntries(entries: readonly DomainPayment[]): DomainPayment[] {
  const reversed = new Set(
    entries.filter(e => e.entryType === 'reversal').map(e => e.reversesPaymentId),
  );
  return entries.filter(e => e.entryType === 'payment' && !reversed.has(e.id));
}

export function createPaymentDomain({ db, context }: DomainDeps) {
  async function list(): Promise<DomainPayment[]> {
    const { data, error } = await db
      .from('payments')
      .select('*')
      .in('shop_id', context.shopIds)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPaymentRow);
  }

  async function get(id: string): Promise<DomainPayment | null> {
    const { data, error } = await db
      .from('payments')
      .select('*')
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapPaymentRow(data) : null;
  }

  async function create(input: PaymentInput): Promise<DomainPayment> {
    requireCapability(context, 'payments.record', 'record payments');
    const { data, error } = await db
      .from('payments')
      .insert({
        shop_id: context.shopId,
        invoice_number: input.invoiceNumber || null,
        customer_name: input.customerName,
        customer_id: input.customerId || null,
        amount: input.amount,
        method: input.method,
        method_detail: input.methodDetail,
        status: input.status,
        notes: input.notes,
        currency: input.currency,
        reference_number: input.referenceNumber,
        payment_date: input.paymentDate || new Date().toISOString(),
        entry_type: 'payment',
      })
      .select()
      .single();
    if (error) throw translate(error);

    const payment = mapPaymentRow(data);
    // Money arriving is the event other systems care about most, and the
    // one an accounting integration or a customer receipt would subscribe to.
    await emitDomainEvent(db, context, {
      eventType: DOMAIN_EVENTS.paymentRecorded,
      aggregateType: 'payment',
      aggregateId: payment.id,
      payload: {
        invoiceNumber: payment.invoiceNumber,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        paymentDate: payment.paymentDate,
      },
      idempotencyKey: 'payment.recorded:' + payment.id,
    });

    await writeAuditEvent(db, context, {
      action: AUDIT.paymentCreated,
      entityType: 'payment',
      entityId: payment.id,
      after: auditView(payment),
    });
    return payment;
  }

  /**
   * Cancels an entry by appending its opposite. The original row is untouched.
   *
   * A reason is required by this layer even though the column allows null: a
   * reversal with no explanation is the thing an auditor asks about six months
   * later and nobody can answer.
   */
  async function reverse(paymentId: string, reason: string): Promise<DomainPayment> {
    // Separate from payments.record on purpose: taking money is a daily task,
    // cancelling a recorded payment rewrites the books.
    requireCapability(context, 'payments.reverse', 'reverse payments');
    const trimmed = (reason ?? '').trim();
    if (!trimmed) throw new LedgerError('A reversal needs a reason.');

    const original = await get(paymentId);
    if (!original) throw new LedgerError('That payment is not in this location.');
    if (original.entryType === 'reversal') {
      throw new LedgerError('That entry is already a reversal. Record a new payment instead.');
    }

    const { data, error } = await db
      .from('payments')
      .insert({
        shop_id: context.shopId,
        invoice_number: original.invoiceNumber || null,
        customer_name: original.customerName,
        customer_id: original.customerId || null,
        amount: -original.amount,
        method: original.method,
        method_detail: original.methodDetail,
        status: original.status,
        notes: original.notes,
        currency: original.currency,
        reference_number: original.referenceNumber,
        payment_date: new Date().toISOString(),
        entry_type: 'reversal',
        reverses_payment_id: original.id,
        reason: trimmed,
      })
      .select()
      .single();
    if (error) throw translate(error);

    const reversal = mapPaymentRow(data);

    // Money leaving is as material as money arriving, and a subscriber that
    // heard payment.recorded and never hears this one has a wrong balance.
    // The aggregate is the ORIGINAL payment — that is the thing whose state
    // changed; the reversal row is how, and rides in the payload.
    await emitDomainEvent(db, context, {
      eventType: DOMAIN_EVENTS.paymentReversed,
      aggregateType: 'payment',
      aggregateId: original.id,
      payload: {
        reversalId: reversal.id,
        invoiceNumber: reversal.invoiceNumber,
        amount: reversal.amount,
        currency: reversal.currency,
        method: reversal.method,
        reason: trimmed,
      },
      // A payment can be reversed only once, so the original's id is the whole
      // key. A second attempt is refused by the ledger before reaching here.
      idempotencyKey: 'payment.reversed:' + original.id,
    });

    await writeAuditEvent(db, context, {
      action: AUDIT.paymentReversed,
      entityType: 'payment',
      entityId: original.id,
      before: auditView(original),
      after: auditView(reversal),
      metadata: { reversalId: reversal.id, reason: trimmed },
    });
    return reversal;
  }

  /**
   * Fixes a wrong entry: reverse it, then record the corrected one.
   *
   * Two writes, not one transaction — PostgREST cannot span them. The ORDER is
   * the safeguard: the reversal goes first, so a failure in the second step
   * leaves the payment cancelled and visible rather than duplicated. Losing a
   * payment that can be re-entered is recoverable; billing a customer twice
   * is not.
   *
   * The caller is told which half happened via the returned pair.
   */
  async function correct(
    paymentId: string,
    corrected: PaymentInput,
    reason: string,
  ): Promise<{ reversal: DomainPayment; replacement: DomainPayment }> {
    const reversal = await reverse(paymentId, reason);
    try {
      const replacement = await create(corrected);
      await writeAuditEvent(db, context, {
        action: AUDIT.paymentCorrected,
        entityType: 'payment',
        entityId: paymentId,
        after: { reversalId: reversal.id, replacementId: replacement.id, reason },
      });
      return { reversal, replacement };
    } catch (e) {
      throw new LedgerError(
        `The original payment was reversed, but the corrected entry could not be saved: ` +
        `${e instanceof Error ? e.message : String(e)}. Record the correct payment manually.`,
      );
    }
  }

  return { list, get, create, reverse, correct };
}

/** Postgres constraint violations, in words a service advisor can act on. */
function translate(error: { code?: string; message?: string }): Error {
  const message = String(error?.message ?? '');
  if (error?.code === '23503' && message.includes('invoice_number')) {
    return new LedgerError('That invoice no longer exists, so a payment cannot be recorded against it.');
  }
  if (error?.code === '23505' && message.includes('one_reversal_per_payment')) {
    return new LedgerError('That payment has already been reversed — someone else may have just done it. Reload to see the ledger.');
  }
  if (error?.code === '42501' && message.includes('append-only')) {
    return new LedgerError('Payments cannot be edited or deleted. Reverse the entry instead.');
  }
  return error as Error;
}

export type PaymentDomain = ReturnType<typeof createPaymentDomain>;
