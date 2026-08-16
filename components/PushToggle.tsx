'use client';

/**
 * Turning push on for THIS device.
 *
 * Per device, not per account, and the wording says so — someone who enables
 * it on the shop computer and then wonders why their phone is silent has been
 * misled by the label, not by the feature.
 *
 * The button never fires on load. A permission prompt nobody asked for is the
 * fastest way to a permanent denial, and on iOS that can only be undone in
 * Settings, not in the app.
 */
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { enablePush, disablePush, isPushEnabled, pushSupport } from '@/lib/push/subscribe';

export function PushToggle() {
  const { shopId } = useShop();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState('');

  useEffect(() => {
    const support = pushSupport();
    if (!support.supported) { setUnsupported(support.reason); setEnabled(false); return; }
    isPushEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
      } else {
        await enablePush(shopId);
        setEnabled(true);
      }
    } catch (e: unknown) {
      // Every failure path in enablePush throws something a person can act on
      // — blocked permission, iOS needing the installed app, a missing key.
      setError(e instanceof Error ? e.message : 'Could not change notification settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Alerts already appear while the app is open. Turn this on to be notified
        on <strong style={{ color: 'var(--text)' }}>this device</strong> when it is closed.
        Each phone or computer has to be turned on separately.
      </div>

      {unsupported ? (
        <div style={{ fontSize: 12, color: 'var(--warn)', lineHeight: 1.5 }}>{unsupported}</div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={enabled ? 'mini-btn' : 'btn btn-primary'}
            onClick={toggle}
            disabled={busy || enabled === null}
            style={{ minHeight: 44 }}
          >
            {enabled === null ? 'Checking…'
              : busy ? 'Working…'
              : enabled ? 'Turn off on this device'
              : 'Enable notifications on this device'}
          </button>
          {enabled && (
            <span style={{ fontSize: 12, color: 'var(--green)' }}>
              On for this device.
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>{error}</div>
      )}
    </div>
  );
}
