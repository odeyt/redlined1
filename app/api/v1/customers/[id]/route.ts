/**
 * GET /api/v1/customers/:id
 *
 * A customer belonging to another tenant returns 404, not 403.
 *
 * 403 would confirm the record exists — an integration could walk ids and
 * learn how many customers a competitor has, and which ids are real. 404 for
 * both "no such customer" and "not yours" leaks nothing, at the cost of a
 * slightly less helpful message for a caller who genuinely mistyped an id.
 * That trade is the right way round.
 *
 * The domain's `get` already scopes by `context.shopIds`, so a foreign id
 * simply returns null — this route never has the other tenant's row in hand.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createCustomerDomain } from '@/lib/domain/customers';

export const GET = withApi({ scopes: ['customers:read'] }, async (ctx: ApiContext) => {
  const id = new URL(ctx.request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!id) throw new ApiError('NOT_FOUND');

  const customers = createCustomerDomain({ db: ctx.db, context: ctx.domain });
  const customer = await customers.get(id);
  if (!customer) throw new ApiError('NOT_FOUND');

  return apiSuccess({
    id: customer.id,
    name: customer.name,
    type: customer.type,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    tags: customer.tags,
    follow_up: customer.followUp,
    archived: Boolean(customer.archivedAt),
  }, ctx.requestId);
});
