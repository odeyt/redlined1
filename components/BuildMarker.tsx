'use client';

/**
 * Which build is this browser actually running, and does it match the server?
 *
 * Most of a day went into a bug that turned out to be a browser running
 * pre-M1 JavaScript while the server served the current build. Every theory
 * along the way was reasonable and wrong, because the one fact that would have
 * settled it in seconds — the version in the page versus the version on the
 * server — could only be recovered by reading a network trace.
 *
 * `NEXT_PUBLIC_BUILD_ID` is fixed into the bundle at build time, so it
 * describes the JavaScript that is running right now. `/api/ping` reports what
 * the server is serving, uncached. When they disagree, the browser is stale —
 * and that is a fact, not an inference.
 *
 * PwaUpdater already asks people to reload when a NEW worker installs. This is
 * for the case it cannot see: an old worker that never updates, so no
 * `updatefound` ever fires and nothing prompts. The reset below is the manual
 * escape hatch — unregister, clear caches, reload — which is exactly the
 * sequence that took several messages to walk through by hand.
 */
import { useEffect, useState } from 'react';

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

type ServerState =
  | { status: 'checking' }
  | { status: 'ok'; commit: string }
  | { status: 'unreachable' };

export function BuildMarker() {
  const [server, setServer] = useState<ServerState>({ status: 'checking' });
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // cache: 'no-store' as well as the route's own no-store header: a cached
    // version endpoint reports the build it was cached from, which is the
    // exact failure this exists to detect.
    fetch('/api/ping', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setServer({ status: 'ok', commit: String(d.commit ?? '?') }); })
      .catch(() => { if (!cancelled) setServer({ status: 'unreachable' }); });
    return () => { cancelled = true; };
  }, []);

  /**
   * Everything that can pin a browser to an old build, in one action.
   *
   * Unregistering the worker matters most: an old worker can serve a cached
   * page shell that references old chunks AND re-registers itself, so every
   * reload renews the loop. Caches go too, because the shell may be in one.
   * Neither can be fixed by reloading, which is why this button exists.
   */
  async function reset() {
    setResetting(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister().catch(() => false)));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
      }
    } catch {
      // Reload anyway: a partial clean-up still stands a chance, and leaving
      // somebody on a stale build because the tidy-up failed helps nobody.
    }
    window.location.reload();
  }

  const stale = server.status === 'ok' && server.commit !== BUILD && BUILD !== 'dev';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <span>
          <span style={{ color: 'var(--muted)' }}>This device: </span>
          <code style={{ fontWeight: 700 }}>{BUILD}</code>
        </span>
        <span>
          <span style={{ color: 'var(--muted)' }}>Server: </span>
          <code style={{ fontWeight: 700 }}>
            {server.status === 'ok' ? server.commit
              : server.status === 'checking' ? '…'
              : 'unreachable'}
          </code>
        </span>
      </div>

      {stale ? (
        <div style={{
          display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)',
        }}>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <strong>This device is running an old version.</strong>
            <div style={{ color: 'var(--muted)', marginTop: 2 }}>
              Anything fixed since <code>{BUILD}</code> will still look broken here,
              and new features will be missing.
            </div>
          </div>
          <div>
            <button className="btn btn-primary" onClick={reset} disabled={resetting} style={{ minHeight: 44 }}>
              {resetting ? 'Updating…' : 'Update this device'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
          {server.status === 'ok' && !stale
            ? 'Up to date.'
            : 'Version check unavailable — this device may still be up to date.'}
          {' '}If something looks wrong after an update, use this to force a refresh:
          <div style={{ marginTop: 8 }}>
            <button className="mini-btn" onClick={reset} disabled={resetting} style={{ minHeight: 44 }}>
              {resetting ? 'Updating…' : 'Force update'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
