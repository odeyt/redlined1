/**
 * GET /api/diagnostics/sessions/[sessionId]
 * Fetch a single session with related data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';

async function getAuthContext(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';
  const { data: suRow } = await supabase
    .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  return { supabase, user, shopId, role: (suRow as { role?: string } | null)?.role ?? '' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flags = await getFlags({ userId: ctx.user.id, shopId: ctx.shopId, role: ctx.role, environment: getCurrentEnvironment() });
    if (!flags['diagnostic_orchestrator_enabled']) {
      return NextResponse.json({ error: 'Not enabled' }, { status: 403 });
    }

    const { sessionId } = await params;

    const { data: session, error } = await ctx.supabase
      .from('diagnostic_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('shop_id', ctx.shopId)
      .single();

    if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [modules, dtcs, freezeFrames, evidence, hypotheses, testPlans, testResults, reasoningRuns, reviews] =
      await Promise.all([
        ctx.supabase.from('diagnostic_modules').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_dtcs').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_freeze_frames').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_evidence').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_hypotheses').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_test_plans').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_test_results').select('*').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_reasoning_runs').select('id,session_id,model_provider,model_name,safety_status,validated_at,created_at').eq('session_id', sessionId),
        ctx.supabase.from('diagnostic_reviews').select('id,session_id,agrees_with_primary,severity,approval_state,created_at').eq('session_id', sessionId),
      ]);

    return NextResponse.json({
      session,
      modules: modules.data ?? [],
      dtcs: dtcs.data ?? [],
      freezeFrames: freezeFrames.data ?? [],
      evidence: evidence.data ?? [],
      hypotheses: hypotheses.data ?? [],
      testPlans: testPlans.data ?? [],
      testResults: testResults.data ?? [],
      reasoningRuns: reasoningRuns.data ?? [],
      reviews: reviews.data ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
