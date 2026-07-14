/**
 * POST /api/diagnostics/sessions
 * Create a new diagnostic session. Requires diagnostic_orchestrator_enabled flag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags } from '@/lib/featureFlags/featureFlagService';
import { getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { CreateDiagnosticSessionSchema } from '@/lib/diagnostics/schemas';

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

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flags = await getFlags({ userId: ctx.user.id, shopId: ctx.shopId, role: ctx.role, environment: getCurrentEnvironment() });
    if (!flags['diagnostic_orchestrator_enabled']) {
      return NextResponse.json({ error: 'Diagnostic Orchestrator is not enabled for this shop.' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateDiagnosticSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { shopId, technicianId, vehicleId, jobCardId, isSimulated } = parsed.data;

    // Enforce shop isolation — caller's shop must match
    if (shopId !== ctx.shopId) {
      return NextResponse.json({ error: 'Shop ID mismatch' }, { status: 403 });
    }

    const { data, error } = await ctx.supabase
      .from('diagnostic_sessions')
      .insert({
        shop_id: shopId,
        technician_id: technicianId,
        vehicle_id: vehicleId ?? null,
        job_card_id: jobCardId ?? null,
        is_simulated: isSimulated ?? true,
        status: 'CASE_CREATED',
        vehicle_payload: {},
        schema_version: '1.0',
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const flags = await getFlags({ userId: ctx.user.id, shopId: ctx.shopId, role: ctx.role, environment: getCurrentEnvironment() });
    if (!flags['diagnostic_orchestrator_enabled']) {
      return NextResponse.json({ sessions: [] });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    const { data, error } = await ctx.supabase
      .from('diagnostic_sessions')
      .select('*')
      .eq('shop_id', ctx.shopId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
