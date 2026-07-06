import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getFlags,
  getAllFlagRows,
  invalidateCache,
  getCurrentEnvironment,
} from '@/lib/featureFlags/featureFlagService';
import { getAdminDb } from '@/lib/supabaseServer';

async function getAuthContext(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const shopId = req.headers.get('x-shop-id') ??
    cookieStore.get('shopId')?.value ?? '';

  const { data: suRow } = await supabase
    .from('shop_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('shop_id', shopId)
    .maybeSingle();

  return {
    userId: user.id,
    shopId,
    role: (suRow as { role?: string } | null)?.role ?? '',
    environment: getCurrentEnvironment(),
  };
}

// ── GET /api/feature-flags ────────────────────────────────────────────────────
// Returns evaluated flag map for the current user + all flag rows for admins.

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return NextResponse.json({ flags: {} }, { status: 200 });

    const [flagMap, allRows] = await Promise.all([
      getFlags(ctx),
      ctx.role === 'owner' ? getAllFlagRows(ctx.shopId) : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      flags: flagMap,
      ...(allRows !== undefined ? { rows: allRows } : {}),
    });
  } catch {
    return NextResponse.json({ flags: {} });
  }
}

// ── POST /api/feature-flags ───────────────────────────────────────────────────
// Upsert a flag row. Owner only.

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 });

    const body = await req.json() as {
      flag_key: string;
      display_name?: string;
      description?: string;
      enabled: boolean;
      scope?: string;
      shop_id?: string | null;
      user_id?: string | null;
      role?: string | null;
      environment?: string | null;
    };

    if (!body.flag_key) return NextResponse.json({ error: 'flag_key required' }, { status: 400 });

    const db = getAdminDb();
    const { error } = await db.from('feature_flags').upsert({
      flag_key:     body.flag_key,
      display_name: body.display_name ?? body.flag_key,
      description:  body.description ?? '',
      enabled:      body.enabled,
      scope:        body.scope ?? 'global',
      shop_id:      body.shop_id ?? null,
      user_id:      body.user_id ?? null,
      role:         body.role ?? null,
      environment:  body.environment ?? null,
    }, { onConflict: 'flag_key,scope,shop_id,user_id,role,environment' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    invalidateCache(ctx.shopId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
