// SI-5: POST /api/intelligence/recommendations/[id]/outcome
// Records the outcome of acting on a recommendation (completed, dismissed, etc.)
// Auth required. Owner/manager only. Technician blocked.

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
  const { data: suRow } = await supabase.from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

const VALID_STATUSES = ['completed', 'dismissed', 'snoozed', 'in_progress', 'not_applicable', 'revenue_realized', 'expired'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: recId } = await params;
    const { shopId, userId } = ctx;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const outcomeStatus = body.outcomeStatus as string | undefined;
    if (!outcomeStatus || !VALID_STATUSES.includes(outcomeStatus)) {
      return NextResponse.json(
        { error: `outcomeStatus must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    // Confirm recommendation belongs to this shop
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data: recRow } = await db
      .from('recommendations')
      .select('id, shop_id')
      .eq('id', recId)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (!recRow) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    const { recordRecommendationOutcome } = await import('@/intelligence/evidence/EvidenceEngine');
    await recordRecommendationOutcome({
      recommendationId: recId,
      shopId,
      userId,
      outcomeStatus: outcomeStatus as import('@/intelligence/evidence/types').OutcomeStatus,
      revenueRealized: typeof body.revenueRealized === 'number' ? body.revenueRealized : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });

    // Optionally update the recommendation status itself
    if (outcomeStatus === 'dismissed') {
      await db.from('recommendations').update({ status: 'dismissed' }).eq('id', recId).eq('shop_id', shopId);
    } else if (outcomeStatus === 'completed' || outcomeStatus === 'revenue_realized') {
      await db.from('recommendations').update({ status: 'completed' }).eq('id', recId).eq('shop_id', shopId);
    }

    return NextResponse.json({ success: true, recommendationId: recId, outcomeStatus });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Failed to record outcome',
    }, { status: 500 });
  }
}
