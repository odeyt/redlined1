/**
 * Invoice operations, callable from anywhere.
 *
 * The arithmetic is NOT reimplemented here. `calculateTotals`,
 * `getEffectiveTotal` and the row mapping now live in ./invoiceMath — pure,
 * already tested, and the only place multi-currency lines are reasoned about.
 * services/invoiceService.ts re-exports them, so every existing caller keeps
 * its import path and there is still exactly ONE implementation.
 *
 * Two facts about this table that have already cost production time:
 *
 *   - `invoices` has NO `id` column. Its primary key is `number`. A trigger
 *     written against `NEW.id` blocked every invoice payment for three days.
 *     Every query here keys on `number`.
 *   - A unique index on `repair_order_id` is what stops two sessions billing
 *     the same repair order twice. The 23505 it raises is translated into a
 *     sentence a service advisor can act on, exactly as the existing service
 *     does.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';
import { changedFields } from './changes';
import { emitDomainEvent, DOMAIN_EVENTS } from './events';
import { mapInvoiceRow, getEffectiveTotal } from './invoiceMath';
import type { InvoiceFull } from './invoiceMath';

export type { InvoiceFull, InvoiceLine, InvoiceTotals } from './invoiceMath';

export type InvoiceInput = Omit<InvoiceFull, 'id' | 'createdAt'>;

/**
 * What an audit row keeps for an invoice.
 *
 * Line items ARE included: on a financial record, "the total changed" without
 * "which line changed" is not an answer. redactSnapshot caps them if they grow
 * beyond a sensible size.
 */
function auditView(inv: InvoiceFull): Record<string, unknown> {
  return {
    number: inv.invoiceNumber,
    customer: inv.customerName,
    status: inv.status,
    currency: inv.currency,
    lines: inv.lines,
    discount: inv.discount,
    shopSupplies: inv.shopSupplies,
    taxRate: inv.taxRate,
    dueDate: inv.dueDate,
    paidDate: inv.paidDate,
  };
}

