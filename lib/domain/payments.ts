/**
 * Payment operations, callable from anywhere — and a holding pen for two
 * operations that should not exist.
 *
 * ## What this milestone does and does not fix
 *
 * The M0 audit found that payments can be edited and hard-deleted with no
 * ledger, no reversal, and — because `audit_logs` was an unused stub — no
 * record that it happened. Money could be altered or erased leaving nothing
 * behind.
 *
 * **M1 does not fix that.** Moving `updatePayment` and `deletePayment` into a
 * domain module does not make them safe, and this file must not be read as
 * claiming otherwise. What M1 does is narrower and still worth having:
 *
 *   1. every payment mutation now goes through one place, and
 *   2. every payment mutation now writes an audit row first,
 *
 * so that while the destructive behaviour still exists, it is at least
 * recoverable in the sense that mattered most: you can find out what was
 * there. `payment.deleted` audit rows carry the full financial detail of the
 * removed row for exactly this reason.
 *
 * M2 replaces both with ledger semantics — append, reverse, adjust — after
 * which `updateLegacy` and `removeLegacy` are deleted. They are named
 * `*Legacy` so that no new caller adopts them by accident, and so that the
 * eventual removal is a compile error at every remaining call site rather than
 * a silent behaviour change.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';

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
}

export type PaymentInput = Omit<DomainPayment, 'id' | 'createdAt'>;

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
  };
}

/**
 * The whole financial record, deliberately.
 *
 * For customers an audit snapshot is trimmed, because an audit table holding
 * personal data is a liability. For payments the opposite applies: if a row is
 * deleted, this snapshot is the only surviving evidence of the transaction,
 * and an amount without its method, reference and date cannot be reconciled
 * against a bank statement.
 */
function auditView(p: DomainPayment): Record<string, unknown> {
  return {
    id: p.id,
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
    notes: p.notes,
    createdAt: p.createdAt,
  };
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
      })
      .select()
      .single();
    if (error) throw error;

    const payment = mapPaymentRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.paymentCreated,
      entityType: 'payment',
      entityId: payment.id,
      after: auditView(payment),
    });
    return payment;
  }

  /**
   * LEGACY — destructive edit of a financial record. Replaced in M2 by an
   * adjustment entry. Do not call from new code.
   */
  async function updateLegacy(id: string, updates: Partial<DomainPayment>): Promise<void> {
    const before = await get(id);

    const payload: Record<string, unknown> = {};
    if (updates.invoiceNumber !== undefined) payload.invoice_number = updates.invoiceNumber || null;
    if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
    if (updates.amount !== undefined) payload.amount = updates.amount;
    if (updates.method !== undefined) payload.method = updates.method;
    if (updates.methodDetail !== undefined) payload.method_detail = updates.methodDetail;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.referenceNumber !== undefined) payload.reference_number = updates.referenceNumber;
    if (updates.paymentDate !== undefined) payload.payment_date = updates.paymentDate;

    const { error } = await db
      .from('payments')
      .update(payload)
      .eq('id', id)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.paymentUpdated,
      entityType: 'payment',
      entityId: id,
      before: before ? auditView(before) : null,
      after: before ? { ...auditView(before), ...updates } : (updates as Record<string, unknown>),
      metadata: { legacy: true, replacedBy: 'M2 adjustment entry' },
    });
  }

  /**
   * LEGACY — hard delete of a financial record. Replaced in M2 by a reversal
   * entry. Do not call from new code.
   *
   * The audit row is written BEFORE the delete, not after. If the delete then
   * fails, an extra audit row is confusing but harmless; if the order were
   * reversed and the audit write failed, the money would be gone with no
   * record of what it was — which is the failure this exists to prevent.
   */
  async function removeLegacy(id: string): Promise<void> {
    const before = await get(id);

    await writeAuditEvent(db, context, {
      action: AUDIT.paymentDeleted,
      entityType: 'payment',
      entityId: id,
      before: before ? auditView(before) : null,
      metadata: { legacy: true, replacedBy: 'M2 reversal entry' },
    });

    const { error } = await db
      .from('payments')
      .delete()
      .eq('id', id)
      .in('shop_id', context.shopIds);
    if (error) throw error;
  }

  return { list, get, create, updateLegacy, removeLegacy };
}

export type PaymentDomain = ReturnType<typeof createPaymentDomain>;
