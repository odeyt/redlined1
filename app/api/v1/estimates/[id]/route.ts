/**
 * GET /api/v1/estimates/:id
 *
 * Another shop's estimate is 404, not 403, as for customers: a 403 would
 * confirm the id exists. A malformed id is also 404, without a query.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createEstimateDomain } from '@/lib/domain/estimates';
import { isUuid, presentEstimate } from '@/lib/api/documents';

export const GET = withApi(
  { scopes: ['estimates:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const id = new URL(ctx.request.url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!isUuid(id)) throw new ApiError('NOT_FOUND');

    const estimate = await createEstimateDomain({ db: ctx.db, context: ctx.domain }).getRecord(id);
    if (!estimate) throw new ApiError('NOT_FOUND');

    return apiSuccess(presentEstimate(estimate), ctx.requestId);
  },
);
