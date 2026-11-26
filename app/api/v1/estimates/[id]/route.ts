/**
 * GET   /api/v1/estimates/:id
 * PATCH /api/v1/estimates/:id: edit a DRAFT estimate
 *
 * Another shop's estimate is 404, not 403, as for customers: a 403 would
 * confirm the id exists. A malformed id is also 404, without a query.
 *
 * PATCH on anything but a Draft is 409 CONFLICT. So is replacing the lines of
 * a draft whose lines carry the shop's cost or markup, which a key cannot see.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createEstimateDomain } from '@/lib/domain/estimates';
import { createDocumentDraftDomain } from '@/lib/domain/documentDrafts';
import { isUuid, presentEstimate } from '@/lib/api/documents';
import { estimatePatchBody, readBody, toDraftPatch, toApiError } from '@/lib/api/writes';

function idFrom(request: Request): string {
  const id = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!isUuid(id)) throw new ApiError('NOT_FOUND');
  return id;
}

export const GET = withApi(
  { scopes: ['estimates:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const estimate = await createEstimateDomain({ db: ctx.db, context: ctx.domain }).getRecord(idFrom(ctx.request));
    if (!estimate) throw new ApiError('NOT_FOUND');
    return apiSuccess(presentEstimate(estimate), ctx.requestId);
  },
);

export const PATCH = withApi(
  { scopes: ['estimates:write'], requiresWriteShop: true, flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const id = idFrom(ctx.request);
    const body = await readBody(ctx.request, estimatePatchBody);
    const deps = { db: ctx.db, context: ctx.domain };

    // A vehicle is checked against the customer it is for; with no
    // customer_id in the body, that is the draft's current one.
    let currentCustomerId = '';
    if (body.vehicle_id !== undefined && body.customer_id === undefined) {
      const current = await createEstimateDomain(deps).getRecord(id);
      if (!current) throw new ApiError('NOT_FOUND');
      currentCustomerId = current.customerId;
    }

    try {
      const patch = await toDraftPatch(ctx, body, currentCustomerId);
      const updated = await createDocumentDraftDomain(deps).updateEstimateDraft(id, patch);
      return apiSuccess(presentEstimate(updated), ctx.requestId);
    } catch (err) {
      throw toApiError(err);
    }
  },
);
