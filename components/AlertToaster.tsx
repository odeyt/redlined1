'use client';

/**
 * Live toasts for alerts, while the app is open.
 *
 * Rides on useNotifications, which already reads ro_status_events with a
 * Realtime subscription and a poll fallback. Nothing new is fetched here; this
 * decides which of those events the person looking at the screen should be
 * interrupted for.
 *
 * Two rules do most of the work:
 *
 *   1. Only events that arrive AFTER this mounts are toasted. The hook returns
 *      up to fifty recent events on first load; toasting those would fire a
 *      wall of popups on every page load and train everyone to ignore them.
 *   2. The role's preferences decide. Absent preferences mean everything is
 *      on, so a shop that has never opened the settings screen still gets
 *      alerts — which is what "on by default" has to mean in practice.
 */
import { useEffect, useRef, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { useNotifications } from '@/lib/useNotifications';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { isAlertEnabled, type AlertPreferences, type AlertRole } from '@/lib/alerts/catalogue';

const ALERT_ROLES_SET = new Set<AlertRole>(['owner', 'manager', 'advisor', 'technician']);

export function AlertToaster() {
  const { role, loading } = useShop();
  const dispatch = useAppDispatch();
  const { notifications, STATUS_EMOJI } = useNotifications();

  const [prefs, setPrefs] = useState<AlertPreferences>({});

  /**
   * Ids present before this component started caring. Undefined until the
   * first batch arrives, which is what distinguishes "nothing has loaded yet"
   * from "there genuinely are no events" — the difference between staying
   * quiet and toasting the entire backlog.
   */
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShopSettings()
      .then(s => { if (!cancelled) setPrefs(s.alertPreferences ?? {}); })
      // Preferences failing to load must not silence alerts: an empty object
      // means everything is on, which is the safer failure for a notification
      // system. Losing an alert is worse than showing one someone muted.
      .catch(() => { if (!cancelled) setPrefs({}); });

    // Settings saves broadcast this, so a change applies without a reload.
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { alertPreferences?: AlertPreferences } | undefined;
      if (detail?.alertPreferences) setPrefs(detail.alertPreferences);
    };
    window.addEventListener('shop-settings-updated', onUpdate);
    return () => { cancelled = true; window.removeEventListener('shop-settings-updated', onUpdate); };
  }, []);

  useEffect(() => {
    if (loading || !role || !ALERT_ROLES_SET.has(role as AlertRole)) return;

    // First batch: remember it, announce nothing.
    if (seen.current === null) {
      seen.current = new Set(notifications.map(n => n.id));
      return;
    }

    const fresh = notifications.filter(n => !seen.current!.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach(n => seen.current!.add(n.id));

    if (!isAlertEnabled(prefs, role as AlertRole, 'ro.status_changed')) return;

    // Newest first from the hook; announce oldest first so the most recent
    // ends up on top, and cap it — five status changes landing at once is a
    // bulk update, not five things worth reading.
    const toAnnounce = fresh.slice(0, 3).reverse();
    for (const n of toAnnounce) {
      const icon = STATUS_EMOJI[n.newStatus] ?? '🔔';
      dispatch({
        type: 'NOTIFY',
        message: `${icon} ${n.roNumber} → ${n.newStatus}${n.vehicle ? ` · ${n.vehicle}` : ''}`,
      });
    }
    if (fresh.length > toAnnounce.length) {
      dispatch({ type: 'NOTIFY', message: `…and ${fresh.length - toAnnounce.length} more updates` });
    }
  }, [notifications, role, loading, prefs, dispatch, STATUS_EMOJI]);

  return null;
}
