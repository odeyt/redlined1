/**
 * GET /api/v1/estimates/:id/pdf: the estimate as a PDF.
 *
 * The same layout the shop emails. A Draft is stamped DRAFT. Nothing is
 * sent: the bytes come back to the caller only. Needs estimates:read AND
 * pdf:read. Another shop's estimate is 404.
 */
import { withApi, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createEstimateDomain } from '@/lib/domain/estimates';
import { buildPdf } from '@/lib/documents/pdf';
import { isUuid } from '@/lib/api/documents';
import { estimatePdfInput, shopHeader, trialWatermark, pdfFilename, pdfResponse } from '@/lib/api/pdf';

export const GET = withApi(
  { scopes: ['estimates:read', 'pdf:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const segments = new URL(ctx.request.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 2] ?? '';
    if (!isUuid(id)) throw new ApiError('NOT_FOUND');

    const estimate = await createEstimateDomain({ db: ctx.db, context: ctx.domain }).getRecord(id);
    if (!estimate) throw new ApiError('NOT_FOUND');

    // The estimate's own shop, which is one of the key's (getRecord scoped it).
    const shopId = estimate.shopId ?? ctx.domain.shopId;
    const [header, watermark] = await Promise.all([shopHeader(ctx, shopId), trialWatermark(ctx, shopId)]);

    const bytes = await buildPdf(estimatePdfInput(estimate, header, watermark));
    return pdfResponse(bytes, pdfFilename(estimate.estimateNumber, estimate.status === 'Draft'), ctx.requestId);
  },
);
