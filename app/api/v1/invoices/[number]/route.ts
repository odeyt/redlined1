/**
 * GET /api/v1/invoices/:number
 *
 * Invoices are keyed by number (INV-0042); the table has no id. Another
 * shop's invoice is 404, as for customers.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import { createPaymentDomain } from '@/lib/domain/payments';
import { presentInvoice } from '@/lib/api/documents';

export const GET = withApi(
  { scopes: ['invoices:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const raw = new URL(ctx.request.url).pathname.split('/').filter(Boolean).pop() ?? '';
    let number: string;
    try {
      number = decodeURIComponent(raw).trim();
    } catch {
      throw new ApiError('NOT_FOUND');
    }
    if (!number || number.length > 64) throw new ApiError('NOT_FOUND');

    const deps = { db: ctx.db, context: ctx.domain };
    const invoice = await createInvoiceDomain(deps).getRecord(number);
    if (!invoice) throw new ApiError('NOT_FOUND');

    const entries = await createPaymentDomain(deps).listForInvoices([invoice.invoiceNumber]);
    return apiSuccess(presentInvoice(invoice, entries), ctx.requestId);
  },
);
