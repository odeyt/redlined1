/**
 * GET /api/v1/invoices/:number/pdf: the invoice as a PDF.
 *
 * The same layout the shop emails. A Draft is stamped DRAFT. Nothing is
 * sent: the bytes come back to the caller only. Needs invoices:read AND
 * pdf:read. Another shop's invoice is 404.
 */
import { withApi, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createInvoiceDomain } from '@/lib/domain/invoices';
import { buildPdf } from '@/lib/documents/pdf';
import { invoicePdfInput, shopHeader, trialWatermark, pdfFilename, pdfResponse } from '@/lib/api/pdf';

export const GET = withApi(
  { scopes: ['invoices:read', 'pdf:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const segments = new URL(ctx.request.url).pathname.split('/').filter(Boolean);
    let number: string;
    try {
      number = decodeURIComponent(segments[segments.length - 2] ?? '').trim();
    } catch {
      throw new ApiError('NOT_FOUND');
    }
    if (!number || number.length > 64) throw new ApiError('NOT_FOUND');

    const invoice = await createInvoiceDomain({ db: ctx.db, context: ctx.domain }).getRecord(number);
    if (!invoice) throw new ApiError('NOT_FOUND');

    const shopId = invoice.shopId ?? ctx.domain.shopId;
    const [header, watermark] = await Promise.all([shopHeader(ctx, shopId), trialWatermark(ctx, shopId)]);

    const bytes = await buildPdf(invoicePdfInput(invoice, header, watermark));
    return pdfResponse(bytes, pdfFilename(invoice.invoiceNumber, invoice.status === 'Draft'), ctx.requestId);
  },
);
