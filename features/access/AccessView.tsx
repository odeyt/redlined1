'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authedFetch, AuthSessionError } from '@/lib/apiClient';
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
  const [inviteFallback, setInviteFallback] = useState<{ email: string; actionLink: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [memberError, setMemberError] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserEmail(data.user?.email ?? '');
    });
  }, []);

  async function loadMembers() {
    if (!shopId) return;
    setLoading(true);
    setMemberError('');
    try {
      const res = await authedFetch(`/api/members?shopId=${shopId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMembers(json.members ?? []);
    } catch (e: unknown) {
      setMembers([]);
      setMemberError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, [shopId]);

  async function handleInvite() {
    if (!inviteEmail || !shopId) return;
    setInviteStatus('Sending…');
    setInviteFallback(null);
    try {
      const res = await authedFetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, shopId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setInviteStatus(
        json.accountStatus === 'invited'
          ? `Invite sent to ${json.email} — they'll set their own password.`
          : `${json.email} already has an account and has been added to this shop.`
      );
      // Membership was already granted server-side even if the notification
      // email failed — surface the invite link so the owner can share it
      // manually rather than leaving the invitee stuck with no way in.
      if (json.warning) {
        setInviteFallback({ email: json.email, actionLink: json.actionLink ?? null });
      }
      setInviteEmail('');
      setCopied(false);
      loadMembers();
    } catch (e: unknown) {
      setInviteStatus(`Error: ${e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Failed'}`);
    }
  }

  function copyActionLink() {
    if (!inviteFallback?.actionLink) return;
    navigator.clipboard.writeText(inviteFallback.actionLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setMemberError('');
    try {
      const res = await authedFetch('/api/invite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, shopId, role: newRole }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      loadMembers();
    } catch (e: unknown) {
      setMemberError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Role change failed');
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the shop?`)) return;
    setMemberError('');
    if (!shopId) { setMemberError('No shop selected'); return; }
    try {
      const res = await authedFetch('/api/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, shopId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      loadMembers();
    } catch (e: unknown) {
      setMemberError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Remove failed');
    }
  }

  const isOwner = myRole === 'owner';
  const displayName = currentUserEmail.split('@')[0] || '—';

  return (
    <>
      <div className="grid cols-4">
        <StatCard className="card-hero" label="Signed in as" value={displayName} subtext={`${myRole.charAt(0).toUpperCase() + myRole.slice(1) || 'Loading…'} · ${currentUserEmail}`} />
        <StatCard className="card-hero" label="Shop" value={currentShop?.name || '—'} subtext="Active location" />
        <StatCard className="card-hero" label="Team members" value={members.length} subtext="In this shop" />
        <StatCard className="card-hero" label="Session" value="Active" subtext="Authenticated" />
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
          {inviteFallback && (
            <div style={{ marginTop: 12, padding: '14px 18px', background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)', borderRadius: 10 }}>
              <div className="section-label">
                ⚠️ Notification email failed to send
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 10px' }}>
                {inviteFallback.email} was added, but we couldn't email them. {inviteFallback.actionLink ? 'Share this one-time sign-up link with them directly:' : 'Ask them to sign in — an account already existed for them.'}
              </p>
              {inviteFallback.actionLink && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', background: 'rgba(255,255,255,0.06)', padding: '6px 10px', borderRadius: 6, flex: 1 }}>
                    {inviteFallback.actionLink}
                  </span>
                  <button
                    onClick={copyActionLink}
                    style={{ padding: '4px 12px', background: copied ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)', border: `1px solid ${copied ? '#4caf50' : 'var(--line)'}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: copied ? '#4caf50' : 'var(--text)', transition: 'all 0.2s' }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Team Members" hint={`Users with access to ${currentShop?.name || 'this shop'}`}>
        {memberError && (
          <p style={{ color: '#e74c3c', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(231,76,60,0.08)', borderRadius: 6 }}>
            Error: {memberError}
          </p>
        )}
        {loading ? (
          <p style={{ color: '#888', fontSize: 13 }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No members found for shop ID: {shopId}</p>
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
                              onClick={() => handleRemove(m.userId, m.email)}
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
