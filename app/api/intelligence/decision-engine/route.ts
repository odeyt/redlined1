// SI-6: POST /api/intelligence/decision-engine
// Triggers full decision scoring for all open recommendations.
// Returns scored + ranked list. Auth required. Owner/manager only.

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

// GET — return scored recommendations (all, not just top 5)
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('decision_engine');
    if (!enabled) return NextResponse.json({ disabled: true, rankings: [] });

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    const { data: recs } = await db.from('recommendations')
      .select('*').eq('shop_id', ctx.shopId).eq('status', 'open');

    const { data: metricsRow } = await db.from('shop_intelligence_metrics')
      .select('*').eq('shop_id', ctx.shopId)
      .order('metric_date', { ascending: false }).limit(1).maybeSingle();

    let signals: Record<string, number | string | null> = {};
    if (metricsRow) {
      const { extractSignalsFromMetrics } = await import('@/intelligence/signals/SignalExtractor');
      const { mapMetricsRow } = await import('@/intelligence/metrics/MetricsBuilder');
      signals = extractSignalsFromMetrics(mapMetricsRow(metricsRow as Record<string, unknown>));
    }

    const { rankRecommendations } = await import('@/intelligence/decision/DecisionEngine');
    const { mapRowToRecommendation } = await import('@/intelligence/recommendations/RecommendationEngine');

    const recommendations = (recs ?? []).map(mapRowToRecommendation);
    const rankings = rankRecommendations(recommendations, signals, recommendations.length);

    return NextResponse.json({ rankings, total: rankings.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error', rankings: [] }, { status: 500 });
  }
}

// POST — score all + save history entry for a specific action taken
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('decision_engine');
    if (!enabled) return NextResponse.json({ disabled: true });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    // Optional: record that an action was taken on a specific ranked recommendation
    if (body.recommendationId && body.actionTaken) {
      const { saveDecisionHistory } = await import('@/intelligence/decision/DecisionEngine');
      void saveDecisionHistory(
        ctx.shopId,
        body.recommendationId as string,
        body.recommendationKey as string ?? '',
        Number(body.decisionScore ?? 0),
        Number(body.rank ?? 0),
        body.actionTaken as string,
        typeof body.revenueRealized === 'number' ? body.revenueRealized : undefined,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
