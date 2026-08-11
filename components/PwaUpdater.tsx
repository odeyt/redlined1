'use client';

import { useEffect, useState } from 'react';

/**
 * Registers the service worker and tells the user when a new build is waiting.
 *
 * Three bugs this week were investigated at length against a browser running
 * an older bundle than the one deployed — a stuck walkthrough, a DVI that
 * would not open, an intake that reported success and wrote nothing. In each
 * case the code was already fixed and the tab had simply never been reloaded.
 *
 * A service worker cannot fix that on its own: it controls network handling,
 * not the JavaScript already parsed and running in the page. Only a reload
 * replaces that, so the point of this component is to notice and to ask.
 *
 * Deliberately a prompt rather than an automatic reload. A technician
 * mid-inspection who is silently navigated away loses what they were typing,
 * and losing a technician's work to fix a staleness problem trades one failure
 * for a worse one.
 */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

// Long enough not to matter, short enough that a tab left open across a
// working day picks up a release without anyone thinking about it.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function PwaUpdater() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function watch(reg: ServiceWorkerRegistration) {
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          // `controller` distinguishes an update from the very first install.
          // Prompting on first install would ask a new user to reload a page
          // they just opened.
          if (incoming.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
            setUpdateReady(true);
          }
        });
      });
    }

    // The build id in the URL is what makes a deploy visible to the browser:
    // a script it has not seen before is always fetched and compared.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD)}`)
      .then(reg => {
        if (cancelled) return;
        registration = reg;
        // A worker already waiting when this mounts — the update landed while
        // the tab was in the background.
        if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        watch(reg);
      })
      .catch(() => { /* an unregistrable worker must not break the app */ });

    const check = () => { void registration?.update().catch(() => {}); };
    window.addEventListener('focus', check);
    timer = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
      if (timer) clearInterval(timer);
    };
  }, []);

  function reload() {
    // Ask a waiting worker to take over first, so the reload lands on the new
    // build rather than repeating under the old one.
    navigator.serviceWorker?.getRegistration().then(reg => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }).finally(() => window.location.reload());
  }

  if (!updateReady) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', zIndex: 4000, left: 16, right: 16,
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        margin: '0 auto', maxWidth: 460,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '13px 16px', borderRadius: 14,
        background: 'var(--surface, #0d0d14)',
        border: '1px solid var(--accent, #e03030)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        color: 'var(--text, #e8eaf0)', fontSize: 14,
      }}
    >
      <span style={{ flex: 1, minWidth: 160 }}>A new version of Redlined1 is ready.</span>
      <button
        onClick={reload}
        style={{
          minHeight: 44, padding: '10px 18px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, var(--accent, #e03030), var(--accent-2, #b02020))',
          color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        style={{
          minHeight: 44, padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--btn-border, #2a2a3a)', background: 'transparent',
          color: 'var(--muted, #6b7280)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}
      >
        Later
      </button>
    </div>
  );
}