export function createInvoiceDomain({ db, context }: DomainDeps) {
  async function list(): Promise<InvoiceFull[]> {
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .in('shop_id', context.shopIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapInvoiceRow);
  }

  async function get(invoiceNumber: string): Promise<InvoiceFull | null> {
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .eq('number', invoiceNumber)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapInvoiceRow(data) : null;
  }

  async function create(inv: InvoiceInput): Promise<InvoiceFull> {
    requireCapability(context, 'invoices.manage', 'raise invoices');
    const { data, error } = await db
      .from('invoices')
      .insert({
        shop_id: context.shopId,
        number: inv.invoiceNumber,
        customer: inv.customerName,
        customer_id: inv.customerId || null,
        vehicle: inv.vehicle,
        job_card: inv.jobCardId || null,
        repair_order_id: inv.repairOrderId || null,
        status: inv.status,
        lines: inv.lines,
        discount: inv.discount,
        shop_supplies: inv.shopSupplies,
        tax_rate: inv.taxRate,
        notes: inv.notes,
        due_date: inv.dueDate || null,
        currency: inv.currency || 'USD',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && String(error.message).includes('invoices_one_per_repair_order')) {
        throw new Error('This repair order has already been invoiced — someone else may have just billed it. Reload to see the invoice.');
      }
      throw error;
    }

    const invoice = mapInvoiceRow(data);
    const total = getEffectiveTotal(invoice);

    // Raising an invoice is the moment a receivable exists, which is what an
    // accounting integration subscribes to. Keyed on invoiceNumber, not id:
    // this table is keyed on number everywhere else, and an aggregateId that
    // disagrees with the rest of the system is a subscriber's bug to find.
    await emitDomainEvent(db, context, {
      eventType: DOMAIN_EVENTS.invoiceIssued,
      aggregateType: 'invoice',
      aggregateId: invoice.invoiceNumber,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        repairOrderId: invoice.repairOrderId ?? null,
        amount: total.amount,
        currency: total.currency,
        status: invoice.status,
        dueDate: invoice.dueDate,
        lineCount: invoice.lines.length,
      },
      idempotencyKey: 'invoice.issued:' + invoice.invoiceNumber,
    });

    await writeAuditEvent(db, context, {
      action: AUDIT.invoiceCreated,
      entityType: 'invoice',
      entityId: invoice.invoiceNumber,
      after: auditView(invoice),
    });
    return invoice;
  }

  async function update(invoiceNumber: string, raw: Partial<InvoiceFull>): Promise<void> {
    requireCapability(context, 'invoices.manage', 'edit invoices');
    const before = await get(invoiceNumber);

    // Only the fields that actually differ. Re-saving an invoice nobody edited
    // should not appear in the audit trail as a change to money — that is the
    // one place a false entry is genuinely misleading.
    const updates: Partial<InvoiceFull> = before
      ? (changedFields(
          before as unknown as Record<string, unknown>,
          raw as Record<string, unknown>,
        ) as Partial<InvoiceFull>)
      : raw;
    if (before && Object.keys(updates).length === 0) return;

    const payload: Record<string, unknown> = {};
    if (updates.customerName !== undefined) payload.customer = updates.customerName;
    if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
    if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
    if (updates.jobCardId !== undefined) payload.job_card = updates.jobCardId || null;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.lines !== undefined) payload.lines = updates.lines;
    if (updates.discount !== undefined) payload.discount = updates.discount;
    if (updates.shopSupplies !== undefined) payload.shop_supplies = updates.shopSupplies;
    if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
    if (updates.paidDate !== undefined) payload.paid_date = updates.paidDate || null;
    if (updates.currency !== undefined) payload.currency = updates.currency;

    const { error } = await db
      .from('invoices')
      .update(payload)
      .eq('number', invoiceNumber)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    // A status change is its own event. Money moving from Draft to Paid is the
    // thing a reconciliation asks about, and burying it inside a generic
    // "updated" row makes it unfindable.
    const statusChanged = updates.status !== undefined && before && updates.status !== before.status;
    await writeAuditEvent(db, context, {
      action: statusChanged ? AUDIT.invoiceStatusChanged : AUDIT.invoiceUpdated,
      entityType: 'invoice',
      entityId: invoiceNumber,
      before: before ? auditView(before) : null,
      after: before ? { ...auditView(before), ...updates } : (updates as Record<string, unknown>),
    });
  }

  /**
   * Marks paid. Returns the invoice as it was, so the caller can publish the
   * side-effect events it already publishes without a second read.
   *
   * The event hooks themselves stay in the service wrapper: they import
   * modules that are not safe in every runtime this domain layer must work in,
   * and firing an intelligence event from a webhook is a decision for a later
   * milestone, not a side effect of moving code.
   */
  async function markPaid(invoiceNumber: string): Promise<InvoiceFull | null> {
    requireCapability(context, 'invoices.manage', 'mark invoices paid');
    const before = await get(invoiceNumber);
    const paidDate = new Date().toISOString();

    const { error } = await db
      .from('invoices')
      .update({ status: 'Paid', paid_date: paidDate })
      .eq('number', invoiceNumber)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.invoiceStatusChanged,
      entityType: 'invoice',
      entityId: invoiceNumber,
      before: before ? auditView(before) : null,
      after: before ? { ...auditView(before), status: 'Paid', paidDate } : { status: 'Paid', paidDate },
    });
    return before;
  }

  async function remove(invoiceNumber: string): Promise<void> {
    requireCapability(context, 'invoices.manage', 'delete invoices');
    const before = await get(invoiceNumber);
    const { error } = await db
      .from('invoices')
      .delete()
      .eq('number', invoiceNumber)
      .in('shop_id', context.shopIds);
    if (error) throw error;

    await writeAuditEvent(db, context, {
      action: AUDIT.invoiceDeleted,
      entityType: 'invoice',
      entityId: invoiceNumber,
      before: before ? auditView(before) : null,
    });
  }

  return { list, get, create, update, markPaid, remove };
}

export type InvoiceDomain = ReturnType<typeof createInvoiceDomain>;
