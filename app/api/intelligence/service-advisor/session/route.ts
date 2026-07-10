// SI-12: Service Advisor Session API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  createAdvisorSession,
  generateAdvisorSuggestions,
  getAdvisorSession,
} from '@/intelligence/service-advisor/IntelligentServiceAdvisor';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

async function getAuthedUser(supabase: ReturnType<typeof createServerClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getShopRole(supabase: ReturnType<typeof createServerClient>, userId: string, shopId: string): Promise<string | null> {
  const { data } = await supabase
    .from('shop_users')
    .select('role')
    .eq('user_id', userId)
    .eq('shop_id', shopId)
    .maybeSingle();
  return data?.role ?? null;
}

async function isFlagEnabled(supabase: ReturnType<typeof createServerClient>, flagKey: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('feature_flags').select('enabled').eq('flag_key', flagKey).maybeSingle();
    return data?.enabled === true;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const user = await getAuthedUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const shopId = body.shopId as string | undefined;
    if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });

    const [flagOn, role] = await Promise.all([
      isFlagEnabled(supabase, 'intelligent_service_advisor'),
      getShopRole(supabase, user.id, shopId),
    ]);

    if (!flagOn) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const session = await createAdvisorSession({
      shopId,
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      jobCardId: body.jobCardId,
      estimateId: body.estimateId,
      createdBy: user.id,
    });

    // Generate suggestions asynchronously â€” return session immediately
    generateAdvisorSuggestions(session.id).catch(() => null);

    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const user = await getAuthedUser(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const shopId = searchParams.get('shopId');

    if (!sessionId || !shopId) return NextResponse.json({ error: 'sessionId and shopId required' }, { status: 400 });

    const [flagOn, role] = await Promise.all([
      isFlagEnabled(supabase, 'intelligent_service_advisor'),
      getShopRole(supabase, user.id, shopId),
    ]);

    if (!flagOn) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const session = await getAdvisorSession(sessionId);
    if (!session || session.shopId !== shopId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

