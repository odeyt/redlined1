/**
 * POST /api/rib/replay
 *
 * Replay stored RIB events through the current handler pipeline.
 * Owner-only. Used for:
 *   - Backfilling new intelligence engines with historical data
 *   - Recovering from handler errors
 *   - Testing new handler implementations against real event history
 *
 * Query params:
 *   eventType    — filter by event type (optional)
 *   fromDate     — ISO date string, start of replay window (optional)
 *   toDate       — ISO date string, end of replay window (optional)
 *   limit        — max events to replay (default 100, max 1000)
 *   dryRun       — if true, dispatch but do not re-persist (default false)
 *
 * Gated by 'intelligence_bus' flag. Owner role required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { intelligenceBus } from '@/lib/intelligence-bus';
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

    // Load events from append-only log
    let query = ctx.supabase
      .from('rib_events')
      .select('*')
      .eq('shop_id', ctx.shopId)
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (eventType) query = query.eq('event_type', eventType);
    if (fromDate) query = query.gte('timestamp', fromDate);
    if (toDate) query = query.lte('timestamp', toDate);

    const { data: storedEvents, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!storedEvents?.length) {
      return NextResponse.json({ ok: true, replayed: 0, errors: [] });
    }

    // Wire persistence only when not a dry run
    if (!dryRun) {
      intelligenceBus.setPersistFn(async () => {
        // Replayed events already exist in the log — no re-insert
      });
    }

    const replayResults: Array<{ eventId: string; handlerCount: number; errors: unknown[] }> = [];
    for (const row of storedEvents) {
      const event = row.payload as unknown as RibEvent;
      try {
        const result = await intelligenceBus.publish(event);
        replayResults.push({ eventId: result.eventId, handlerCount: result.handlerCount, errors: result.errors });
      } catch (err) {
        replayResults.push({ eventId: row.event_id, handlerCount: 0, errors: [String(err)] });
      }
    }

    return NextResponse.json({
      ok: true,
      replayed: replayResults.length,
      dryRun,
      results: replayResults,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
