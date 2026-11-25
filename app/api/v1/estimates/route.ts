/**
 * GET /api/v1/estimates: one page of this key's estimates, newest first.
 *
 * Filters: status, customer_id, created_since. Paging: page, page_size (max
 * 100). Read only; behind the api_v1_documents flag (404 while it is off).
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { createEstimateDomain } from '@/lib/domain/estimates';
import { ESTIMATE_STATUSES, parseDocumentListQuery, pageMeta, presentEstimate } from '@/lib/api/documents';

export const GET = withApi(
  { scopes: ['estimates:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const q = parseDocumentListQuery(new URL(ctx.request.url), ESTIMATE_STATUSES);
    // Scoped by context.shopIds, which came from the key.
    const { rows, total } = await createEstimateDomain({ db: ctx.db, context: ctx.domain }).listPage(q);
    return apiSuccess(rows.map(presentEstimate), ctx.requestId, pageMeta(q, total));
  },
);
