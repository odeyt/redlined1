export const dynamic = 'force-dynamic'
// SI-10: Vehicle Intelligence Health Summary
// GET /api/intelligence/vehicle/health-summary
// Returns aggregate counts for Command Center — no PII, no VIN

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import { onePerKey } from '@/lib/shops/onePerKey';
import { healthStatusFromScore } from '@/intelligence/vehicle/VehicleIntelligenceEngine';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    // Check both flags
    const { data: flagRows } = await db
      .from('feature_flags')
      .select('flag_key, enabled')
      .in('flag_key', ['vehicle_intelligence_engine', 'vehicle_intelligence_command_center']);

    const flags = Object.fromEntries(
      ((flagRows ?? []) as Array<{ flag_key: string; enabled: boolean }>).map(r => [r.flag_key, r.enabled]),
    );

    if (!flags.vehicle_intelligence_engine || !flags.vehicle_intelligence_command_center) {
      return NextResponse.json({ disabled: true });
    }

    const shopId = (await resolveRequestShop(authClient, user.id, req.headers.get('x-shop-id')))?.shop_id;
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    // Profiles store health_score only; there is no health_status column, and
    // selecting it made this query fail, which the route used to swallow and
    // report as zero profiled vehicles.
    const { data: profiles, error: profilesError } = await db
      .from('vehicle_intelligence_profiles')
      .select('shop_id, vehicle_id, health_score, intelligence_status')
      // A merged (closed) location's vehicles keep their profiles under its id
      // until recomputed here; read both, one profile per vehicle, this shop's first.
      .in('shop_id', await mergedShopScope(db, shopId));
    if (profilesError) {
      // An error, not a count of zero: the Command Center hides the tile on a
      // failed request rather than claiming no vehicle needs attention.
      console.error('[vehicle-health-summary GET] profiles', profilesError.message);
      return NextResponse.json({ error: 'Could not read vehicle profiles' }, { status: 500 });
    }

    const rows = onePerKey(
      (profiles ?? []) as Array<{ shop_id?: string; vehicle_id?: string; health_score?: number | null; intelligence_status?: string }>,
      r => String(r.vehicle_id ?? ''),
      shopId,
    );
    const statuses = rows.map(r => (r.health_score == null ? 'unknown' : healthStatusFromScore(Number(r.health_score))));
    const highRiskCount = statuses.filter(s => s === 'high_risk').length;
    const attentionCount = statuses.filter(s => s === 'attention').length;
    const totalProfiled = rows.length;

    return NextResponse.json({ highRiskCount, attentionCount, totalProfiled });
  } catch (e) {
    console.error('[vehicle-health-summary GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
