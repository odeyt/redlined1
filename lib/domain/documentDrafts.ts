/**
 * Draft estimates and invoices written by an API key (docs/api/PLAN.md
 * phase 4). The rules owner-approved on 2026-11-24 live here, in the domain,
 * so no route can loosen them:
 *
 *   - What a key creates is always a Draft.
 *   - Only a Draft can be edited. The update is conditional on status, so a
 *     draft a person sends while a bot is editing it is not overwritten.
 *   - Only an Approved estimate converts, once. The database's unique index on
 *     invoices.source_estimate_id decides a race, not this code.
 *   - Nothing here sends, approves, records a payment, voids or deletes.
 *
 * One more rule protects the shop's margins: a bot never sees line cost or
 * markup, so it may not replace the lines of a draft that carries them. It
 * would silently wipe data it cannot see. Other fields stay editable.
 *
 * API-only: refuses any context that is not an API key, so a staff screen
 * cannot reach these by accident.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability, type DomainContext } from './context';
import { allocateDocumentNumberForApi } from './documentNumbers';
import {
  createEstimateDomain, estimateUpdatePayload, toEstimateRecord, auditEstimate,
  type EstimateLine, type EstimateRecord,
} from './estimates';
import { createInvoiceDomain, toInvoiceRecord, type InvoiceRecord } from './invoices';
import { DocumentStateError } from './documentQuery';

/** A line as a key may write it: no cost, markup or procurement data. */
export interface DraftLine {
  description: string;
  laoDescription?: string;
  note: string;
  qty: number;
  rate: number;
  currency?: string;
}

/** Who and what a draft is for; resolved and tenant-checked by the caller. */
export interface DraftParty {
  customerId: string;
  customerName: string;
  /** The vehicle label, as the staff screens store it. */
  vehicle: string;
}

export interface EstimateDraftInput extends DraftParty {
  currency: string;
  lines: DraftLine[];
  notes: string;
  validUntil: string;
  /** The shop's default (a fraction); a key cannot set it. */
  taxRate: number;
}

export interface InvoiceDraftInput extends DraftParty {
  currency: string;
  lines: DraftLine[];
  notes: string;
  dueDate: string;
  taxRate: number;
}

export interface DraftPatch {
  customerId?: string;
  customerName?: string;
  vehicle?: string;
  currency?: string;
  lines?: DraftLine[];
  notes?: string;
  /** Estimates only. */
  validUntil?: string;
  /** Invoices only. */
  dueDate?: string;
}

/** True when a line carries data a key cannot see and must not overwrite. */
export function lineHasCostData(line: Record<string, unknown>): boolean {
  return (line.cost !== undefined && line.cost !== null)
    || (line.markup !== undefined && line.markup !== null)
    || Boolean(line.partsSource);
}

/** Only the allowed line fields, so nothing extra can ride into the JSONB. */
export function cleanLines(lines: readonly DraftLine[]): EstimateLine[] {
  return lines.map(l => ({
    description: l.description,
    note: l.note ?? '',
    qty: l.qty,
    rate: l.rate,
    ...(l.laoDescription ? { laoDescription: l.laoDescription } : {}),
    ...(l.currency ? { currency: l.currency } : {}),
  }));
}

function requireApiKey(context: DomainContext): string {
  const key = context.actor.apiKey;
  if (context.actor.type !== 'api' || !key) {
    throw new Error('Draft writes are only for API keys.');
  }
  return key.id;
}

