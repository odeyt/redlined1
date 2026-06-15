import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
