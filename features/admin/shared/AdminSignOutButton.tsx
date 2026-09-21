'use client';
/**
 * features/admin/shared/AdminSignOutButton.tsx
 * Signs the platform owner out of the owner-admin portal. The admin pages render
 * outside the app shell, so the Sidebar's sign-out is not reachable from here.
 *
 * Uses the same lib/auth signOut() as the Sidebar. The browser Supabase client
 * keeps its session in cookies, and those cookies are exactly what
 * requirePlatformOwnerPage() reads. After signing out this does a full page load
 * of /login rather than a client-side route change, so no owner data rendered in
 * this tab survives in memory, and any /admin URL reached afterwards is guarded
 * from scratch. The session is only ended here, never changed.
 */
import { useState } from 'react';
import { signOut } from '@/lib/auth';
import { C } from './theme';

function goToLogin() {
  window.location.assign('/login');
}

export function AdminSignOutButton({ onSignedOut = goToLogin }: { onSignedOut?: () => void }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await signOut();
    } catch {
      // Still signed in: say so rather than navigating away as if it worked.
      setFailed(true);
      setPending(false);
      return;
    }
    onSignedOut();
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={pending}
        style={{
          padding: '6px 12px', borderRadius: 6, fontSize: 12,
          border: `1px solid ${C.border}`, background: 'transparent', color: C.muted,
          cursor: pending ? 'default' : 'pointer',
        }}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {failed && (
        <span role="alert" style={{ fontSize: 11, color: C.danger }}>
          Sign out failed — try again
        </span>
      )}
    </span>
  );
}
