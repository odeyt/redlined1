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
  // shopId from header (client sends x-shop-id), fallback to cookie
  const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? cookieStore.get('activeShopId')?.value ?? '';
  const { data: suRow } = await supabase
    .from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

// GET — calculate live metrics for this shop (always fresh, no caching required)
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const { calculateShopMetrics, saveShopMetrics, getLatestShopMetrics } = await import('@/intelligence/metrics/MetricsBuilder');

    // Try saved row first (fast path)
    const saved = await getLatestShopMetrics(ctx.shopId);
    const today = new Date().toISOString().split('T')[0];
    if (saved && saved.metricDate === today) {
      return NextResponse.json({ metrics: saved, source: 'cache' });
    }

    // No saved row for today — calculate live
    console.log('[metrics] shopId:', ctx.shopId, 'calculating live');
    const result = await calculateShopMetrics(ctx.shopId);
    if (result.warnings.length > 0) {
      console.warn('[metrics] warnings:', result.warnings);
    }
    if (result.errors.length > 0) {
      console.error('[metrics] errors:', result.errors);
    }
    void saveShopMetrics(result.metrics); // fire-and-forget save
    return NextResponse.json({ metrics: result.metrics, warnings: result.warnings, source: 'live' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — force recalculate metrics now
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const { calculateShopMetrics, saveShopMetrics } = await import('@/intelligence/metrics/MetricsBuilder');
    const result = await calculateShopMetrics(ctx.shopId);
    await saveShopMetrics(result.metrics);

    return NextResponse.json({
      metrics: result.metrics,
      warnings: result.warnings,
      durationMs: result.durationMs,
      source: 'recalculated',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
