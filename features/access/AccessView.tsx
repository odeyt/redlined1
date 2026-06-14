'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/useShop';
import { StatCard } from '@/components/StatCard';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';

interface ShopMember {
  userId: string;
  email: string;
  name: string;
  role: string;
  lastSignIn: string | null;
}

export function AccessView() {
  const { shopId, currentShop, role: myRole } = useShop();
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [inviteStatus, setInviteStatus] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? '');
    });
  }, []);

  async function loadMembers() {
    if (!shopId) return;
    setLoading(true);

    const { data: suRows } = await supabase
      .from('shop_users')
      .select('user_id, role')
      .eq('shop_id', shopId);

    if (!suRows || suRows.length === 0) { setLoading(false); return; }

    const userIds = suRows.map((r: Record<string, unknown>) => r.user_id as string);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, updated_at')
      .in('id', userIds);

    const list: ShopMember[] = suRows.map((r: Record<string, unknown>) => {
      const profile = (profiles ?? []).find((p: Record<string, unknown>) => p.id === r.user_id) as Record<string, unknown> | undefined;
      return {
        userId: r.user_id as string,
        email: (profile?.email as string) || (profile?.id as string) || '',
        name: (profile?.full_name as string) || (profile?.email as string) || 'Unknown',
        role: r.role as string,
        lastSignIn: (profile?.updated_at as string) || null,
      };
    });

    setMembers(list);
    setLoading(false);
  }

  useEffect(() => { loadMembers(); }, [shopId]);

  async function handleInvite() {
    if (!inviteEmail || !shopId) return;
    setInviteStatus('Sending…');
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, shopId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setInviteStatus(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      loadMembers();
    } catch (e: unknown) {
      setInviteStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    await fetch('/api/invite', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, shopId, role: newRole }),
    });
    loadMembers();
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this user from the shop?')) return;
    await supabase.from('shop_users')
      .delete()
      .eq('shop_id', shopId)
      .eq('user_id', userId);
    loadMembers();
  }

  const isOwner = myRole === 'owner';
  const me = members.find(m => m.email === currentUserEmail);
  const displayName = me?.name && me.name !== me.email
    ? me.name
    : currentUserEmail.split('@')[0] || '—';

  return (
    <>
      <div className="grid cols-4">
        <StatCard label="Signed in as" value={displayName} subtext={myRole === 'owner' ? 'Owner · ' + currentUserEmail : 'Manager · ' + currentUserEmail} />
        <StatCard label="Shop" value={currentShop?.name || '—'} subtext="Active location" />
        <StatCard label="Team members" value={members.length} subtext="In this shop" />
        <StatCard label="Session" value="Active" subtext="Authenticated" />
      </div>

      {isOwner && (
        <Panel title="Invite User" hint="Send an invite email to add staff to this shop">
          <div className="form-row">
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="staff@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="technician">Technician</option>
                <option value="advisor">Service Advisor</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn primary" onClick={handleInvite}>
                Send Invite
              </button>
            </div>
          </div>
          {inviteStatus && (
            <p style={{ marginTop: 8, fontSize: 13, color: inviteStatus.startsWith('Error') ? '#e74c3c' : '#27ae60' }}>
              {inviteStatus}
            </p>
          )}
        </Panel>
      )}

      <Panel title="Team Members" hint={`Users with access to ${currentShop?.name || 'this shop'}`}>
        {loading ? (
          <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No members found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>You</th>
                {isOwner && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.userId}>
                  <td>{m.email}</td>
                  <td><Badge text={m.role} /></td>
                  <td>{m.email === currentUserEmail ? '✓' : ''}</td>
                  {isOwner && (
                    <td>
                      <div className="row-actions">
                        {m.email !== currentUserEmail ? (
                          <>
                            <select
                              value={m.role}
                              onChange={e => handleRoleChange(m.userId, e.target.value)}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
                            >
                              <option value="technician">Technician</option>
                              <option value="advisor">Service Advisor</option>
                              <option value="manager">Manager</option>
                              <option value="owner">Owner</option>
                            </select>
                            <button
                              className="mini-btn"
                              style={{ color: '#e74c3c' }}
                              onClick={() => handleRemove(m.userId)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>You</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
