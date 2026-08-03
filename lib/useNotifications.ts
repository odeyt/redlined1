'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getShopIds } from '@/lib/shopStore';

/**
 * Repair-order status notifications.
 *
 * Reads public.ro_status_events, written by a trigger on repair_orders.
 *
 * The previous version kept notifications in a module-level array fed only by a
 * Realtime subscription. Three consequences, all of which showed up as a panel
 * that said "No notifications yet" forever:
 *
 *   - the array started empty on every page load, so only changes made while
 *     that tab was open ever appeared, and a reload erased them
 *   - it depended on Realtime delivering payload.old, which carries the previous
 *     status only when the table has REPLICA IDENTITY FULL — otherwise
 *     "Open → Complete" arrives as "→ Complete"
 *   - if Realtime was not enabled for repair_orders at all, nothing arrived and
 *     nothing said so
 *
 * Reading a table removes all three. Realtime is still used when available,
 * because instant beats eventual — but it is now an optimisation, and a poll
 * covers the case where it is not configured. Read and dismissed state lives in
 * localStorage so the badge behaves across reloads.
 */

export interface RONotification {
  id: string;
  roId: string;
  roNumber: string;
  customer: string;
  vehicle: string;
  oldStatus: string;
  newStatus: string;
  ts: number;
  read: boolean;
}

const STATUS_EMOJI: Record<string, string> = {
  'Open':             '📋',
  'In Progress':      '🔧',
  'Pending Parts':    '📦',
  'Pending Approval': '⏳',
  'Complete':         '✅',
  'Closed':           '🔒',
  'Void':             '🚫',
};

const READ_KEY      = 'rd1_notif_read';
const DISMISSED_KEY = 'rd1_notif_dismissed';
/** How far back the panel looks. Older than this is history, not a notification. */
const LOOKBACK_DAYS = 14;
const POLL_MS       = 60_000;

function loadIds(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveIds(key: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    // Bounded: this is a UI marker, not a record, and an unbounded list would
    // grow forever in a browser that never clears its storage.
    localStorage.setItem(key, JSON.stringify([...ids].slice(-500)));
  } catch { /* private mode or quota — the panel still works, it just forgets */ }
}

function rowToNotification(r: Record<string, unknown>, read: boolean): RONotification {
  return {
    id:        String(r.id),
    roId:      String(r.repair_order_id ?? ''),
    roNumber:  String(r.ro_number ?? r.repair_order_id ?? ''),
    customer:  String(r.customer_name ?? 'Unknown'),
    vehicle:   String(r.vehicle ?? ''),
    oldStatus: String(r.old_status ?? ''),
    newStatus: String(r.new_status ?? ''),
    ts:        new Date(String(r.created_at ?? Date.now())).getTime(),
    read,
  };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<RONotification[]>([]);
  const readIds      = useRef(loadIds(READ_KEY));
  const dismissedIds = useRef(loadIds(DISMISSED_KEY));
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    const shopIds = getShopIds().filter(Boolean);
    if (shopIds.length === 0) return;

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('ro_status_events')
      .select('id, repair_order_id, ro_number, customer_name, vehicle, old_status, new_status, created_at')
      .in('shop_id', shopIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    // A missing table or a denied read leaves the panel empty rather than
    // breaking the sidebar — but it is logged, because failing invisibly is the
    // defining fault of the version this replaces.
    if (error) {
      console.error('[notifications] could not load status events:', error.message);
      return;
    }

    setNotifications(
      (data ?? [])
        .filter(r => !dismissedIds.current.has(String(r.id)))
        .map(r => rowToNotification(r as Record<string, unknown>, readIds.current.has(String(r.id)))),
    );
  }, []);

  useEffect(() => {
    void load();

    // Realtime where it is available; the poll below covers where it is not.
    const channel = supabase
      .channel('ro-status-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ro_status_events' }, () => { void load(); })
      .subscribe();
    channelRef.current = channel;

    const timer = setInterval(() => { void load(); }, POLL_MS);

    // Catching up on focus matters more than the interval: a shop owner returns
    // to the tab after an hour away and expects to see what happened.
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [load]);

  function markAllRead() {
    setNotifications(prev => {
      prev.forEach(n => readIds.current.add(n.id));
      saveIds(READ_KEY, readIds.current);
      return prev.map(n => ({ ...n, read: true }));
    });
  }

  function dismiss(id: string) {
    dismissedIds.current.add(id);
    saveIds(DISMISSED_KEY, dismissedIds.current);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function clearAll() {
    setNotifications(prev => {
      prev.forEach(n => dismissedIds.current.add(n.id));
      saveIds(DISMISSED_KEY, dismissedIds.current);
      return [];
    });
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markAllRead, dismiss, clearAll, STATUS_EMOJI, refresh: load };
}
