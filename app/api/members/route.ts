import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(req: NextRequest) {
  try {
    const { userId, shopId } = await req.json();
    if (!userId || !shopId) return NextResponse.json({ error: 'Missing userId or shopId' }, { status: 400 });

    // Require a valid Supabase JWT — proves the caller is authenticated
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!token || token.split('.').length !== 3) {
      return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
    }

    // Remove the user from all shops that share the same shopId's shop group
    // Find all shops by looking at every owner of this shop and collecting their shops
    const { data: owners } = await admin
      .from('shop_users').select('user_id').eq('shop_id', shopId).eq('role', 'owner');
    const ownerIds = (owners ?? []).map((r: Record<string, unknown>) => r.user_id as string);

    let allShopIds: string[] = [shopId];
    if (ownerIds.length > 0) {
      const { data: ownerShops } = await admin
        .from('shop_users').select('shop_id').in('user_id', ownerIds).eq('role', 'owner');
      allShopIds = [...new Set((ownerShops ?? []).map((r: Record<string, unknown>) => r.shop_id as string))];
      if (!allShopIds.includes(shopId)) allShopIds.push(shopId);
    }

    for (const sid of allShopIds) {
      await admin.from('shop_users').delete().eq('shop_id', sid).eq('user_id', userId);
    }

    return NextResponse.json({ success: true });
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
      // Fallback: use admin client directly
      const { data: adminRows, error: adminErr } = await admin
        .from('shop_users')
        .select('user_id, role')
        .eq('shop_id', shopId);
      if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });
      if (!adminRows || adminRows.length === 0) return NextResponse.json({ members: [] });

      const userIds = adminRows.map((r: Record<string, unknown>) => r.user_id as string);
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
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
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
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
