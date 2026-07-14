export const dynamic = 'force-dynamic'
// SI-6: GET /api/intelligence/executive-score
// Returns the Executive Score (0–100) and breakdown.
// Auth required. Owner/manager only. Feature-flagged.

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
  const { data: suRow } = await supabase.from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { data, error } = await getAdminDb().from('feature_flags')
      .select('enabled').eq('flag_key', flagKey).maybeSingle();
    if (error) return true;
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return true; }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('executive_dashboard');
    if (!enabled) return NextResponse.json({ disabled: true, score: null });

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    // Load latest signals from metrics
    const { data: metricsRow } = await db.from('shop_intelligence_metrics')
      .select('*').eq('shop_id', ctx.shopId)
      .order('metric_date', { ascending: false }).limit(1).maybeSingle();

    let signals: Record<string, number | string | null> = {};
    if (metricsRow) {
      const { extractSignalsFromMetrics } = await import('@/intelligence/signals/SignalExtractor');
      const { mapMetricsRow } = await import('@/intelligence/metrics/MetricsBuilder');
      signals = extractSignalsFromMetrics(mapMetricsRow(metricsRow as Record<string, unknown>));
    }

    const { calculateExecutiveScore } = await import('@/intelligence/decision/DecisionEngine');
    const score = calculateExecutiveScore(signals);

    return NextResponse.json({ score, calculatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error', score: null }, { status: 500 });
  }
}
