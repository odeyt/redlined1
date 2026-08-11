'use client';

import { useEffect, useState } from 'react';
import { useOnline } from '@/lib/useOnline';

/**
 * Tells the shop when the app has lost its server, and when it comes back.
 *
 * The failure this prevents is not a dropped connection — it is a technician
 * marking twenty inspection items on a phone that quietly stopped saving, and
 * finding out an hour later. Losing the network is unavoidable in a workshop;
 * not being told is not.
 *
 * The reconnect notice matters as much as the warning. Without it the only way
 * to know it is safe to save again is to try, and a failed save on a form full
 * of work is exactly the moment people give up and retype it elsewhere.
 */
export function ConnectionStatus() {
  const { isOffline, lastChangeAt } = useOnline();
  const [showRestored, setShowRestored] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (isOffline) { setWasOffline(true); setShowRestored(false); return; }
    if (!wasOffline) return;
    // Came back. Say so, briefly, then get out of the way.
    setShowRestored(true);
    setWasOffline(false);
    const t = setTimeout(() => setShowRestored(false), 6000);
    return () => clearTimeout(t);
  }, [isOffline, lastChangeAt, wasOffline]);

  if (!isOffline && !showRestored) return null;

  const offline = isOffline;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', zIndex: 4500, left: 12, right: 12,
        top: 'max(12px, env(safe-area-inset-top))',
        margin: '0 auto', maxWidth: 520,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 15px', borderRadius: 12, fontSize: 14, fontWeight: 600,
        color: '#fff',
        background: offline ? 'linear-gradient(135deg, #b45309, #92400e)' : 'linear-gradient(135deg, #16a34a, #15803d)',
        boxShadow: '0 14px 36px rgba(0,0,0,0.35)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>{offline ? '⚠' : '✓'}</span>
      <span style={{ flex: 1 }}>
        {offline
          ? 'No connection — your work is still on screen, but nothing is saving. Do not close this page.'
          : 'Back online. Save your work now.'}
      </span>
    </div>
  );
}
