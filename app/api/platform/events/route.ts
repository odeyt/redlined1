/**
 * POST /api/platform/events
 *
 * Ingest a platform event and dispatch it to all subscribed, enabled engines.
 * Internal use only — called from API routes when domain events occur
 * (job card closed, repair verified, vehicle checked in, etc.).
 *
 * The event payload is persisted to rd1_platform_events for full audit.
 * Engine responses (insights) are persisted to rd1_platform_insights.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';

const PlatformEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  entityId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string(),
  schemaVersion: z.literal('1.0'),
});

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

    const body = await req.json();
    const parsed = PlatformEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid event', details: parsed.error.flatten() }, { status: 400 });
    }

    const event = { ...parsed.data, shopId: ctx.shopId };

    // Persist event to audit log
    await ctx.supabase.from('rd1_platform_events').insert({
      event_id: event.eventId,
      event_type: event.eventType,
      shop_id: ctx.shopId,
      entity_id: event.entityId ?? null,
      entity_type: event.entityType ?? null,
      vehicle_id: event.vehicleId ?? null,
      customer_id: event.customerId ?? null,
      technician_id: event.technicianId ?? null,
      payload: event.payload,
      schema_version: event.schemaVersion,
      processed_by: [],
      occurred_at: event.occurredAt,
    });

    // Load feature flags to determine which engines are enabled
    const flags = await getFlags({
      userId: ctx.user.id,
      shopId: ctx.shopId,
      role: ctx.role,
      environment: getCurrentEnvironment(),
    });

    // Dynamically import and dispatch only to enabled engines
    // (lazy import avoids loading all engines on every request)
    const engineResults: Array<{ engineId: string; insightCount: number }> = [];
    const { intelligenceRegistry } = await import('@/lib/platform/IntelligenceRegistry');

    // Configure registry based on current flags (idempotent)
    const engineFlagMap: Record<string, string> = {
      fleet_intelligence: 'fleet_intelligence_enabled',
      predictive_failure: 'predictive_failure_enabled',
      repair_intelligence: 'repair_intelligence_enabled',
      technician_performance: 'technician_performance_enabled',
      vehicle_health_score: 'vehicle_health_score_enabled',
      parts_intelligence: 'parts_intelligence_enabled',
      revenue_intelligence: 'revenue_intelligence_enabled',
      shop_intelligence: 'shop_intelligence_enabled',
      knowledge_graph: 'knowledge_graph_engine_enabled',
    };

    for (const [engineId, flagKey] of Object.entries(engineFlagMap)) {
      if (flags[flagKey]) {
        intelligenceRegistry.enable(engineId);
      } else {
        intelligenceRegistry.disable(engineId);
      }
    }

    // Dispatch to all subscribed enabled engines
    const results = await intelligenceRegistry.dispatch(event as Parameters<typeof intelligenceRegistry.dispatch>[0]);

    // Persist all insights
    for (const result of results) {
      for (const insight of result.insights) {
        await ctx.supabase.from('rd1_platform_insights').upsert({
          insight_id: insight.insightId,
          engine_id: insight.engineId,
          category: insight.category,
          shop_id: insight.shopId,
          entity_id: insight.entityId ?? null,
          entity_type: insight.entityType ?? null,
          title: insight.title,
          summary: insight.summary,
          urgency: insight.urgency,
          confidence: insight.confidence,
          evidence_ids: insight.evidenceIds,
          recommended_actions: insight.recommendedActions,
          is_ai_derived: insight.isAiDerived,
          expires_at: insight.expiresAt ?? null,
          metadata: insight.metadata,
          generated_at: insight.generatedAt,
        }, { onConflict: 'insight_id' });
      }
      engineResults.push({ engineId: result.engineId, insightCount: result.insights.length });
    }

    // Update event with which engines processed it
    await ctx.supabase.from('rd1_platform_events')
      .update({ processed_by: engineResults.map((r) => r.engineId) })
      .eq('event_id', event.eventId);

    return NextResponse.json({ ok: true, enginesDispatched: engineResults.length, engineResults });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
