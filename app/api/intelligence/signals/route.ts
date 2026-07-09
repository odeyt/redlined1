import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { extractSignals, extractSignalsFromMetrics } from '@/intelligence/signals/SignalExtractor';

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

// GET — current shop signals (owner/manager only)
// Prefers pre-computed metrics from SI-4 pipeline when available.
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    // Try metrics-based signals first (SI-4 pipeline)
    try {
      const { getLatestShopMetrics } = await import('@/intelligence/metrics/MetricsBuilder');
      const metrics = await getLatestShopMetrics(ctx.shopId);
      if (metrics) {
        const signals = extractSignalsFromMetrics(metrics);
        return NextResponse.json({ signals, source: 'metrics' });
      }
    } catch { /* fall through to raw extraction */ }

    // Fallback: raw signal extraction from individual tables
    const signals = await extractSignals(ctx.shopId);
    return NextResponse.json({ signals, source: 'raw' });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
