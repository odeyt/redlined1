/**
 * POST /api/diagnostics/sessions/[sessionId]/verify-repair
 * Record a post-repair verification, advancing session to REPAIR_VERIFIED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { RepairVerificationSchema } from '@/lib/diagnostics/schemas';

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
    const parsed = RepairVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    // Verify session belongs to shop
    const { data: session, error: sessErr } = await ctx.supabase
      .from('diagnostic_sessions')
      .select('id, status, shop_id, vehicle_id, job_card_id')
      .eq('id', sessionId)
      .eq('shop_id', ctx.shopId)
      .single();

    if (sessErr || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const { data: verification, error: verErr } = await ctx.supabase
      .from('diagnostic_repair_verifications')
      .insert({
        session_id: sessionId,
        shop_id: ctx.shopId,
        vehicle_id: session.vehicle_id ?? null,
        job_card_id: session.job_card_id ?? null,
        technician_id: ctx.user.id,
        confirmed_root_cause: parsed.data.confirmedRootCause,
        repair_performed: parsed.data.repairPerformed,
        parts_used: parsed.data.partsUsed,
        labor_hours: parsed.data.laborHours ?? null,
        post_repair_dtcs: parsed.data.postRepairDtcCodes.map((c) => ({ code: c })),
        complaint_resolved: parsed.data.complaintResolved,
        verification_notes: parsed.data.verificationNotes ?? null,
        verified_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (verErr) return NextResponse.json({ error: verErr.message }, { status: 500 });

    // Advance session to REPAIR_VERIFIED
    await ctx.supabase
      .from('diagnostic_sessions')
      .update({ status: 'REPAIR_VERIFIED', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('shop_id', ctx.shopId);

    return NextResponse.json({ verification }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
