/**
 * GET  /api/v1/invoices: one page of this key's invoices, newest first.
 * POST /api/v1/invoices: create a DRAFT invoice (Idempotency-Key required).
 *
 * Filters: status, customer_id, created_since. Paging: page, page_size (max
 * 100). Each invoice carries amount_paid and balance_due, netted from the
 * payments ledger by the receivables rule. Behind api_v1_documents.
 *
 * POST is always Draft, with the shop's default tax rate and no discount; a
 * Draft is not issued to anyone. No plan cap applies, as in the staff screens
 * (nothing in Redlined1 limits invoice count today).
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import { createPaymentDomain } from '@/lib/domain/payments';
import { createDocumentDraftDomain } from '@/lib/domain/documentDrafts';
import { INVOICE_STATUSES, parseDocumentListQuery, pageMeta, presentInvoice } from '@/lib/api/documents';
import {
  invoiceCreateBody, readBody, resolveParty, shopDraftDefaults, toDraftLines, onceForIdempotencyKey,
} from '@/lib/api/writes';

export const GET = withApi(
  { scopes: ['invoices:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const q = parseDocumentListQuery(new URL(ctx.request.url), INVOICE_STATUSES);
    const deps = { db: ctx.db, context: ctx.domain };

    const { rows, total } = await createInvoiceDomain(deps).listPage(q);
    // One query for the page's payments, not one per invoice.
    const entries = await createPaymentDomain(deps).listForInvoices(rows.map(r => r.invoiceNumber));

    return apiSuccess(rows.map(r => presentInvoice(r, entries)), ctx.requestId, pageMeta(q, total));
  },
);

export const POST = withApi(
  { scopes: ['invoices:write'], requiresWriteShop: true, flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const body = await readBody(ctx.request, invoiceCreateBody);

    const result = await onceForIdempotencyKey(ctx, 'POST /api/v1/invoices', body, async () => {
      const party = await resolveParty(ctx, body.customer_id, body.vehicle_id);
      const defaults = await shopDraftDefaults(ctx);
      const created = await createDocumentDraftDomain({ db: ctx.db, context: ctx.domain }).createInvoiceDraft({
        customerId: party.customerId,
        customerName: party.customerName,
        vehicle: party.vehicle ?? '',
        currency: body.currency ?? defaults.currency,
        lines: toDraftLines(body.lines),
        notes: body.notes ?? '',
        dueDate: body.due_date ?? '',
        taxRate: defaults.taxRate,
      });
      return { status: 201, body: presentInvoice(created, []) };
    });

    return apiSuccess(result.body, ctx.requestId, result.replay ? { idempotent_replay: true } : undefined, result.status);
  },
);
