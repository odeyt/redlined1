/**
 * POST /api/rib/publish
 *
 * HTTP ingestion endpoint for the Redline Intelligence Bus.
 * Accepts a typed RibEvent, validates it, dispatches to all subscribed handlers,
 * and persists to the append-only rib_events audit log.
 *
 * Internal use only — called from API routes, the diagnostic bridge,
 * and future mobile / cloud worker integrations.
 *
 * Gated by the 'intelligence_bus' feature flag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { intelligenceBus, initializeRibHandlers } from '@/lib/intelligence-bus';
import { RibEventSchema } from '@/lib/intelligence-bus/schemas';
import type { RibEvent } from '@/lib/intelligence-bus/event-types';

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

    // Feature flag gate
    const flags = await getFlags({
      userId: ctx.user.id,
      shopId: ctx.shopId,
      role: ctx.role,
      environment: getCurrentEnvironment(),
    });
    if (!flags['intelligence_bus']) {
      return NextResponse.json({ error: 'Intelligence Bus is not enabled' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = RibEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid RIB event', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const event = parsed.data as unknown as RibEvent;

    // Enforce tenant isolation — event must belong to the authenticated shop
    if (event.shopId !== ctx.shopId) {
      return NextResponse.json({ error: 'Shop ID mismatch' }, { status: 403 });
    }

    // Wire persistence to this request's Supabase client (server-side, service role not needed)
    intelligenceBus.setPersistFn(async (e: RibEvent) => {
      await ctx.supabase.from('rib_events').insert({
        event_id: e.eventId,
        event_type: e.eventType,
        timestamp: e.timestamp,
        organization_id: e.organizationId,
        shop_id: e.shopId,
        technician_id: e.technicianId ?? null,
        vehicle_id: e.vehicleId ?? null,
        diagnostic_session_id: e.diagnosticSessionId ?? null,
        correlation_id: e.correlationId,
        schema_version: e.schemaVersion,
        payload: e as unknown as Record<string, unknown>,
        processed_by: [],
      });
    });

    // Initialize handlers based on live flags
    initializeRibHandlers(intelligenceBus, {
      diagnostic_orchestrator_enabled: flags['diagnostic_orchestrator_enabled'] ?? false,
      fleet_intelligence_enabled: flags['fleet_intelligence_enabled'] ?? false,
      predictive_failure_enabled: flags['predictive_failure_enabled'] ?? false,
      vehicle_health_score_enabled: flags['vehicle_health_score_enabled'] ?? false,
      technician_performance_enabled: flags['technician_performance_enabled'] ?? false,
      revenue_intelligence_enabled: flags['revenue_intelligence_enabled'] ?? false,
    });

    const result = await intelligenceBus.publish(event);

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      eventType: result.eventType,
      persisted: result.persisted,
      handlerCount: result.handlerCount,
      errors: result.errors,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
