import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify caller via Bearer token (more reliable than cookies in API routes)
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const shopId = req.nextUrl.searchParams.get('shopId');
    if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 });

    // Verify requester is a member of this shop
    const { data: myRow } = await admin
      .from('shop_users')
      .select('role')
      .eq('shop_id', shopId)
      .eq('user_id', user.id)
      .single();
    if (!myRow) return NextResponse.json({ error: 'Not a member of this shop' }, { status: 403 });

    // Get all members of the shop
    const { data: suRows } = await admin
      .from('shop_users')
      .select('user_id, role')
      .eq('shop_id', shopId);

    if (!suRows || suRows.length === 0) return NextResponse.json({ members: [] });

    const userIds = suRows.map((r: Record<string, unknown>) => r.user_id as string);

    // Fetch emails from auth.users (requires service role)
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authMap = Object.fromEntries(
      (authUsers ?? []).filter(u => userIds.includes(u.id)).map(u => [u.id, u.email ?? ''])
    );

    const members = suRows.map((r: Record<string, unknown>) => ({
      userId: r.user_id as string,
      email: authMap[r.user_id as string] ?? '',
      role: r.role as string,
    }));

    return NextResponse.json({ members });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
