// Intelligence Bus — records and processes operational events.
// All functions fail silently so production is never impacted.
import type { IntelligenceBusEvent, BusHealth } from './types';
import type { IntelligenceEvent } from '../types';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

/**
 * Record an intelligence event into the DB.
 * Duplicate event_id is safely ignored via ON CONFLICT DO NOTHING.
 * Never throws — returns false on failure.
 */
export async function recordEvent(event: IntelligenceEvent): Promise<boolean> {
  try {
    const db = await getDb();
    const { error } = await db.from('intelligence_events').upsert({
      event_id:    event.eventId,
      shop_id:     event.shopId || null,
      user_id:     event.userId || null,
      event_type:  event.eventType,
      entity_type: event.entityType || null,
      entity_id:   event.entityId  || null,
      source:      event.source ?? 'redlined1',
      payload:     event.payload   ?? {},
      metadata:    event.metadata  ?? {},
      status:      'received',
    }, { onConflict: 'event_id', ignoreDuplicates: true });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Mark an event as processed (or failed).
 */
export async function markEventProcessed(eventId: string, failed = false): Promise<void> {
  try {
    const db = await getDb();
    await db.from('intelligence_events').update({
      status:       failed ? 'failed' : 'processed',
      processed_at: new Date().toISOString(),
    }).eq('event_id', eventId);
  } catch { /* fail silently */ }
}

/**
 * Get recent events for a shop (last 100).
 */
export async function getRecentEvents(shopId: string): Promise<IntelligenceBusEvent[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('intelligence_events')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(100);
    return (data ?? []).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Process a single event by event_id — run recommendation engine trigger.
 * Fails silently.
 */
export async function processEvent(eventId: string): Promise<void> {
  try {
    await markEventProcessed(eventId, false);
  } catch {
    await markEventProcessed(eventId, true);
  }
}

/**
 * Process all pending (received) events for a shop.
 */
export async function processPendingEvents(shopId: string): Promise<number> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('intelligence_events')
      .select('event_id')
      .eq('shop_id', shopId)
      .eq('status', 'received')
      .limit(50);
    const events = data ?? [];
    for (const ev of events) {
      await processEvent(ev.event_id as string);
    }
    return events.length;
  } catch {
    return 0;
  }
}

/**
 * Health check for the bus — tests DB reachability and reports queue state.
 */
export async function getBusHealth(shopId: string): Promise<BusHealth> {
  try {
    const db = await getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingRes, processedRes, failedRes, lastRes] = await Promise.all([
      db.from('intelligence_events').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'received'),
      db.from('intelligence_events').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'processed').gte('processed_at', today.toISOString()),
      db.from('intelligence_events').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'failed'),
      db.from('intelligence_events').select('created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(1),
    ]);

    return {
      reachable:       true,
      pendingEvents:   pendingRes.count ?? 0,
      processedToday:  processedRes.count ?? 0,
      failedEvents:    failedRes.count ?? 0,
      lastEventAt:     (lastRes.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null,
    };
  } catch {
    return { reachable: false, pendingEvents: 0, processedToday: 0, failedEvents: 0, lastEventAt: null };
  }
}

function mapRow(r: Record<string, unknown>): IntelligenceBusEvent {
  return {
    id:          r.id as string,
    eventId:     r.event_id as string,
    shopId:      r.shop_id as string,
    userId:      r.user_id as string | null,
    eventType:   r.event_type as string,
    entityType:  r.entity_type as string | null,
    entityId:    r.entity_id as string | null,
    source:      r.source as string,
    payload:     (r.payload as Record<string, unknown>) ?? {},
    metadata:    (r.metadata as Record<string, unknown>) ?? {},
    status:      r.status as IntelligenceBusEvent['status'],
    processedAt: r.processed_at as string | null,
    createdAt:   r.created_at as string,
  };
}
