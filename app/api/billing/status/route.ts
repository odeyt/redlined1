/**
 * GET /api/billing/status
 * Returns the billing status for the current shop.
 * Auth required.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';
import { getBillingStatus } from '@/commercial/billing/billingService';

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

    const status = await getBillingStatus(shopUser.shop_id);
    return NextResponse.json(status);
  } catch (err) {
    console.error('[/api/billing/status]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
