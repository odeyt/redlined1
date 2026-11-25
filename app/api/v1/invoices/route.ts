/**
 * GET /api/v1/invoices: one page of this key's invoices, newest first.
 *
 * Filters: status, customer_id, created_since. Paging: page, page_size (max
 * 100). Each invoice carries amount_paid and balance_due, netted from the
 * payments ledger by the receivables rule. Read only; behind api_v1_documents.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import { createPaymentDomain } from '@/lib/domain/payments';
import { INVOICE_STATUSES, parseDocumentListQuery, pageMeta, presentInvoice } from '@/lib/api/documents';

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
