// SI-13: Customer Intelligence Summary API (shop-level health)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCustomerHealth } from '@/intelligence/customer/CustomerLifetimeEngine';

const ALLOWED_ROLES = ['owner', 'manager'];

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shopUser } = await supabase.from('shop_users').select('shop_id, role').eq('user_id', user.id).in('role', ALLOWED_ROLES).limit(1).maybeSingle();
    if (!shopUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase.from('feature_flags').select('enabled').eq('flag_key', 'customer_lifetime_intelligence').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const health = await getCustomerHealth(shopUser.shop_id);
    return NextResponse.json({ health });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
