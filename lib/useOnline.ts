'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether the app can actually reach its server.
 *
 * navigator.onLine is only trustworthy in one direction. False means the
 * device has no network and is reliable. True means "attached to something" —
 * a shop wifi access point that has lost its uplink reports true, which is
 * exactly the situation a technician in a workshop hits most often. So a
 * claimed-online state is confirmed by actually fetching something.
 *
 * /api/ping is the probe: it is public, returns no-store, and is already used
 * to identify the running build, so it costs nothing extra to keep alive.
 *
 * Polling only runs while the tab is visible. A phone in someone's pocket
 * should not be waking the radio every thirty seconds.
 */

const POLL_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;

export type Connection = 'online' | 'offline' | 'checking';

export function useOnline() {
  // Starts optimistic: rendering an offline warning for a moment on every load
  // would train people to ignore it.
  const [status, setStatus] = useState<Connection>('online');
  const [lastChangeAt, setLastChangeAt] = useState<number>(() => Date.now());
  const statusRef = useRef<Connection>('online');

  const set = useCallback((next: Connection) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
    setLastChangeAt(Date.now());
  }, []);

  const probe = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set('offline');
      return;
    }
    try {
      const res = await fetch('/api/ping', {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      set(res.ok ? 'online' : 'offline');
    } catch {
      // A timeout, a DNS failure, or a captive portal that never answers.
      set('offline');
    }
  }, [set]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void probe(); }, POLL_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { void probe(); start(); }
      else stop();
    };

    // The browser's own events are the fastest signal; the probe confirms them.
    const onOffline = () => set('offline');
    const onOnline = () => { set('checking'); void probe(); };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    void probe();
    if (document.visibilityState === 'visible') start();

    return () => {
      stop();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [probe, set]);

  return { status, isOnline: status === 'online', isOffline: status === 'offline', lastChangeAt, recheck: probe };
}

/**
 * A one-shot check for the moment before a write that must not be attempted
 * blind — raising an invoice, taking a payment.
 *
 * Deliberately not the polled status: that can be up to thirty seconds stale,
 * and "the network was fine half a minute ago" is not a good enough reason to
 * start writing financial records.
 */
export async function confirmOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch('/api/ping', {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
