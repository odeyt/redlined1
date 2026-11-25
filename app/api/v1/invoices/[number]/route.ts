/**
 * GET   /api/v1/invoices/:number
 * PATCH /api/v1/invoices/:number: edit a DRAFT invoice
 *
 * Invoices are keyed by number (INV-0042); the table has no id. Another
 * shop's invoice is 404, as for customers.
 *
 * PATCH on anything but a Draft is 409 CONFLICT: once an invoice is sent it
 * belongs to the customer's record, and only a person changes it.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import { createPaymentDomain } from '@/lib/domain/payments';
import { createDocumentDraftDomain } from '@/lib/domain/documentDrafts';
import { presentInvoice } from '@/lib/api/documents';
import { invoicePatchBody, readBody, toDraftPatch, toApiError } from '@/lib/api/writes';

function numberFrom(request: Request): string {
  const raw = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  let number: string;
  try {
    number = decodeURIComponent(raw).trim();
  } catch {
    throw new ApiError('NOT_FOUND');
  }
  if (!number || number.length > 64) throw new ApiError('NOT_FOUND');
  return number;
}

export const GET = withApi(
  { scopes: ['invoices:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const deps = { db: ctx.db, context: ctx.domain };
    const invoice = await createInvoiceDomain(deps).getRecord(numberFrom(ctx.request));
    if (!invoice) throw new ApiError('NOT_FOUND');

    const entries = await createPaymentDomain(deps).listForInvoices([invoice.invoiceNumber]);
    return apiSuccess(presentInvoice(invoice, entries), ctx.requestId);
  },
);

export const PATCH = withApi(
  { scopes: ['invoices:write'], requiresWriteShop: true, flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const number = numberFrom(ctx.request);
    const body = await readBody(ctx.request, invoicePatchBody);
    const deps = { db: ctx.db, context: ctx.domain };

    let currentCustomerId = '';
    if (body.vehicle_id !== undefined && body.customer_id === undefined) {
      const current = await createInvoiceDomain(deps).getRecord(number);
      if (!current) throw new ApiError('NOT_FOUND');
      currentCustomerId = current.customerId;
    }

    try {
      const patch = await toDraftPatch(ctx, body, currentCustomerId);
      const updated = await createDocumentDraftDomain(deps).updateInvoiceDraft(number, patch);
      const entries = await createPaymentDomain(deps).listForInvoices([updated.invoiceNumber]);
      return apiSuccess(presentInvoice(updated, entries), ctx.requestId);
    } catch (err) {
      throw toApiError(err);
    }
  },
);
