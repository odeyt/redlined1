'use client';

/**
 * Who is reachable when the app is closed, and who is not.
 *
 * Push is the one part of alerts an owner cannot set up for their staff: the
 * subscription is created by the browser on each person's own phone. The only
 * useful thing to offer is visibility — the list of who still has to do it —
 * because otherwise "alerts are working" and "one person out of eleven gets
 * them" look exactly the same from the owner's screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { authedFetch } from '@/lib/apiClient';
import { errorMessage } from '@/lib/errorMessage';

interface Member {
  userId: string;
  role: string;
  email: string;
  devices: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', advisor: 'Service Advisor', technician: 'Technician',
};

export function PushCoverage() {
  const { shopId } = useShop();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const res = await authedFetch(`/api/push/coverage?shopId=${encodeURIComponent(shopId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setMembers(json.members ?? []);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div style={{ fontSize: 12, color: 'var(--danger)' }}>Could not load: {error}</div>;
  if (!members) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Checking…</div>;

  const covered = members.filter(m => m.devices > 0).length;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        <strong>{covered} of {members.length}</strong> can be reached when the app is closed.
        {covered < members.length && (
          <span style={{ color: 'var(--muted)' }}>
            {' '}Everyone else gets alerts only while they have Redlined1 open.
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        {members.map(m => (
          <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ROLE_LABEL[m.role] ?? m.role}</div>
            </div>
            {m.devices > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2e7d32', whiteSpace: 'nowrap' }}>
                ✓ {m.devices} device{m.devices > 1 ? 's' : ''}
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Not set up
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        Each person turns this on themselves, on each phone they want alerts on:
        open Redlined1, and tap <strong>Turn on notifications</strong> when it asks.
        On iPhone it has to be added to the Home Screen first — notifications do
        not work from Safari.
      </div>
    </div>
  );
}