export function createDocumentDraftDomain(deps: DomainDeps) {
  const { db, context } = deps;
  const apiKeyId = requireApiKey(context);
  const estimates = createEstimateDomain(deps);
  const invoices = createInvoiceDomain(deps);

  // ── Estimates ──────────────────────────────────────────────────────────────

  async function createEstimateDraft(input: EstimateDraftInput): Promise<EstimateRecord> {
    requireCapability(context, 'estimates.manage', 'create estimates');
    const number = await allocateDocumentNumberForApi(db, context.shopId, 'estimate');
    const created = await estimates.create({
      estimateNumber: number,
      customerName: input.customerName,
      customerId: input.customerId,
      vehicle: input.vehicle,
      jobCardId: '',
      status: 'Draft',
      lines: cleanLines(input.lines),
      discount: 0,
      shopSupplies: 0,
      taxRate: input.taxRate,
      notes: input.notes,
      validUntil: input.validUntil,
      approvedDate: null,
      currency: input.currency,
    }, { apiKeyId });
    return { ...created, provenance: { createdVia: 'api', createdByApiKeyId: apiKeyId } };
  }

  async function updateEstimateDraft(id: string, patch: DraftPatch): Promise<EstimateRecord> {
    requireCapability(context, 'estimates.manage', 'edit estimates');
    const current = await estimates.getRecord(id);
    if (!current) throw new DocumentStateError('NOT_FOUND', 'No such estimate.');
    if (current.status !== 'Draft') {
      throw new DocumentStateError('NOT_DRAFT', 'Only a draft estimate can be edited.', { status: current.status });
    }
    if (patch.lines && current.lines.some(l => lineHasCostData(l as unknown as Record<string, unknown>))) {
      throw new DocumentStateError('LINES_HAVE_COST_DATA',
        'This draft has cost or margin data on its lines. Edit its lines in Redlined1.');
    }

    const payload = estimateUpdatePayload({
      ...(patch.customerId !== undefined ? { customerId: patch.customerId } : {}),
      ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
      ...(patch.vehicle !== undefined ? { vehicle: patch.vehicle } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.lines !== undefined ? { lines: cleanLines(patch.lines) } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil } : {}),
    });

    const { data, error } = await db
      .from('estimates')
      .update(payload)
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .eq('status', 'Draft')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    // Someone changed its status between the read and the write.
    if (!data) throw new DocumentStateError('NOT_DRAFT', 'Only a draft estimate can be edited.');

    await auditEstimate(db, context, {
      action: AUDIT.estimateUpdated,
      entityType: 'estimate',
      entityId: id,
      before: { status: current.status, lines: current.lines, notes: current.notes, currency: current.currency },
      after: payload,
    });
    return toEstimateRecord(data as Record<string, unknown>);
  }

  async function convertEstimate(id: string): Promise<{ estimate: EstimateRecord; invoice: InvoiceRecord }> {
    requireCapability(context, 'estimates.manage', 'convert estimates');
    requireCapability(context, 'invoices.manage', 'raise invoices');

    const est = await estimates.getRecord(id);
    if (!est) throw new DocumentStateError('NOT_FOUND', 'No such estimate.');
    if (est.status === 'Converted') {
      throw new DocumentStateError('ALREADY_CONVERTED', 'That estimate has already been converted to an invoice.',
        { invoice_number: await invoiceFor(id) });
    }
    if (est.status !== 'Approved') {
      throw new DocumentStateError('NOT_APPROVED', 'Only an approved estimate can be converted.', { status: est.status });
    }

    const number = await allocateDocumentNumberForApi(db, context.shopId, 'invoice');
    let created;
    try {
      // The same fields the staff screen copies (EstimatesView
      // handleConvertToInvoice), including the lines as stored: cost and
      // markup carry over to the invoice, unread by the key.
      created = await invoices.create({
        invoiceNumber: number,
        customerName: est.customerName,
        customerId: est.customerId,
        vehicle: est.vehicle,
        jobCardId: est.jobCardId,
        status: 'Draft',
        lines: est.lines,
        discount: est.discount,
        shopSupplies: est.shopSupplies,
        taxRate: est.taxRate,
        notes: `Converted from ${est.estimateNumber}. ${est.notes}`.trim(),
        dueDate: '',
        paidDate: null,
        currency: est.currency,
      }, { apiKeyId, sourceEstimateId: id });
    } catch (err) {
      if (err instanceof DocumentStateError && err.reason === 'ALREADY_CONVERTED') {
        // Lost a race with another convert. Its invoice stands; say which.
        throw new DocumentStateError('ALREADY_CONVERTED', err.message, { invoice_number: await invoiceFor(id) });
      }
      throw err;
    }

    // Only if still Approved, so a person who changed it meanwhile wins.
    const { data: marked, error } = await db
      .from('estimates')
      .update({ status: 'Converted' })
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .eq('status', 'Approved')
      .select('*')
      .maybeSingle();
    if (error) throw error;

    await auditEstimate(db, context, {
      action: AUDIT.estimateUpdated,
      entityType: 'estimate',
      entityId: id,
      before: { status: 'Approved' },
      after: { status: 'Converted' },
      metadata: { operation: 'convert_to_invoice', invoice_number: created.invoiceNumber },
    });

    const estimate = marked
      ? toEstimateRecord(marked as Record<string, unknown>)
      : (await estimates.getRecord(id)) ?? est;
    return {
      estimate,
      invoice: { ...created, provenance: { createdVia: 'api', createdByApiKeyId: apiKeyId }, sourceEstimateId: id },
    };
  }

  async function invoiceFor(estimateId: string): Promise<string | null> {
    const { data } = await db
      .from('invoices')
      .select('number')
      .eq('source_estimate_id', estimateId)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    return (data?.number as string | undefined) ?? null;
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async function createInvoiceDraft(input: InvoiceDraftInput): Promise<InvoiceRecord> {
    requireCapability(context, 'invoices.manage', 'raise invoices');
    const number = await allocateDocumentNumberForApi(db, context.shopId, 'invoice');
    const created = await invoices.create({
      invoiceNumber: number,
      customerName: input.customerName,
      customerId: input.customerId,
      vehicle: input.vehicle,
      jobCardId: '',
      status: 'Draft',
      lines: cleanLines(input.lines),
      discount: 0,
      shopSupplies: 0,
      taxRate: input.taxRate,
      notes: input.notes,
      dueDate: input.dueDate,
      paidDate: null,
      currency: input.currency,
    }, { apiKeyId });
    return { ...created, provenance: { createdVia: 'api', createdByApiKeyId: apiKeyId }, sourceEstimateId: null };
  }

  async function updateInvoiceDraft(invoiceNumber: string, patch: DraftPatch): Promise<InvoiceRecord> {
    requireCapability(context, 'invoices.manage', 'edit invoices');
    const current = await invoices.getRecord(invoiceNumber);
    if (!current) throw new DocumentStateError('NOT_FOUND', 'No such invoice.');
    if (current.status !== 'Draft') {
      throw new DocumentStateError('NOT_DRAFT', 'Only a draft invoice can be edited.', { status: current.status });
    }
    if (patch.lines && current.lines.some(l => lineHasCostData(l as unknown as Record<string, unknown>))) {
      throw new DocumentStateError('LINES_HAVE_COST_DATA',
        'This draft has cost or margin data on its lines. Edit its lines in Redlined1.');
    }

    const payload: Record<string, unknown> = {};
    if (patch.customerId !== undefined) payload.customer_id = patch.customerId || null;
    if (patch.customerName !== undefined) payload.customer = patch.customerName;
    if (patch.vehicle !== undefined) payload.vehicle = patch.vehicle;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.lines !== undefined) payload.lines = cleanLines(patch.lines);
    if (patch.notes !== undefined) payload.notes = patch.notes;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate || null;

    const { data, error } = await db
      .from('invoices')
      .update(payload)
      .eq('number', invoiceNumber)
      .in('shop_id', context.shopIds)
      .eq('status', 'Draft')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new DocumentStateError('NOT_DRAFT', 'Only a draft invoice can be edited.');

    // Money domain: the audit row is required, as for every invoice write.
    await writeAuditEvent(db, context, {
      action: AUDIT.invoiceUpdated,
      entityType: 'invoice',
      entityId: invoiceNumber,
      before: { status: current.status, lines: current.lines, notes: current.notes, currency: current.currency, dueDate: current.dueDate },
      after: payload,
    });
    return toInvoiceRecord(data as Record<string, unknown>);
  }

  return { createEstimateDraft, updateEstimateDraft, convertEstimate, createInvoiceDraft, updateInvoiceDraft };
}

export type DocumentDraftDomain = ReturnType<typeof createDocumentDraftDomain>;
