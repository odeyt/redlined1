/**
 * POST /api/rib/publish
 *
 * HTTP ingestion endpoint for the Redline Intelligence Bus.
 * Validates the event, persists it to rib_events, and dispatches to handlers.
 *
 * Fixes vs original:
 *   - persistFn is passed per-publish call, not stored on the singleton (D1)
 *   - initializeRibHandlers is NOT called here — handlers must be registered at
 *     process startup via instrumentation.ts or equivalent (D1)
 *   - Event persist happens BEFORE dispatch inside bus.publish() (D2)
 *   - RLS INSERT policy enforces shop membership (enforced in migration)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { intelligenceBus } from '@/lib/intelligence-bus';
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

    if (event.shopId !== ctx.shopId) {
      return NextResponse.json({ error: 'Shop ID mismatch' }, { status: 403 });
    }

    // Build a per-request persist function using this request's Supabase client.
    // It is passed directly to bus.publish() — never stored on the singleton.
    const persistFn = async (e: RibEvent) => {
      const { error } = await ctx.supabase.from('rib_events').insert({
        event_id: e.eventId,
        event_type: e.eventType,
        occurred_at: e.occurredAt,
        organization_id: e.organizationId,
        shop_id: e.shopId,
        technician_id: e.technicianId ?? null,
        vehicle_id: e.vehicleId ?? null,
        diagnostic_session_id: e.diagnosticSessionId ?? null,
        correlation_id: e.correlationId,
        causation_id: e.causationId ?? null,
        event_depth: e.eventDepth,
        origin_module: e.originModule,
        schema_version: e.schemaVersion,
        payload: e as unknown as Record<string, unknown>,
      });
      if (error) {
        console.error('[RIB] persist failed', { eventId: e.eventId, error: error.message });
        throw error;
      }
    };

    const result = await intelligenceBus.publish(event, persistFn);

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      eventType: result.eventType,
      persisted: result.persisted,
      handlerCount: result.handlerCount,
      handlerErrors: result.handlerErrors,
      loopGuardRejected: result.loopGuardRejected,
    });
  } catch (e) {
    console.error('[RIB] publish route error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
