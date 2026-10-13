/**
 * POST /api/portal/estimate-action — a customer approves or declines an
 * estimate from their portal link. Public: the portal token is the credential.
 *
 * The rules (token → customer → their estimate → still awaiting an answer)
 * live in lib/portal/estimateAction.ts. This file only connects them to the
 * database with the service-role client, which bypasses RLS — so every query
 * below is scoped by what that module has already verified.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';
import { applyEstimateAction, type EstimateActionStore } from '@/lib/portal/estimateAction';

function storeFor(): EstimateActionStore {
  const db = getAdminDb();
  return {
    async findCustomerIdByToken(token) {
      const { data } = await db.from('customers').select('id').eq('portal_token', token).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
    async findEstimate(id) {
      const { data } = await db
        .from('estimates')
        .select('id, shop_id, customer_id, status, estimate_number')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id as string,
        shopId: data.shop_id as string,
        customerId: (data.customer_id as string | null) ?? null,
        status: (data.status as string) || '',
        estimateNumber: (data.estimate_number as string) || '',
      };
    },
    async updateIfStatus(id, fromStatuses, patch) {
      const { error, count } = await db
        .from('estimates')
        .update(patch, { count: 'exact' })
        .eq('id', id)
        .in('status', [...fromStatuses]);
      if (error) throw error;
      return count ?? 0;
    },
    async audit({ shopId, action, estimateId, before, after }) {
      // No session: record_audit_event lets the service role through and
      // stamps no user. 'system' is the closest allowed actor type; the role
      // and metadata say it was the customer, through the portal.
      const { error } = await db.rpc('record_audit_event', {
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
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  try {
    const result = await applyEstimateAction(storeFor(), body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error('[portal estimate-action]', e);
    return NextResponse.json({ error: 'Something went wrong. Please contact the shop.' }, { status: 500 });
  }
}
