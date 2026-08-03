export const dynamic = 'force-dynamic'
// SI-11: GET /api/intelligence/learning/summary
// Auth required. Owner/manager only. Returns shop learning health status.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getShopLearningSummary } from '@/intelligence/learning/IntelligenceLearningEngine';
import { featureTablesReady } from '@/lib/intelligence/tableAvailability';

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

export async function GET() {
  try {
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { shopId, role } = await getShopAndRole(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });
    if (role !== 'owner' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagOn = await checkFlag('intelligence_learning_dashboard');
    if (!flagOn) return NextResponse.json({ disabled: true, learningEnabled: false, adjustmentsEnabled: false });

    // The recommendation_* tables do not exist yet. The engine catches its own
    // errors, so without this the panel would render a confident summary built
    // from nothing. Say so instead.
    const ready = await featureTablesReady(
      'recommendation_learning_events',
      'recommendation_learning_profiles',
      'recommendation_feedback',
    );
    if (!ready) {
      return NextResponse.json({
        unavailable: true,
        reason: 'Learning data is not set up for this deployment yet.',
        learningEnabled: false,
        adjustmentsEnabled: false,
      });
    }

    const summary = await getShopLearningSummary(shopId);
    if (!summary) return NextResponse.json({ disabled: false, learningEnabled: false, adjustmentsEnabled: false });

    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
