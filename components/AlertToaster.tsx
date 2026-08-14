'use client';

/**
 * Live toasts for alerts, while the app is open.
 *
 * Reads alert_events and nothing else. That is a correctness requirement, not
 * a simplification:
 *
 * The first version also called useNotifications() to toast repair-order
 * status changes. Sidebar ALREADY calls that hook, so the app ended up with
 * two instances, each opening a Supabase Realtime channel on the same topic
 * ('ro-status-events'). supabase-js does not tolerate two subscriptions to one
 * topic, and because this component renders on every authenticated screen, the
 * failure took the whole shell down — production showed the error boundary to
 * every signed-in user while the login page stayed fine.
 *
 * So: one feed, one channel, one subscriber. Repair-order status changes reach
 * here as ro.status_changed rows in alert_events, emitted by a trigger, rather
 * than by subscribing to a second table. The notifications PANEL keeps using
 * useNotifications and ro_status_events, untouched.
 *
 * Do not add another hook here that opens a channel. If this needs a second
 * source, give it a distinct topic name and check nothing else already
 * subscribes to it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { fetchAlertEvents, type AlertEvent } from '@/services/alertEventService';
import { isAlertEnabled, type AlertPreferences, type AlertRole } from '@/lib/alerts/catalogue';

/** Realtime where available; the poll covers where it is not. */
const POLL_MS = 60_000;

const EVENT_ICON: Record<string, string> = {
  'ro.status_changed': '🔧',
  'ro.pending_approval': '⏳',
  'job.assigned': '📋',
  'inspection.completed': '🔍',
  'estimate.approved': '👍',
  'parts.received': '📦',
  'invoice.paid': '💰',
};

const ALERT_ROLES_SET = new Set<AlertRole>(['owner', 'manager', 'advisor', 'technician']);

export function AlertToaster() {
  const { role, loading } = useShop();
  const dispatch = useAppDispatch();

  const [prefs, setPrefs] = useState<AlertPreferences>({});

  /**
   * Ids present before this component started caring. Null until the first
   * batch arrives, which distinguishes "nothing has loaded yet" from "there
   * genuinely are no events" — the difference between staying quiet and
   * announcing a fortnight of backlog on every page load.
   */
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShopSettings()
      .then(s => { if (!cancelled) setPrefs(s.alertPreferences ?? {}); })
      // Preferences failing to load must not silence alerts: an empty object
      // means everything is on, which is the safer failure here. Losing an
      // alert is worse than showing one somebody muted.
      .catch(() => { if (!cancelled) setPrefs({}); });

    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { alertPreferences?: AlertPreferences } | undefined;
      if (detail?.alertPreferences) setPrefs(detail.alertPreferences);
    };
    window.addEventListener('shop-settings-updated', onUpdate);
    return () => { cancelled = true; window.removeEventListener('shop-settings-updated', onUpdate); };
  }, []);

  const announce = useCallback((events: AlertEvent[], forRole: AlertRole) => {
    if (seen.current === null) {
      seen.current = new Set(events.map(e => e.id));
      return;
    }
    const fresh = events.filter(e => !seen.current!.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach(e => seen.current!.add(e.id));

    const wanted = fresh.filter(e => isAlertEnabled(prefs, forRole, e.eventType));
    if (wanted.length === 0) return;

    // Newest first from the query; announce oldest first so the most recent
    // ends on top. Capped — five landing at once is a bulk update, not five
    // things worth reading.
    const toAnnounce = wanted.slice(0, 3).reverse();
    for (const e of toAnnounce) {
      dispatch({
        type: 'NOTIFY',
        message: `${EVENT_ICON[e.eventType] ?? '🔔'} ${e.title}${e.body ? ` · ${e.body}` : ''}`,
      });
    }
    if (wanted.length > toAnnounce.length) {
      dispatch({ type: 'NOTIFY', message: `…and ${wanted.length - toAnnounce.length} more alerts` });
    }
  }, [dispatch, prefs]);

  useEffect(() => {
    if (loading || !role || !ALERT_ROLES_SET.has(role as AlertRole)) return;
    const forRole = role as AlertRole;
    let stopped = false;

    const load = async () => {
      const events = await fetchAlertEvents();
      if (!stopped) announce(events, forRole);
    };
    void load();

    // 'alerts-toaster', not 'alert-events': the topic is named for the
    // subscriber, so a second reader of this table cannot collide with it the
    // way this component once collided with Sidebar.
    const channel = supabase
      .channel('alerts-toaster')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_events' }, () => { void load(); })
      .subscribe();

    const timer = setInterval(() => { void load(); }, POLL_MS);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [loading, role, announce]);

  return null;
}
