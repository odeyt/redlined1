/**
 * Reads alert_events. Nothing writes here from the client by design — the
 * triggers own that, so an alert cannot be fabricated or edited after the
 * fact.
 *
 * RLS already decides who sees a row (addressed to the user, to their role, or
 * to the whole shop), so this does not re-filter by recipient. Doing it in
 * both places would mean two rules to keep in step, and the client's copy
 * would be the one that quietly drifted.
 */
import { supabase } from '@/lib/supabase';
import { getShopIds } from '@/lib/shopStore';

export interface AlertEvent {
  id: string;
  eventType: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

/** How far back the feed looks. Older than this is history, not an alert. */
const LOOKBACK_DAYS = 14;

export async function fetchAlertEvents(limit = 50): Promise<AlertEvent[]> {
  const shopIds = getShopIds().filter(Boolean);
  if (shopIds.length === 0) return [];

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('alert_events')
    .select('id, event_type, title, body, entity_type, entity_id, created_at')
    .in('shop_id', shopIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Logged, not swallowed. A notification feed that fails silently is the
  // exact fault the repair-order panel had before it was rebuilt.
  if (error) {
    console.error('[alerts] could not load alert events:', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    id: String(r.id),
    eventType: String(r.event_type ?? ''),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    entityType: String(r.entity_type ?? ''),
    entityId: String(r.entity_id ?? ''),
    createdAt: String(r.created_at ?? ''),
  }));
}
