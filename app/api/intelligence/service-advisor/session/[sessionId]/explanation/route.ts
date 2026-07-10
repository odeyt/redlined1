// SI-12: Customer Explanation API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateCustomerExplanation, getAdvisorSession } from '@/intelligence/service-advisor/IntelligentServiceAdvisor';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await params;
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const session = await getAdvisorSession(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', session.shopId).maybeSingle();
    if (!shopUser || !ALLOWED_ROLES.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase
      .from('feature_flags').select('enabled').eq('flag_key', 'service_advisor_customer_explanations').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const explanation = await generateCustomerExplanation(sessionId);
    if (!explanation) return NextResponse.json({ error: 'Could not generate explanation' }, { status: 500 });

    return NextResponse.json({ explanation });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
