export const dynamic = 'force-dynamic'
// SI-6: GET /api/intelligence/action-queue
// Returns the ranked Top 5 action queue for the shop.
// Auth required. Owner/manager only. Technician blocked. Feature-flagged.

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
    if (error) return true; // fail-open
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return true; }
}

// GET — return cached or freshly computed action queue
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('action_queue');
    if (!enabled) return NextResponse.json({ disabled: true, actionQueue: null });

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    // Try cached ranking first (today's)
    const today = new Date().toISOString().split('T')[0];
    const { data: cached } = await db.from('decision_rankings')
      .select('*')
      .eq('shop_id', ctx.shopId)
      .eq('ranking_date', today)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        actionQueue: (cached as Record<string, unknown>).ranked_actions,
        executiveScore: (cached as Record<string, unknown>).executive_score,
        impact: {
          potentialRevenueToday: (cached as Record<string, unknown>).potential_revenue_today,
          potentialCashCollection: (cached as Record<string, unknown>).potential_cash_collection,
          potentialJobsClosed: (cached as Record<string, unknown>).potential_jobs_closed,
          potentialEstimatesConverted: (cached as Record<string, unknown>).potential_estimates_converted,
          potentialKnowledgeAdded: (cached as Record<string, unknown>).potential_knowledge_added,
        },
        source: 'cache',
        generatedAt: (cached as Record<string, unknown>).generated_at,
      });
    }

    // No cache — compute live
    const { data: recs } = await db.from('recommendations')
      .select('*').eq('shop_id', ctx.shopId).eq('status', 'open');

    const { data: sigRow } = await db.from('intelligence_signals')
      .select('signals').eq('shop_id', ctx.shopId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const signals = (sigRow as { signals?: Record<string, unknown> } | null)?.signals ?? {};

    const { buildActionQueue, calculateExecutiveScore, calculateTodaysImpact, saveDecisionRanking } =
      await import('@/intelligence/decision/DecisionEngine');
    const { mapRowToRecommendation } = await import('@/intelligence/recommendations/RecommendationEngine');

    const recommendations = (recs ?? []).map(mapRowToRecommendation);
    const queue = buildActionQueue(ctx.shopId, recommendations, signals as Record<string, number | string | null>);
    const execScore = calculateExecutiveScore(signals as Record<string, number | string | null>);
    const impact = calculateTodaysImpact(signals as Record<string, number | string | null>, queue.rankedActions);

    void saveDecisionRanking(ctx.shopId, queue, execScore, impact);

    return NextResponse.json({
      actionQueue: queue.rankedActions,
      executiveScore: execScore.overall,
      impact,
      source: 'live',
      generatedAt: queue.generatedAt,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error', actionQueue: null }, { status: 500 });
  }
}

// POST — force regenerate action queue
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const enabled = await isFlagEnabled('action_queue');
    if (!enabled) return NextResponse.json({ disabled: true, actionQueue: null });

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

    const { buildActionQueue, calculateExecutiveScore, calculateTodaysImpact, saveDecisionRanking } =
      await import('@/intelligence/decision/DecisionEngine');
    const { mapRowToRecommendation } = await import('@/intelligence/recommendations/RecommendationEngine');

    const recommendations = (recs ?? []).map(mapRowToRecommendation);
    const queue = buildActionQueue(ctx.shopId, recommendations, signals);
    const execScore = calculateExecutiveScore(signals);
    const impact = calculateTodaysImpact(signals, queue.rankedActions);

    void saveDecisionRanking(ctx.shopId, queue, execScore, impact);

    return NextResponse.json({
      actionQueue: queue.rankedActions,
      executiveScore: execScore.overall,
      impact,
      totalRecommendations: recommendations.length,
      source: 'generated',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error', actionQueue: null }, { status: 500 });
  }
}
