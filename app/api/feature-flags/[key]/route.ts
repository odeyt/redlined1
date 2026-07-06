import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { getAdminDb } from '@/lib/supabaseServer';

async function getRole(req: NextRequest): Promise<{ userId: string; role: string; shopId: string } | null> {
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

  return { userId: user.id, role: (suRow as { role?: string } | null)?.role ?? '', shopId };
}

// ── PATCH /api/feature-flags/[key] ───────────────────────────────────────────
// Toggle or update a specific flag. Owner only.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const auth = await getRole(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 });

    const { key } = await params;
    const body = await req.json() as {
      enabled: boolean;
      scope?: string;
      shop_id?: string | null;
      user_id?: string | null;
      role?: string | null;
      environment?: string | null;
    };

    const db = getAdminDb();
    const scope = body.scope ?? 'global';

    // Build the match filter for upsert
    const row = {
      flag_key:    key,
      enabled:     body.enabled,
      scope,
      shop_id:     body.shop_id     ?? null,
      user_id:     body.user_id     ?? null,
      role:        body.role        ?? null,
      environment: body.environment ?? null,
    };

    const { error } = await db
      .from('feature_flags')
      .upsert(row, { onConflict: 'flag_key,scope,shop_id,user_id,role,environment' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    invalidateCache(auth.shopId);
    return NextResponse.json({ ok: true, key, enabled: body.enabled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── DELETE /api/feature-flags/[key] ──────────────────────────────────────────
// Remove a non-global scope override. Owner only.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const auth = await getRole(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 });

    const { key } = await params;
    const { scope, shop_id, user_id, role, environment } = await req.json() as Record<string, string | null>;

    const db = getAdminDb();
    let query = db.from('feature_flags').delete().eq('flag_key', key).eq('scope', scope ?? 'global');
    if (shop_id)     query = query.eq('shop_id', shop_id);
    if (user_id)     query = query.eq('user_id', user_id);
    if (role)        query = query.eq('role', role);
    if (environment) query = query.eq('environment', environment);

    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    invalidateCache(auth.shopId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
