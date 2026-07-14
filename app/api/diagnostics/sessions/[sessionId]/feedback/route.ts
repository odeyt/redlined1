/**
 * POST /api/diagnostics/sessions/[sessionId]/feedback
 * Record technician feedback on a reasoning result or hypothesis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { TechnicianFeedbackSchema } from '@/lib/diagnostics/schemas';

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

export async function POST(
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
    const body = await req.json();
    const parsed = TechnicianFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from('diagnostic_feedback')
      .insert({
        session_id: sessionId,
        shop_id: ctx.shopId,
        technician_id: ctx.user.id,
        target_id: parsed.data.targetId,
        target_type: parsed.data.targetType,
        feedback_type: parsed.data.feedbackType,
        notes: parsed.data.notes ?? null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ feedback: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
