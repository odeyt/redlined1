export const dynamic = 'force-dynamic';
// POST /api/estimates/draft-from-history
// Suggest estimate lines from the shop's own past estimates. No AI.
//
// Owner-approved 2026-11-27 ("Past jobs first, no AI"; any shop, via flag).
// Behind `estimate_drafting` (default OFF). Read-only: suggests, never saves.
// Reads the shop plus any location merged into it (mergedShopScope).
//
// Body: { vehicle: string, jobCardId?: string, workText?: string, excludeId?: string }

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import { isEnabled } from '@/lib/featureFlags/featureFlagService';
import { getFeatureFlagEnvironment } from '@/lib/environment';
import { draftFromHistory, type PastEstimate } from '@/lib/estimates/draftFromHistory';

const ESTIMATE_DRAFTING_FLAG = 'estimate_drafting';
/** Most recent past estimates considered. Plenty for a two-location shop. */
const HISTORY_LIMIT = 1500;
const MAX_TEXT = 2000;

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await resolveRequestShop(supabase, user.id, req.headers.get('x-shop-id'));
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const on = await isEnabled(ESTIMATE_DRAFTING_FLAG, {
      userId: user.id, shopId: membership.shop_id, role: membership.role, environment: getFeatureFlagEnvironment(),
    });
    if (!on) return NextResponse.json({ disabled: true });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const vehicle = str(body.vehicle, 200);
    const jobCardId = str(body.jobCardId, 100);
    let workText = str(body.workText);

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const scope = await mergedShopScope(db, membership.shop_id);

    // The work asked for: the linked job card's service type and notes.
    let jobVehicle = '';
    if (jobCardId) {
      const { data: job } = await db
        .from('job_cards')
        .select('service_type, notes, vehicle')
        .in('shop_id', scope)
        .eq('id', jobCardId)
        .maybeSingle();
      if (job) {
        const j = job as { service_type?: string | null; notes?: string | null; vehicle?: string | null };
        workText = [workText, j.service_type, j.notes].filter(Boolean).join(' ').slice(0, MAX_TEXT);
        jobVehicle = j.vehicle ?? '';
      }
    }

    const { data, error } = await db
      .from('estimates')
      .select('id, estimate_number, vehicle, status, created_at, currency, lines')
      .in('shop_id', scope)
      .neq('status', 'Void')
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) throw error;

    const result = draftFromHistory(
      { vehicle: vehicle || jobVehicle, workText, excludeId: str(body.excludeId, 100) || null },
      (data ?? []) as PastEstimate[],
    );
    return NextResponse.json({ ...result, considered: (data ?? []).length });
  } catch (e) {
    console.error('[estimate-draft]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not look up past estimates.' }, { status: 500 });
  }
}
