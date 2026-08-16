'use client';

/**
 * Asks, once, for the thing that cannot be switched on centrally.
 *
 * Push is per device and per browser: there is no server-side way to enable
 * it for staff, because the subscription can only be created by the browser
 * on the phone in that person's pocket. The toggle for it has always existed
 * — buried in Settings, which technicians mostly cannot open. One of eleven
 * people had it on.
 *
 * So this asks where people already are. Rules it follows, each of which is
 * the difference between a prompt and a nuisance:
 *
 *   - Never calls Notification.requestPermission on render. An unprompted
 *     permission dialog is the fastest route to a permanent block, and on iOS
 *     a denial can only be undone in system Settings, not in the app.
 *   - Dismissible, and the dismissal sticks per device.
 *   - Silent once push is on, and silent on a device that cannot do push at
 *     all — except on an iPhone in Safari, where the fix (install to the Home
 *     Screen) is something the person can actually act on.
 */
import { useEffect, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { enablePush, isPushEnabled, pushSupport } from '@/lib/push/subscribe';

const DISMISSED_KEY = 'redlined1-push-prompt-dismissed';

type State =
  | { kind: 'hidden' }
  | { kind: 'ask' }
  | { kind: 'install'; reason: string };

export function PushPrompt() {
  const { shopId, role, loading } = useShop();
  const [state, setState] = useState<State>({ kind: 'hidden' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !role || !shopId) return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    const support = pushSupport();
    if (!support.supported) {
      // Only worth showing when there is something to do about it. A desktop
      // browser that simply has no push support gets nothing.
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && 'serviceWorker' in navigator) {
        setState({ kind: 'install', reason: support.reason });
      }
      return;
    }

    isPushEnabled()
      .then(on => { if (!on) setState({ kind: 'ask' }); })
      .catch(() => { /* a failed check is not a reason to nag */ });
  }, [loading, role, shopId]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setState({ kind: 'hidden' });
  }

  async function turnOn() {
    setBusy(true);
    setError('');
    try {
      await enablePush(shopId);
      // Dismissed as well as hidden: a device that later loses its
      // subscription should not be nagged again on the next load.
      localStorage.setItem(DISMISSED_KEY, 'true');
      setState({ kind: 'hidden' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'hidden') return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 70,
        maxWidth: 520, margin: '0 auto',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 12, padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        display: 'grid', gap: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1.2 }}>🔔</span>
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>
          {state.kind === 'ask' ? (
            <>
              <strong>Get alerts when the app is closed.</strong>
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                Jobs assigned to you, work added, parts arriving. This device only —
                each phone is turned on separately.
              </div>
            </>
          ) : (
            <>
              <strong>Add Redlined1 to your Home Screen.</strong>
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                Tap Share, then “Add to Home Screen”, and open it from there.
                iPhone only sends notifications to the installed app.
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="mini-btn" onClick={dismiss} style={{ minHeight: 44 }}>
          {state.kind === 'ask' ? 'Not now' : 'Got it'}
        </button>
        {state.kind === 'ask' && (
          <button
            type="button" className="btn btn-primary" onClick={turnOn} disabled={busy}
            style={{ minHeight: 44 }}
          >
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
        )}
      </div>
    </div>
  );
}
