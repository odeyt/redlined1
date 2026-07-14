export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  generateRecommendations,
  getOpenRecommendations,
  dismissRecommendation,
  completeRecommendation,
} from '@/intelligence/recommendations/RecommendationEngine';

function disabledResponse() {
  return NextResponse.json({ disabled: true, recommendations: [], message: 'Recommendation engine is not enabled.' });
}

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
    const { data, error } = await db.from('feature_flags').select('enabled').eq('flag_key', flagKey).maybeSingle();
    if (error) {
      console.error('[isFlagEnabled] DB error for', flagKey, error.message);
      return true; // fail-open: DB confirmed flags exist, don't block UI on query error
    }
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch (e) {
    console.error('[isFlagEnabled] exception for', flagKey, e);
    return true; // fail-open
  }
}

// GET — open recommendations for the shop (owner/manager only)
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const enabled = await isFlagEnabled('recommendation_engine');
    if (!enabled) return disabledResponse();

    const recommendations = await getOpenRecommendations(ctx.shopId);
    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST — generate fresh recommendations
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!ctx.shopId) return NextResponse.json({ error: 'Shop required' }, { status: 400 });

    const enabled = await isFlagEnabled('recommendation_engine');
    if (!enabled) return disabledResponse();

    const recommendations = await generateRecommendations(ctx.shopId);
    return NextResponse.json({ recommendations, generated: recommendations.length });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH — complete or dismiss a recommendation
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { id: string; action: 'complete' | 'dismiss' };
    if (!body.id || !body.action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

    if (body.action === 'complete') {
      await completeRecommendation(body.id);
    } else if (body.action === 'dismiss') {
      await dismissRecommendation(body.id);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
