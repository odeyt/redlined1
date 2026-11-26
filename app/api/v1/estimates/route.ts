/**
 * GET  /api/v1/estimates: one page of this key's estimates, newest first.
 * POST /api/v1/estimates: create a DRAFT estimate (Idempotency-Key required).
 *
 * Filters: status, customer_id, created_since. Paging: page, page_size (max
 * 100). Behind the api_v1_documents flag (404 while it is off).
 *
 * POST takes a customer (and optionally a vehicle) by id, checked to belong
 * to this shop, plus lines. Status is always Draft; discount and tax rate are
 * the shop's defaults; totals are computed. A body that tries to set any of
 * them is refused (422), never silently ignored.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { createEstimateDomain } from '@/lib/domain/estimates';
import { createDocumentDraftDomain } from '@/lib/domain/documentDrafts';
import { ESTIMATE_STATUSES, parseDocumentListQuery, pageMeta, presentEstimate } from '@/lib/api/documents';
import {
  estimateCreateBody, readBody, resolveParty, shopDraftDefaults, toDraftLines, onceForIdempotencyKey,
} from '@/lib/api/writes';

export const GET = withApi(
  { scopes: ['estimates:read'], flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const q = parseDocumentListQuery(new URL(ctx.request.url), ESTIMATE_STATUSES);
    // Scoped by context.shopIds, which came from the key.
    const { rows, total } = await createEstimateDomain({ db: ctx.db, context: ctx.domain }).listPage(q);
    return apiSuccess(rows.map(presentEstimate), ctx.requestId, pageMeta(q, total));
  },
);

export const POST = withApi(
  { scopes: ['estimates:write'], requiresWriteShop: true, flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const body = await readBody(ctx.request, estimateCreateBody);

    const result = await onceForIdempotencyKey(ctx, 'POST /api/v1/estimates', body, async () => {
      const party = await resolveParty(ctx, body.customer_id, body.vehicle_id);
      const defaults = await shopDraftDefaults(ctx);
      const created = await createDocumentDraftDomain({ db: ctx.db, context: ctx.domain }).createEstimateDraft({
        customerId: party.customerId,
        customerName: party.customerName,
        vehicle: party.vehicle ?? '',
        currency: body.currency ?? defaults.currency,
        lines: toDraftLines(body.lines),
        notes: body.notes ?? '',
        validUntil: body.valid_until ?? '',
        taxRate: defaults.taxRate,
      });
      return { status: 201, body: presentEstimate(created) };
    });

    return apiSuccess(result.body, ctx.requestId, result.replay ? { idempotent_replay: true } : undefined, result.status);
  },
);
