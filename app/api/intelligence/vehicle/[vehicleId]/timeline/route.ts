// SI-10: Vehicle Intelligence Timeline API
// GET /api/intelligence/vehicle/[vehicleId]/timeline

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type RouteContext = { params: Promise<{ vehicleId: string }> };

async function getAuth() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { vehicleId } = await context.params;
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    const { data: flagRow } = await db
      .from('feature_flags').select('enabled')
      .eq('flag_key', 'vehicle_intelligence_engine').maybeSingle();
    if (!(flagRow as Record<string, unknown> | null)?.enabled) {
      return NextResponse.json({ disabled: true, events: [] });
    }

    const { data: shopRow } = await authClient
      .from('shop_users').select('shop_id').eq('user_id', user.id).limit(1).maybeSingle();
    const shopId = (shopRow as { shop_id: string } | null)?.shop_id;
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const { data } = await db
      .from('vehicle_intelligence_events')
      .select('id, event_type, summary, event_date, source_type, source_id, metadata')
      .eq('shop_id', shopId)
      .eq('vehicle_id', vehicleId)
      .order('event_date', { ascending: false })
      .limit(50);

    return NextResponse.json({ events: data ?? [] });
  } catch (e) {
    console.error('[vehicle-intelligence-timeline GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
