/**
 * GET /api/billing/usage
 * Returns monthly usage for the current shop.
 * Auth required — owner/manager only.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';
import { getMonthlyUsage } from '@/commercial/usage/usageService';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminDb = getAdminDb();
    const { data: shopUser } = await adminDb
      .from('shop_users')
      .select('shop_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin', 'manager'])
      .maybeSingle();

    if (!shopUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const usage = await getMonthlyUsage(shopUser.shop_id);
    return NextResponse.json({ usage });
  } catch (err) {
    console.error('[/api/billing/usage]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
