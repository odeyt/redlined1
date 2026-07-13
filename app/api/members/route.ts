import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getAdmin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }); }

export async function DELETE(req: NextRequest) {
  try {
    const { userId, shopId } = await req.json();
    if (!userId || !shopId) return NextResponse.json({ error: 'Missing userId or shopId' }, { status: 400 });

    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!token || token.split('.').length !== 3) {
      return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Collect all shops owned by any owner of the target shop
    const { data: owners } = await getAdmin()
      .from('shop_users').select('user_id').eq('shop_id', shopId).eq('role', 'owner');
    const ownerIds = (owners ?? []).map((r: Record<string, unknown>) => r.user_id as string);

    let allShopIds: string[] = [shopId];
    if (ownerIds.length > 0) {
      const { data: ownerShops } = await getAdmin()
        .from('shop_users').select('shop_id').in('user_id', ownerIds).eq('role', 'owner');
      allShopIds = [...new Set((ownerShops ?? []).map((r: Record<string, unknown>) => r.shop_id as string))];
      if (!allShopIds.includes(shopId)) allShopIds.push(shopId);
    }

    // Use the REST API directly with service key — guarantees RLS bypass + full privileges
    const errors: string[] = [];
    for (const sid of allShopIds) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/shop_users?shop_id=eq.${sid}&user_id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!res.ok) {
        const body = await res.text();
        errors.push(`shop ${sid}: ${res.status} ${body}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
    }

    return NextResponse.json({ success: true, removedFrom: allShopIds.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get('shopId');
    if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 });

    // Use user's JWT to query shop_users (respects RLS — user sees their shop)
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: suRows, error: suError } = await userClient
      .from('shop_users')
      .select('user_id, role')
      .eq('shop_id', shopId);

    if (suError) {
      // Fallback: use getAdmin() client directly
      const { data: adminRows, error: adminErr } = await getAdmin()
        .from('shop_users')
        .select('user_id, role')
        .eq('shop_id', shopId);
      if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });
      if (!adminRows || adminRows.length === 0) return NextResponse.json({ members: [] });

      const userIds = adminRows.map((r: Record<string, unknown>) => r.user_id as string);
      const { data: { users: authUsers } } = await getAdmin().auth.admin.listUsers({ perPage: 1000 });
      const authMap = Object.fromEntries(
        (authUsers ?? []).filter(u => userIds.includes(u.id)).map(u => [u.id, u.email ?? ''])
      );
      return NextResponse.json({
        members: adminRows.map((r: Record<string, unknown>) => ({
          userId: r.user_id as string,
          email: authMap[r.user_id as string] ?? '',
          role: r.role as string,
        })),
      });
    }

    if (!suRows || suRows.length === 0) return NextResponse.json({ members: [] });

    const userIds = suRows.map((r: Record<string, unknown>) => r.user_id as string);
    const { data: { users: authUsers } } = await getAdmin().auth.admin.listUsers({ perPage: 1000 });
    const authMap = Object.fromEntries(
      (authUsers ?? []).filter(u => userIds.includes(u.id)).map(u => [u.id, u.email ?? ''])
    );

    return NextResponse.json({
      members: suRows.map((r: Record<string, unknown>) => ({
        userId: r.user_id as string,
        email: authMap[r.user_id as string] ?? '',
        role: r.role as string,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
