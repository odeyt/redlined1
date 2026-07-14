export const dynamic = 'force-dynamic';
// SI-13: Customer Opportunities API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildCustomerContext } from '@/intelligence/customer/CustomerContextBuilder';
import { findCustomerOpportunities } from '@/intelligence/customer/CustomerOpportunityEngine';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerId } = await params;
    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      return NextResponse.json({ error: 'Invalid customerId' }, { status: 400 });
    }

    const { data: shopUser } = await supabase.from('shop_users').select('shop_id, role').eq('user_id', user.id).in('role', ALLOWED_ROLES).limit(1).maybeSingle();
    if (!shopUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase.from('feature_flags').select('enabled').eq('flag_key', 'customer_revenue_opportunities').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const ctx = await buildCustomerContext(shopUser.shop_id, customerId);
    const opportunities = findCustomerOpportunities(ctx);

    return NextResponse.json({ opportunities });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
