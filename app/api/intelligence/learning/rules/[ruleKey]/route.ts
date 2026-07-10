// SI-11: GET /api/intelligence/learning/rules/[ruleKey]
// Auth required. Owner/manager only. Returns per-rule performance summary.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRulePerformance } from '@/intelligence/learning/IntelligenceLearningEngine';

type RouteContext = { params: Promise<{ ruleKey: string }> };

async function getAuth() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
}

async function checkFlag(key: string): Promise<boolean> {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  const db = getAdminDb();
  const { data } = await db.from('feature_flags').select('enabled').eq('flag_key', key).maybeSingle();
  return !!(data as { enabled?: boolean } | null)?.enabled;
}

async function getShopAndRole(
  authClient: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<{ shopId: string | null; role: string | null }> {
  const { data } = await authClient
    .from('shop_users')
    .select('shop_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  const row = data as { shop_id: string; role: string } | null;
  return { shopId: row?.shop_id ?? null, role: row?.role ?? null };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { ruleKey } = await context.params;
    const authClient  = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flagOn = await checkFlag('intelligence_learning_engine');
    if (!flagOn) return NextResponse.json({ disabled: true, profile: null });

    const { shopId, role } = await getShopAndRole(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });
    if (role !== 'owner' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const performance = await getRulePerformance(shopId, decodeURIComponent(ruleKey));
    if (!performance) return NextResponse.json({ profile: null });

    return NextResponse.json({ profile: performance });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
