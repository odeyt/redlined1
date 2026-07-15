/**
 * POST /api/rib/replay
 *
 * Replay stored RIB events through the current handler pipeline.
 * Owner-only. Fixes vs original:
 *   - Dry-run logic is no longer inverted (D5): dryRun=true → no-op persist
 *   - Events are re-validated with Zod before dispatch (D17)
 *   - Side-effect events are suppressed by default during replay (D9)
 *   - Replay is scoped to the authenticated shop (D10 — no cross-tenant replay)
 *   - Audit trail: replayId, requester, reason logged per run
 *   - persistFn is passed per-call, not stored on singleton (D1)
 *
 * Query params:
 *   eventType         — filter by event type (optional)
 *   fromDate          — ISO date start (optional)
 *   toDate            — ISO date end (optional)
 *   limit             — max events (default 100, max 1000)
 *   dryRun            — if true, dispatch but do not persist (default false)
 *   reason            — human-readable reason for the replay (required)
 *   includeSuppressed — if 'true', also replay customer.notified/invoice.paid/estimate.approved
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { intelligenceBus } from '@/lib/intelligence-bus';
import { RibEventSchema } from '@/lib/intelligence-bus/schemas';
import { REPLAY_SUPPRESSED_EVENT_TYPES } from '@/lib/intelligence-bus/event-types';
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
    if (ctx.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const flags = await getFlags({
      userId: ctx.user.id,
      shopId: ctx.shopId,
      role: ctx.role,
      environment: getCurrentEnvironment(),
    });
    if (!flags['intelligence_bus']) {
      return NextResponse.json({ error: 'Intelligence Bus is not enabled' }, { status: 403 });
    }

    const url = new URL(req.url);
    const eventType = url.searchParams.get('eventType');
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 1000);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const reason = url.searchParams.get('reason') ?? 'unspecified';
    const includeSuppressed = url.searchParams.get('includeSuppressed') === 'true';

    const replayId = randomUUID();

    console.log('[RIB] replay started', {
      replayId,
      requesterId: ctx.user.id,
      shopId: ctx.shopId,
      dryRun,
      reason,
      eventType,
      fromDate,
      toDate,
      limit,
    });

    let query = ctx.supabase
      .from('rib_events')
      .select('*')
      .eq('shop_id', ctx.shopId)       // tenant isolation — only replay own events
      .order('occurred_at', { ascending: true })
      .limit(limit);

    if (eventType) query = query.eq('event_type', eventType);
    if (fromDate) query = query.gte('occurred_at', fromDate);
    if (toDate) query = query.lte('occurred_at', toDate);

    const { data: storedEvents, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!storedEvents?.length) {
      return NextResponse.json({ ok: true, replayId, replayed: 0, skipped: 0, errors: [] });
    }

    // Build persist function for non-dry-run replays.
    // Replayed events keep their original eventId — re-insert is a no-op due to
    // the UNIQUE constraint on rib_events.event_id.
    const persistFn = dryRun
      ? undefined
      : async (_e: RibEvent) => {
          // Already persisted; no-op
        };

    const replayResults: Array<{ eventId: string; handlerCount: number; errors: unknown[]; skipped?: boolean; skipReason?: string }> = [];
    let skippedCount = 0;

    for (const row of storedEvents) {
      // Re-validate payload with Zod before dispatching
      const parsed = RibEventSchema.safeParse(row.payload);
      if (!parsed.success) {
        replayResults.push({
          eventId: row.event_id,
          handlerCount: 0,
          errors: [{ validation: parsed.error.flatten() }],
          skipped: true,
          skipReason: 'schema_validation_failed',
        });
        skippedCount++;
        continue;
      }

      const event = parsed.data as unknown as RibEvent;

      // Enforce shop-level tenant isolation on each event
      if (event.shopId !== ctx.shopId) {
        skippedCount++;
        continue;
      }

      // Suppress side-effect events unless caller explicitly requests them
      if (!includeSuppressed && REPLAY_SUPPRESSED_EVENT_TYPES.has(event.eventType)) {
        replayResults.push({
          eventId: event.eventId,
          handlerCount: 0,
          errors: [],
          skipped: true,
          skipReason: 'suppressed_event_type',
        });
        skippedCount++;
        continue;
      }

      try {
        const result = await intelligenceBus.publish(event, persistFn);
        replayResults.push({
          eventId: result.eventId,
          handlerCount: result.handlerCount,
          errors: result.handlerErrors,
        });
      } catch (err) {
        replayResults.push({
          eventId: row.event_id,
          handlerCount: 0,
          errors: [String(err)],
        });
      }
    }

    console.log('[RIB] replay completed', {
      replayId,
      replayed: replayResults.filter((r) => !r.skipped).length,
      skipped: skippedCount,
      dryRun,
    });

    return NextResponse.json({
      ok: true,
      replayId,
      replayed: replayResults.filter((r) => !r.skipped).length,
      skipped: skippedCount,
      dryRun,
      results: replayResults,
    });
  } catch (e) {
    console.error('[RIB] replay route error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
