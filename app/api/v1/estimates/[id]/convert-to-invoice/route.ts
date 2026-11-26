/**
 * POST /api/v1/estimates/:id/convert-to-invoice
 *
 * Turns an APPROVED estimate into a DRAFT invoice and marks the estimate
 * Converted. Stricter than the staff screen, which converts any estimate not
 * yet converted (owner decision Q5): approval is the customer's yes, and a
 * bot should not bill work nobody agreed to.
 *
 * Needs estimates:write AND invoices:write, and an Idempotency-Key. Converting
 * twice returns 409 with the invoice the first conversion made; the database's
 * unique index on invoices.source_estimate_id settles a race.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createDocumentDraftDomain } from '@/lib/domain/documentDrafts';
import { isUuid, presentEstimate, presentInvoice } from '@/lib/api/documents';
import { onceForIdempotencyKey } from '@/lib/api/writes';

export const POST = withApi(
  { scopes: ['estimates:write', 'invoices:write'], requiresWriteShop: true, flag: 'api_v1_documents' },
  async (ctx: ApiContext) => {
    const segments = new URL(ctx.request.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.length - 2] ?? '';
    if (!isUuid(id)) throw new ApiError('NOT_FOUND');

    // The estimate id is part of the hashed input, so one Idempotency-Key
    // reused for a different estimate is IDEMPOTENCY_CONFLICT, not a replay.
    const result = await onceForIdempotencyKey(ctx, 'POST /api/v1/estimates/{id}/convert-to-invoice', { id }, async () => {
      const { estimate, invoice } = await createDocumentDraftDomain({ db: ctx.db, context: ctx.domain }).convertEstimate(id);
      return { status: 201, body: { estimate: presentEstimate(estimate), invoice: presentInvoice(invoice, []) } };
    });

    return apiSuccess(result.body, ctx.requestId, result.replay ? { idempotent_replay: true } : undefined, result.status);
  },
);
