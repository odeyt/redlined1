export const dynamic = 'force-dynamic'
// SI-11: POST /api/intelligence/learning/outcome
// Auth required. Owner/manager only. Records realized revenue and time saved.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

export async function POST(req: NextRequest) {
  try {
    const authClient = await getAuth();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flagOn = await checkFlag('value_attribution');
    if (!flagOn) return NextResponse.json({ disabled: true, ok: false }, { status: 200 });

    const { shopId, role } = await getShopAndRole(authClient, user.id);
    if (!shopId) return NextResponse.json({ error: 'No shop' }, { status: 403 });
    if (role !== 'owner' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as {
      recommendationId?: string;
      realizedRevenue?: number;
      realizedTimeSavedMinutes?: number;
    };

    if (!body.recommendationId) {
      return NextResponse.json({ ok: false, error: 'recommendationId required' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();

    const { error } = await db.from('recommendation_value_attribution').insert({
      shop_id:                     shopId,
      recommendation_id:           body.recommendationId,
      realized_revenue:            body.realizedRevenue ?? null,
      realized_time_saved_minutes: body.realizedTimeSavedMinutes ?? null,
      attribution_status:          'pending',
      attribution_method:          'manual',
      verified_by:                 null,
      metadata:                    {},
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
