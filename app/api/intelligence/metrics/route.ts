import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getAuthCtx(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';
  const { data: suRow } = await supabase
    .from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data, error } = await db
      .from('feature_flags').select('enabled').eq('flag_key', flagKey).maybeSingle();
    if (error) return true;
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return true; }
}

// GET — latest metrics for this shop
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const enabled = await isFlagEnabled('live_intelligence_pipeline');
    if (!enabled) return NextResponse.json({ disabled: true, metrics: null }, { status: 200 });

    const { getLatestShopMetrics } = await import('@/intelligence/metrics/MetricsBuilder');
    const metrics = await getLatestShopMetrics(ctx.shopId);
    return NextResponse.json({ metrics });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST — recalculate metrics now and return result (owner/manager only)
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const enabled = await isFlagEnabled('live_intelligence_pipeline');
    if (!enabled) return NextResponse.json({ disabled: true, metrics: null }, { status: 200 });

    const { calculateShopMetrics, saveShopMetrics } = await import('@/intelligence/metrics/MetricsBuilder');
    const result = await calculateShopMetrics(ctx.shopId);
    await saveShopMetrics(result.metrics);

    return NextResponse.json({
      metrics: result.metrics,
      warnings: result.warnings,
      durationMs: result.durationMs,
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
