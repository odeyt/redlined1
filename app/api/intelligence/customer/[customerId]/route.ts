// SI-13: Customer Lifetime Intelligence — Profile API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildCustomerProfile, getCustomerProfile } from '@/intelligence/customer/CustomerLifetimeEngine';
import { resolveRequestShop } from '@/lib/shops/requestShop';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

async function resolveShopId(supabase: Awaited<ReturnType<typeof makeClient>>, userId: string, requested: string | null): Promise<string | null> {
  return (await resolveRequestShop(supabase, userId, requested, ALLOWED_ROLES))?.shop_id ?? null;
}

async function checkAccess(supabase: Awaited<ReturnType<typeof makeClient>>, userId: string, shopId: string): Promise<boolean> {
  const { data } = await supabase.from('shop_users').select('role').eq('user_id', userId).eq('shop_id', shopId).maybeSingle();
  return !!data && ALLOWED_ROLES.includes(data.role);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerId } = await params;
    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      return NextResponse.json({ error: 'Invalid customerId' }, { status: 400 });
    }

    const shopId = await resolveShopId(supabase, user.id, req.headers.get('x-shop-id'));
    if (!shopId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase.from('feature_flags').select('enabled').eq('flag_key', 'customer_lifetime_intelligence').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const rebuild = req.nextUrl.searchParams.get('rebuild') === 'true';

    if (rebuild) {
      const result = await buildCustomerProfile(shopId, customerId);
      return NextResponse.json({ result });
    }

    const profile = await getCustomerProfile(shopId, customerId);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { customerId } = await params;
    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      return NextResponse.json({ error: 'Invalid customerId' }, { status: 400 });
    }

    const shopId = await resolveShopId(supabase, user.id, req.headers.get('x-shop-id'));
    if (!shopId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase.from('feature_flags').select('enabled').eq('flag_key', 'customer_lifetime_intelligence').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const result = await buildCustomerProfile(shopId, customerId);
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
