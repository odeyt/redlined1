// SI-9: Business Memory Item — GET / PATCH by ID

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
  const { data: suRow } = await supabase.from('shop_users').select('role')
    .eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  const role = (suRow as { role?: string } | null)?.role ?? '';
  return { userId: user.id, shopId, role };
}

// GET — fetch a single memory item
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('business_memory_items')
      .select('*')
      .eq('id', id)
      .eq('shop_id', ctx.shopId)
      .maybeSingle();

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}

// PATCH — archive, restore, or update importance
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthCtx(req);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'manager'].includes(ctx.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const body = await req.json() as { action?: string; importance?: string };

    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const now = new Date().toISOString();

    if (body.action === 'archive') {
      await db.from('business_memory_items')
        .update({ is_active: false, updated_at: now })
        .eq('id', id).eq('shop_id', ctx.shopId);
    } else if (body.action === 'restore') {
      await db.from('business_memory_items')
        .update({ is_active: true, updated_at: now })
        .eq('id', id).eq('shop_id', ctx.shopId);
    } else if (body.importance) {
      await db.from('business_memory_items')
        .update({ importance: body.importance, updated_at: now })
        .eq('id', id).eq('shop_id', ctx.shopId);
    } else {
      return NextResponse.json({ error: 'No valid action' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
