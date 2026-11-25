/**
 * Estimates, as a domain service.
 *
 * Ported out of services/estimateService.ts, which now calls this through the
 * browser adapter, so the staff screens and API v1 run the same rules against
 * the same table. Behaviour is the service's, unchanged: the same columns are
 * written, the same audit rows recorded. Two things are added because a domain
 * module needs them and the browser service never had them:
 *
 *   - Writes check `estimates.manage`. Owners, managers and advisors hold it
 *     by default; technicians cannot open the Estimates screen at all.
 *   - Approval emits `estimate.approved` to the domain event outbox. It was
 *     listed as planned until estimates had a module to emit from.
 *
 * The intelligence and Sapelee hooks on approval stay in the browser service:
 * they are outbound integrations, and whether an API-initiated change should
 * reach them is a separate decision (see docs/m13-api-readiness.md).
 */
import type { DomainDb, DomainDeps } from './db';
import { writeAuditEvent, AUDIT, type AuditEntry } from './audit';
import { requireCapability, type DomainContext } from './context';
import { emitDomainEvent, DOMAIN_EVENTS } from './events';

/**
 * Estimate audit rows are recorded loudly but not fatally, exactly as the
 * browser service did through recordAudit: an estimate that saved must not be
 * reported to the advisor as a failure because the audit insert hiccuped.
 * Money domains (invoices, payments) keep the stricter rule.
 */
async function auditEstimate(db: DomainDb, context: DomainContext, entry: AuditEntry): Promise<void> {
  try {
    await writeAuditEvent(db, context, entry);
  } catch (error) {
    console.error(`[audit] failed to record ${entry.action} on estimate ${entry.entityId}`, error);
    try {
      const { alertException } = await import('@/lib/observability/alerts');
      alertException('audit', error, { action: entry.action, entityType: entry.entityType });
    } catch { /* reporting must not be the thing that breaks */ }
  }
}

export interface EstimateLine {
  note: string;
  description: string;
  laoDescription?: string;
  qty: number;
  rate: number;
  cost?: number;
  markup?: number;
  currency?: string;
  /**
   * Where this line's price came from, frozen at the moment it was quoted.
   *
   * Present only on lines added through Parts Intelligence; a hand-typed line
   * has none and behaves exactly as before. It rides inside the `lines` JSONB
   * rather than needing columns, so existing estimates are untouched and the
   * table's own shop_id RLS already covers it.
   *
   * PROCUREMENT METADATA ONLY. `calculateEstimateTotals` reads `qty` and
   * `rate` and never looks at this — a marketplace price change can therefore
   * not move an issued estimate. See lib/parts/snapshot.ts.
   */
  partsSource?: import('@/lib/parts/snapshot').PartsSourceSnapshot;
}

export interface EstimateFull {
  id: string;
  estimateNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  jobCardId: string;
  status: string;
  lines: EstimateLine[];
  discount: number;
  shopSupplies: number;
  taxRate: number;
  notes: string;
  validUntil: string;
  approvedDate: string | null;
  currency: string;
  createdAt: string;
}

export type EstimateInput = Omit<EstimateFull, 'id' | 'createdAt'>;

export function mapEstimateRow(r: Record<string, unknown>): EstimateFull {
  return {
    id: r.id as string,
    estimateNumber: (r.estimate_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    jobCardId: (r.job_card_id as string) || '',
    status: (r.status as string) || 'Draft',
    lines: (r.lines as EstimateLine[]) || [],
    discount: Number(r.discount ?? 0),
    shopSupplies: Number(r.shop_supplies ?? 0),
    taxRate: Number(r.tax_rate ?? 0),
    notes: (r.notes as string) || '',
    validUntil: (r.valid_until as string) || '',
    approvedDate: (r.approved_date as string) || null,
    currency: (r.currency as string) || 'USD',
    createdAt: (r.created_at as string) || '',
  };
}

/** Partial update → column payload. Only fields the caller set are written. */
export function estimateUpdatePayload(updates: Partial<EstimateFull>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.jobCardId !== undefined) payload.job_card_id = updates.jobCardId || null;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.lines !== undefined) payload.lines = updates.lines;
  if (updates.discount !== undefined) payload.discount = updates.discount;
  if (updates.shopSupplies !== undefined) payload.shop_supplies = updates.shopSupplies;
  if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.validUntil !== undefined) payload.valid_until = updates.validUntil || null;
  if (updates.approvedDate !== undefined) payload.approved_date = updates.approvedDate || null;
  if (updates.currency !== undefined) payload.currency = updates.currency;
  return payload;
}

