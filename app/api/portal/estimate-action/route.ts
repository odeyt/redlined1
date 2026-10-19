/**
 * POST /api/portal/estimate-action — a customer approves or declines an
 * estimate from their portal link. Public: the portal token is the credential.
 *
 * The rules (token → customer + shop → their estimate → still awaiting an
 * answer) live in lib/portal/estimateAction.ts. This file only connects them
 * to the database with the service-role client, which bypasses RLS — so every
 * query below is scoped by what that module has already verified.
 *
 * No rate limiter: the only one in the codebase (api_rate_limit_hit) is keyed
 * to API keys. A 244-bit token is not guessable, and an unknown token costs one
 * indexed lookup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';
import { applyEstimateAction, type EstimateActionStore } from '@/lib/portal/estimateAction';
import { resolvePortalCustomer, logPortalLookupError, PortalLookupError } from '@/lib/portal/portalToken';
import { portalShopScope } from '@/lib/portal/portalScope';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};

function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function storeFor(): EstimateActionStore {
  // Created on first use, so a malformed request is answered (400/404)
  // without touching the database at all.
  let client: ReturnType<typeof getAdminDb> | null = null;
  const db = () => (client ??= getAdminDb());
  return {
    findCustomerByToken: token => resolvePortalCustomer(db(), token),
    findScope: customer => portalShopScope(db(), customer.shopId),
    async findEstimate(id) {
      const { data, error } = await db()
        .from('estimates')
        .select('id, shop_id, customer_id, status, estimate_number')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new PortalLookupError('estimate', error.code, error.message);
      if (!data) return null;
      return {
        id: data.id as string,
        shopId: data.shop_id as string,
        customerId: (data.customer_id as string | null) ?? null,
        status: (data.status as string) || '',
        estimateNumber: (data.estimate_number as string) || '',
      };
    },
    async updateIfStatus({ id, customerId, shopId }, fromStatuses, patch) {
      const { error, count } = await db()
        .from('estimates')
        .update(patch, { count: 'exact' })
        .eq('id', id)
        .eq('customer_id', customerId)
        .eq('shop_id', shopId)
        .in('status', [...fromStatuses]);
      if (error) throw new PortalLookupError('update', error.code, error.message);
      return count ?? 0;
    },
    async audit({ shopId, action, estimateId, before, after }) {
      // No session: record_audit_event lets the service role through and
      // stamps no user. 'system' is the closest allowed actor type; the role
      // and metadata say it was the customer, through the portal.
      const { error } = await db().rpc('record_audit_event', {
        p_shop_id: shopId,
        p_actor_type: 'system',
        p_actor_role: 'customer',
        p_action: action,
        p_entity_type: 'estimate',
        p_entity_id: estimateId,
        p_before: before,
        p_after: after,
        p_metadata: { source: 'customer_portal' },
        p_request_id: null,
      });
      if (error) throw error;
    },
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }
  try {
    const result = await applyEstimateAction(storeFor(), body);
    return reply(result.body, result.status);
  } catch (e) {
    logPortalLookupError('portal estimate-action', e);
    return reply({ error: 'Something went wrong. Please contact the shop.' }, 500);
  }
}
