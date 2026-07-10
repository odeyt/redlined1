// SI-10: Vehicle Intelligence Health Summary
// GET /api/intelligence/vehicle/health-summary
// Returns aggregate counts for Command Center — no PII, no VIN

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
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

    const { data: shopRow } = await authClient
      .from('shop_users').select('shop_id').eq('user_id', user.id).limit(1).maybeSingle();
    const shopId = (shopRow as { shop_id: string } | null)?.shop_id;
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const { data: profiles } = await db
      .from('vehicle_intelligence_profiles')
      .select('health_status, intelligence_status')
      .eq('shop_id', shopId);

    const rows = (profiles ?? []) as Array<{ health_status?: string; intelligence_status?: string }>;
    const highRiskCount = rows.filter(r => r.health_status === 'high_risk').length;
    const attentionCount = rows.filter(r => r.health_status === 'attention').length;
    const totalProfiled = rows.length;

    return NextResponse.json({ highRiskCount, attentionCount, totalProfiled });
  } catch (e) {
    console.error('[vehicle-health-summary GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
