/**
 * GET /api/v1/me: which key this is, which shops it reaches, what it may do.
 *
 * The first call a bot makes, to confirm it was given the key it expects
 * (Wally Bot read-only, RedlineD1 CRM read/write) before it touches anything.
 * Never returns the secret, its hash or any other key.
 *
 * Any working key may call it, so it lists every scope and asks for one of
 * them. Behind api_v1_documents like the rest of the bot endpoints.
 */
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';

export const GET = withApi(
  {
    scopes: [
      'customers:read', 'customers:write', 'vehicles:read', 'vehicles:write',
      'appointments:read', 'appointments:write', 'estimates:read', 'invoices:read',
    ],
    scopeMode: 'any',
    flag: 'api_v1_documents',
  },
  async (ctx: ApiContext) => {
    const { principal } = ctx;

    // Names for the shops the KEY covers; the ids come from the principal,
    // never from the request.
    const { data, error } = await ctx.db
      .from('shops')
      .select('id, name')
      .in('id', principal.shopIds);
    if (error) throw new ApiError('INTERNAL_ERROR');
    const names = new Map<string, string>(
      ((data ?? []) as { id: string; name: string | null }[]).map(s => [s.id, s.name ?? '']),
    );

    return apiSuccess({
      key: { id: principal.keyId, name: principal.name },
      organization_id: principal.organizationId,
      shops: principal.shopIds.map(id => ({ id, name: names.get(id) ?? '' })),
      write_shop_id: principal.writeShopId,
      scopes: [...principal.scopes].sort(),
    }, ctx.requestId);
  },
);
