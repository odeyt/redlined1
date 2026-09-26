import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { invalidateCache, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { getAdminDb } from '@/lib/supabaseServer';
import { matchScope, normalizeScopeKey, saveFlagRow } from '@/lib/featureFlags/saveFlagRow';
import { logger } from '@/lib/logger';

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

    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });

    // Not an upsert: uniqueness is an expression index the ON CONFLICT
    // clause cannot target. See lib/featureFlags/saveFlagRow.ts.
    const { error } = await saveFlagRow(getAdminDb(), normalizeScopeKey({ ...body, flag_key: key }), { enabled: body.enabled });

    if (error) {
      logger.error('featureFlags.toggle failed', new Error(error), { flagKey: key });
      return NextResponse.json({ error }, { status: 500 });
    }

    // Every shop's cache, not just the caller's: a global flag applies to all
    // of them, and the other location would otherwise keep the old value.
    invalidateCache();
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

    // Exactly one scope combination: an empty target means IS NULL. Skipping
    // the filter instead (as this did) matched every row of that scope.
    const { error } = await matchScope(
      getAdminDb().from('feature_flags').delete(),
      normalizeScopeKey({ flag_key: key, scope, shop_id, user_id, role, environment }),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Every shop's cache, not just the caller's: a global flag applies to all
    // of them, and the other location would otherwise keep the old value.
    invalidateCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
