export const dynamic = 'force-dynamic';
// SI-5: GET /api/intelligence/recommendations/[id]/evidence
// Returns the evidence for a single recommendation.
// Auth required. Owner/manager only. Technician blocked.
// Safe fallback if evidence tables are not yet migrated.
//
// Two flags, both default OFF:
//   evidence_engine             → `evidence`: summary evidence + why it matters
//   actionable_recommendations  → `decision`: the actual records, what to do,
//                                 the money involved, and where to do it
// Either one turns the route on; each part is built only when its flag is on.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRequestShop } from '@/lib/shops/requestShop';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import { isEnabled } from '@/lib/featureFlags/featureFlagService';
import { getFeatureFlagEnvironment } from '@/lib/environment';

const ALLOWED_ROLES = ['owner', 'manager'];

async function getAuthCtx(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // The header only chooses among the caller's own memberships; it never
  // grants one. Without it, an active (not archived) shop is preferred.
  const requested = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? null;
  const membership = await resolveRequestShop(supabase, user.id, requested);
  return { userId: user.id, shopId: membership?.shop_id ?? '', role: membership?.role ?? '' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagCtx = { userId: ctx.userId, shopId: ctx.shopId, role: ctx.role, environment: getFeatureFlagEnvironment() };
    const [evidenceOn, decisionsOn] = await Promise.all([
      isEnabled('evidence_engine', flagCtx),
      isEnabled('actionable_recommendations', flagCtx),
    ]);
    if (!evidenceOn && !decisionsOn) {
      return NextResponse.json({ disabled: true, evidence: null, decision: null, message: 'Evidence Engine is not enabled.' });
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
    const recommendationKey = recRow.recommendation_key as string;

    const [evidence, decision] = await Promise.all([
      evidenceOn ? buildSummaryEvidence(db, recRow as Record<string, unknown>, shopId) : Promise.resolve(null),
      decisionsOn
        ? import('@/intelligence/evidence/DecisionEvidenceLoader')
          .then(m => m.loadDecisionEvidence(recommendationKey, shopId))
          .catch(() => null)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ evidence, decision });
  } catch (e) {
    // Always return a safe empty response — never crash Command Center
    return NextResponse.json({
      evidence: null,
      decision: null,
      error: e instanceof Error ? e.message : 'Evidence unavailable',
    });
  }
}

type Db = ReturnType<typeof import('@/lib/supabaseServer').getAdminDb>;

async function buildSummaryEvidence(db: Db, recRow: Record<string, unknown>, shopId: string) {
  try {
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

    // The shop plus any location merged into it (D1 Imports into Location 2),
    // the same scope the metrics behind each recommendation are counted over.
    const shopIds = await mergedShopScope(db, shopId);
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
    saveEvidenceBundle(rec.id, shopId, bundle.items).catch(() => {});
    return bundle;
  } catch {
    return null;
  }
}
