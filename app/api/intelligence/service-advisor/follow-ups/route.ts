// SI-12: Follow-Up Opportunities API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { findStaleEstimates, findApprovedNotScheduled, findViewedNotApproved, buildFollowUpRecommendation } from '@/intelligence/service-advisor/EstimateFollowUpEngine';

const OWNER_MANAGER = ['owner', 'manager'];

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const shopId = req.nextUrl.searchParams.get('shopId');
    if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
    if (!shopUser || !OWNER_MANAGER.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase
      .from('feature_flags').select('enabled').eq('flag_key', 'service_advisor_follow_up').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const [stale, approved, viewed] = await Promise.all([
      findStaleEstimates(shopId).catch(() => []),
      findApprovedNotScheduled(shopId).catch(() => []),
      findViewedNotApproved(shopId).catch(() => []),
    ]);

    const all = [...approved, ...viewed, ...stale];
    const seenIds = new Set<string>();
    const unique = all.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; });

    const recommendations = unique.slice(0, 20).map(e =>
      buildFollowUpRecommendation(e, { visitCount: 0, hasDeclined: e.status === 'declined', hasSafetyFinding: false })
    );

    return NextResponse.json({ recommendations, total: unique.length });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

