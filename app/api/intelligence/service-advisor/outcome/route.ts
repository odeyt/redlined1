// SI-12: Advisor Outcome Recording API

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { recordAdvisorOutcome } from '@/intelligence/service-advisor/IntelligentServiceAdvisor';
import type { AdvisorOutcomeType } from '@/intelligence/service-advisor/types';

const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];

const VALID_OUTCOME_TYPES: AdvisorOutcomeType[] = [
  'suggestion_reviewed', 'suggestion_accepted', 'suggestion_dismissed',
  'estimate_sent', 'estimate_approved', 'estimate_declined',
  'follow_up_completed', 'explanation_used', 'no_measurable_outcome',
];

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { shopId, outcomeType } = body as { shopId?: string; outcomeType?: string };
    if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });
    if (!outcomeType || !VALID_OUTCOME_TYPES.includes(outcomeType as AdvisorOutcomeType)) {
      return NextResponse.json({ error: 'Invalid outcomeType' }, { status: 400 });
    }

    const { data: shopUser } = await supabase
      .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
    if (!shopUser || !ALLOWED_ROLES.includes(shopUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: flag } = await supabase
      .from('feature_flags').select('enabled').eq('flag_key', 'service_advisor_outcome_tracking').maybeSingle();
    if (!flag?.enabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

    await recordAdvisorOutcome({
      shopId,
      advisorSessionId: body.advisorSessionId,
      estimateId: body.estimateId,
      suggestionId: body.suggestionId,
      outcomeType: outcomeType as AdvisorOutcomeType,
      accepted: body.accepted,
      estimateApproved: body.estimateApproved,
      realizedRevenue: body.realizedRevenue,
      customerResponse: body.customerResponse,
      recordedBy: user.id,
      metadata: body.metadata ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error', detail: String(e) }, { status: 500 });
  }
}

