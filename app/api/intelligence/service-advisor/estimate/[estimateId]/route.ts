// SI-12: Estimate Advisor API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { reviewEstimateById, generateAdvisorSuggestions, createAdvisorSession } from '@/intelligence/service-advisor/IntelligentServiceAdvisor';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

async function makeClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

async function isFlagEnabled(supabase: ReturnType<typeof createServerClient>, flagKey: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('feature_flags').select('enabled').eq('flag_key', flagKey).maybeSingle();
    return data?.enabled === true;
  } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { estimateId } = await params;
    if (!estimateId || !/^[0-9a-f-]{36}$/i.test(estimateId)) {
      return NextResponse.json({ error: 'Invalid estimateId' }, { status: 400 });
    }

    const shopId = req.nextUrl.searchParams.get('shopId');
    if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
    if (!shopUser || !ALLOWED_ROLES.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [advisorOn, panelOn] = await Promise.all([
      isFlagEnabled(supabase, 'intelligent_service_advisor'),
      isFlagEnabled(supabase, 'service_advisor_estimate_panel'),
    ]);
    if (!advisorOn || !panelOn) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const review = await reviewEstimateById(estimateId, shopId);
    return NextResponse.json({ review });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ estimateId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { estimateId } = await params;
    if (!estimateId || !/^[0-9a-f-]{36}$/i.test(estimateId)) {
      return NextResponse.json({ error: 'Invalid estimateId' }, { status: 400 });
    }

    const body = await req.json();
    const shopId = body.shopId as string | undefined;
    if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
    if (!shopUser || !ALLOWED_ROLES.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const flagOn = await isFlagEnabled(supabase, 'intelligent_service_advisor');
    if (!flagOn) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    const session = await createAdvisorSession({ shopId, estimateId, createdBy: user.id });
    const result = await generateAdvisorSuggestions(session.id);

    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
