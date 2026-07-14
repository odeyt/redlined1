export const dynamic = 'force-dynamic';
// SI-5: GET /api/intelligence/recommendations/[id]/evidence
// Returns evidence bundle for a single recommendation.
// Auth required. Owner/manager only. Technician blocked.
// Safe fallback if evidence tables are not yet migrated.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getShopIds } from '@/lib/shopStore';

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
  const { data: suRow } = await supabase.from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db.from('feature_flags').select('enabled').eq('flag_key', flagKey).maybeSingle();
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch { return false; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagOn = await isFlagEnabled('evidence_engine');
    if (!flagOn) {
      return NextResponse.json({ disabled: true, evidence: null, message: 'Evidence Engine is not enabled.' });
    }

    const { id: recId } = await params;
    const { shopId } = ctx;

    // Fetch the recommendation to build evidence for
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data: recRow, error: recErr } = await db
      .from('recommendations')
      .select('*')
      .eq('id', recId)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (recErr || !recRow) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    const { buildEvidenceForRecommendation, saveEvidenceBundle } = await import('@/intelligence/evidence/EvidenceEngine');

    // Get signals for revenue dip rule
    const { data: sigRow } = await db
      .from('intelligence_signals')
      .select('signals')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const signals = (sigRow as { signals?: Record<string, unknown> } | null)?.signals ?? {};

    const shopIds = getShopIds();
    const rec = {
      id: recRow.id as string,
      shopId: recRow.shop_id as string,
      recommendationKey: recRow.recommendation_key as string,
      category: recRow.category as string,
      priority: recRow.priority as string,
      title: recRow.title as string,
      description: recRow.description as string,
      reason: recRow.reason as string,
      estimatedRevenue: recRow.estimated_revenue as number | null,
      confidence: Number(recRow.confidence ?? 0),
      status: recRow.status as string,
      actionPayload: (recRow.action_payload as Record<string, unknown>) ?? {},
      metadata: (recRow.metadata as Record<string, unknown>) ?? {},
    };

    const bundle = await buildEvidenceForRecommendation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec as any,
      shopId,
      shopIds.length > 0 ? shopIds : [shopId],
      signals as Record<string, number | string | null>,
    );

    // Persist evidence asynchronously (fire-and-forget)
    saveEvidenceBundle(recId, shopId, bundle.items).catch(() => {});

    return NextResponse.json({ evidence: bundle });
  } catch (e) {
    // Always return a safe empty response — never crash Command Center
    return NextResponse.json({
      evidence: null,
      error: e instanceof Error ? e.message : 'Evidence unavailable',
    });
  }
}
