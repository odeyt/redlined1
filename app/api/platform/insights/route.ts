/**
 * GET /api/platform/insights
 * List active insights for the current shop.
 * Supports filtering by category, urgency, entity.
 *
 * DELETE /api/platform/insights/[id]/dismiss
 * Dismiss a specific insight.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';

async function getAuthContext(req: NextRequest) {
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
    .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  return { supabase, user, shopId, role: (suRow as { role?: string } | null)?.role ?? '' };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const urgency = url.searchParams.get('urgency');
    const entityId = url.searchParams.get('entityId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

    let query = ctx.supabase
      .from('rd1_platform_insights')
      .select('*')
      .eq('shop_id', ctx.shopId)
      .eq('is_dismissed', false)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (category) query = query.eq('category', category);
    if (urgency) query = query.eq('urgency', urgency);
    if (entityId) query = query.eq('entity_id', entityId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ insights: data ?? [], total: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
