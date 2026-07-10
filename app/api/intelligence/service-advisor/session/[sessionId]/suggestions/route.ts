// SI-12: Session Suggestions API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdvisorSuggestions, getAdvisorSession, acceptSuggestion, dismissSuggestion } from '@/intelligence/service-advisor/IntelligentServiceAdvisor';

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

    const suggestions = await getAdvisorSuggestions(sessionId);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = await makeClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await params;
    if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const body = await req.json();
    const { suggestionId, action } = body as { suggestionId?: string; action?: string };
    if (!suggestionId || !/^[0-9a-f-]{36}$/i.test(suggestionId)) {
      return NextResponse.json({ error: 'Invalid suggestionId' }, { status: 400 });
    }
    if (action !== 'accept' && action !== 'dismiss') {
      return NextResponse.json({ error: 'action must be accept or dismiss' }, { status: 400 });
    }

    const session = await getAdvisorSession(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', session.shopId).maybeSingle();
    if (!shopUser || !ALLOWED_ROLES.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (action === 'accept') await acceptSuggestion(suggestionId);
    else await dismissSuggestion(suggestionId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}
