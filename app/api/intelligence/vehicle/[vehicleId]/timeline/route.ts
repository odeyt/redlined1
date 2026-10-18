export const dynamic = 'force-dynamic';
// SI-10: Vehicle Intelligence Timeline API
// GET /api/intelligence/vehicle/[vehicleId]/timeline

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import { onePerKey } from '@/lib/shops/onePerKey';

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

    const shopId = (await resolveRequestShop(authClient, user.id, _req.headers.get('x-shop-id')))?.shop_id;
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const { data } = await db
      .from('vehicle_intelligence_events')
      .select('id, shop_id, event_type, summary, event_date, source_type, source_id, metadata')
      // A merged (closed) location's events stay under its id; read both.
      .in('shop_id', await mergedShopScope(db, shopId))
      .eq('vehicle_id', vehicleId)
      .order('event_date', { ascending: false })
      .limit(50);

    // The same source record can have an event under each shop once the
    // vehicle is recomputed here; keep one, this shop's first.
    const events = onePerKey(
      (data ?? []) as Array<{ shop_id?: string; event_type?: string; source_type?: string; source_id?: string; id?: string }>,
      e => e.source_id ? `${e.event_type}|${e.source_type}|${e.source_id}` : `id|${e.id}`,
      shopId,
    ).map(({ shop_id: _s, ...e }) => e);

    return NextResponse.json({ events });
  } catch (e) {
    console.error('[vehicle-intelligence-timeline GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
