/**
 * Who on the team will actually be reached when the app is closed.
 *
 * Push cannot be switched on for somebody else — the subscription is created
 * by the browser on their own phone — so the only thing an owner can do is
 * find out who is missing and go and ask them. Without this, "alerts are set
 * up" and "one person out of eleven receives them" look identical from the
 * inside, which is how this shop ran for a week.
 *
 * Owner and manager only: it reports who is on the team and reachable, which
 * is not a technician's business.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireShopRole } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get('shopId');
  const auth = await requireShopRole(req, shopId, ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const admin = createServerSupabase();

  const { data: members, error } = await admin
    .from('shop_users')
    .select('user_id, role')
    .eq('shop_id', shopId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!members?.length) return NextResponse.json({ members: [] });

  const userIds = members.map(m => m.user_id);

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id')
    .in('user_id', userIds);

  // Counted per user, not per row: someone with a phone and a shop computer
  // has two subscriptions, and "2 devices" is the useful number.
  const deviceCount = new Map<string, number>();
  for (const s of subs ?? []) {
    deviceCount.set(s.user_id, (deviceCount.get(s.user_id) ?? 0) + 1);
  }

  // Emails come from auth, which has no join to shop_users. Listing is
  // paginated; one page of 200 covers a workshop many times over, and a
  // missing email degrades to the role alone rather than failing the call.
  const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailOf = new Map((userPage?.users ?? []).map(u => [u.id, u.email ?? '']));

  const list = members.map(m => ({
    userId: m.user_id,
    role: m.role,
    email: emailOf.get(m.user_id) ?? '',
    devices: deviceCount.get(m.user_id) ?? 0,
  }));

  // The people who need chasing first.
  list.sort((a, b) => a.devices - b.devices || a.role.localeCompare(b.role));

  return NextResponse.json({ members: list });
}