export function createEstimateDomain({ db, context }: DomainDeps) {
  async function list(): Promise<EstimateFull[]> {
    const { data, error } = await db
      .from('estimates')
      .select('*')
      .in('shop_id', context.shopIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapEstimateRow);
  }

  async function get(id: string): Promise<EstimateFull | null> {
    const { data, error } = await db
      .from('estimates')
      .select('*')
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEstimateRow(data) : null;
  }

  async function create(est: EstimateInput): Promise<EstimateFull> {
    requireCapability(context, 'estimates.manage', 'create estimates');
    const { data, error } = await db
      .from('estimates')
      .insert({
        shop_id: context.shopId,
        estimate_number: est.estimateNumber,
        customer_name: est.customerName,
        customer_id: est.customerId || null,
        vehicle: est.vehicle,
        job_card_id: est.jobCardId || null,
        status: est.status,
        lines: est.lines,
        discount: est.discount,
        shop_supplies: est.shopSupplies,
        tax_rate: est.taxRate,
        notes: est.notes,
        valid_until: est.validUntil || null,
        currency: est.currency || 'USD',
      })
      .select()
      .single();
    if (error) throw error;

    await auditEstimate(db, context, {
      action: AUDIT.estimateCreated,
      entityType: 'estimate',
      entityId: data.id as string,
      after: {
        number: data.estimate_number, customer: data.customer_name,
        vehicle: data.vehicle, status: data.status,
        lines: data.lines, discount: data.discount, currency: data.currency,
      },
    });
    return mapEstimateRow(data);
  }

  async function update(id: string, updates: Partial<EstimateFull>): Promise<void> {
    requireCapability(context, 'estimates.manage', 'edit estimates');
    const payload = estimateUpdatePayload(updates);
    const { error } = await db.from('estimates').update(payload).eq('id', id).in('shop_id', context.shopIds);
    if (error) throw error;

    await auditEstimate(db, context, {
      action: AUDIT.estimateUpdated,
      entityType: 'estimate',
      entityId: id,
      after: payload,
    });
  }

  async function approve(id: string): Promise<void> {
    requireCapability(context, 'estimates.manage', 'approve estimates');
    const { data, error } = await db
      .from('estimates')
      .update({ status: 'Approved', approved_date: new Date().toISOString() })
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select('id, estimate_number, customer_id, currency')
      .maybeSingle();
    if (error) throw error;

    // Approval is the moment the customer agreed to the work. Keyed on the
    // estimate, so approving the same estimate twice queues one event.
    if (data) {
      await emitDomainEvent(db, context, {
        eventType: DOMAIN_EVENTS.estimateApproved,
        aggregateType: 'estimate',
        aggregateId: id,
        payload: {
          estimateId: id,
          estimateNumber: data.estimate_number ?? null,
          customerId: data.customer_id ?? null,
          currency: data.currency ?? null,
        },
        idempotencyKey: 'estimate.approved:' + id,
      });
    }

    // Approval is its own audit action, not a generic update: it is what a
    // dispute asks about.
    await auditEstimate(db, context, {
      action: AUDIT.estimateApproved,
      entityType: 'estimate',
      entityId: id,
      after: { status: 'Approved' },
    });
  }

  async function remove(id: string): Promise<void> {
    requireCapability(context, 'estimates.manage', 'delete estimates');
    const { data: before } = await db
      .from('estimates').select('*').eq('id', id).in('shop_id', context.shopIds).maybeSingle();

    const { error } = await db.from('estimates').delete().eq('id', id).in('shop_id', context.shopIds);
    if (error) throw error;

    await auditEstimate(db, context, {
      action: AUDIT.estimateDeleted,
      entityType: 'estimate',
      entityId: id,
      before: before ? {
        number: before.estimate_number, customer: before.customer_name,
        status: before.status, lines: before.lines, currency: before.currency,
      } : null,
    });
  }

  return { list, get, create, update, approve, remove };
}

export type EstimateDomain = ReturnType<typeof createEstimateDomain>;
