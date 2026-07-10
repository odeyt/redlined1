// SI-10: Vehicle Intelligence API
// GET  /api/intelligence/vehicle/[vehicleId]  — get or fetch profile
// POST /api/intelligence/vehicle/[vehicleId]  — refresh intelligence

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

async function getAdminDb() {
  const { getAdminDb: db } = await import('@/lib/supabaseServer');
  return db();
}

async function checkFlag(db: Awaited<ReturnType<typeof getAdminDb>>, key: string): Promise<boolean> {
  const { data } = await db.from('feature_flags').select('enabled').eq('flag_key', key).maybeSingle();
  return !!(data as Record<string, unknown> | null)?.enabled;
}

async function getShopIdForRequest(
  authClient: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await authClient
    .from('shop_users')
    .select('shop_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return (data as { shop_id: string } | null)?.shop_id ?? null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { vehicleId } = await context.params;
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getAdminDb();
    const [engineOn, panelOn] = await Promise.all([
      checkFlag(db, 'vehicle_intelligence_engine'),
      checkFlag(db, 'vehicle_intelligence_panel'),
    ]);
    if (!engineOn || !panelOn) {
      return NextResponse.json({ disabled: true, profile: null });
    }

    const shopId = await getShopIdForRequest(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const wantsSignals = req.nextUrl.searchParams.get('signals') === 'true';

    const { getVehicleIntelligence } = await import('@/intelligence/vehicle/VehicleIntelligenceEngine');
    const profile = await getVehicleIntelligence(shopId, vehicleId);

    if (wantsSignals) {
      const { data: signalRows } = await db
        .from('vehicle_intelligence_signals')
        .select('*')
        .eq('shop_id', shopId)
        .eq('vehicle_id', vehicleId)
        .eq('is_active', true)
        .order('confidence', { ascending: false });
      return NextResponse.json({ profile, signals: signalRows ?? [] });
    }

    return NextResponse.json({ profile });
  } catch (e) {
    console.error('[vehicle-intelligence GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { vehicleId } = await context.params;
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getAdminDb();
    if (!(await checkFlag(db, 'vehicle_intelligence_engine'))) {
      return NextResponse.json({ disabled: true });
    }

    const shopId = await getShopIdForRequest(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });

    const { refreshVehicleIntelligence } = await import('@/intelligence/vehicle/VehicleIntelligenceEngine');
    const result = await refreshVehicleIntelligence(shopId, vehicleId);

    return NextResponse.json(result);
  } catch (e) {
    console.error('[vehicle-intelligence POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
