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
  const [lastCredentials, setLastCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? '');
    });
  }, []);

  async function loadMembers() {
    if (!shopId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/members?shopId=${shopId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMembers(json.members ?? []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, [shopId]);

  async function handleInvite() {
    if (!inviteEmail || !shopId) return;
    setInviteStatus('Sending…');
    setLastCredentials(null);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, shopId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setInviteStatus(`Invite sent to ${json.email}`);
      setLastCredentials({ email: json.email, password: json.tempPassword });
      setInviteEmail('');
      setCopied(false);
      loadMembers();
    } catch (e: unknown) {
      setInviteStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    }
  }

  function copyPassword() {
    if (!lastCredentials) return;
    navigator.clipboard.writeText(lastCredentials.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
  const displayName = currentUserEmail.split('@')[0] || '—';

  return (
    <>
      <div className="grid cols-4">
        <StatCard label="Signed in as" value={displayName} subtext={`${myRole.charAt(0).toUpperCase() + myRole.slice(1) || 'Loading…'} · ${currentUserEmail}`} />
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
          {lastCredentials && (
            <div style={{ marginTop: 12, padding: '14px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Credentials to share
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', width: 70 }}>Email</span>
                  <span style={{ fontWeight: 600 }}>{lastCredentials.email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', width: 70 }}>Password</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, background: 'rgba(204,0,0,0.15)', padding: '3px 10px', borderRadius: 6, letterSpacing: 1 }}>
                    {lastCredentials.password}
                  </span>
                  <button
                    onClick={copyPassword}
                    style={{ padding: '4px 12px', background: copied ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)', border: `1px solid ${copied ? '#4caf50' : 'var(--line)'}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: copied ? '#4caf50' : 'var(--text)', transition: 'all 0.2s' }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
                Share these with the staff member. They can change their password in Settings after logging in.
              </p>
            </div>
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
