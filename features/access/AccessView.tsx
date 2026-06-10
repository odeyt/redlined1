'use client';

import { useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { StatCard } from '@/components/StatCard';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';

export function AccessView() {
  const { users, currentUserId, auditLogs } = useAppState();
  const dispatch = useAppDispatch();
  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  const [loginUserId, setLoginUserId] = useState(currentUserId);
  const [inviteName, setInviteName] = useState('New Technician');
  const [inviteEmail, setInviteEmail] = useState('newtech@redlined1.example');
  const [inviteRole, setInviteRole] = useState('Technician');

  return (
    <>
      <div className="grid cols-4">
        <StatCard label="Signed in as" value={currentUser.name} subtext={currentUser.role} />
        <StatCard label="Active users" value={users.filter(u => u.status === 'Active').length} subtext="Role-controlled access" />
        <StatCard label="Invites" value={users.filter(u => u.status === 'Invited').length} subtext="Pending team setup" />
        <StatCard label="Session" value="Active" subtext="Mock auth session" />
      </div>

      <div className="split">
        <Panel title="Login Session" hint="MVP login controls and role switching for testing permissions">
          <div className="form-row">
            <div className="field">
              <label>Email</label>
              <input defaultValue={currentUser.email} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" defaultValue="demo-password" />
            </div>
            <div className="field">
              <label>Login As</label>
              <select value={loginUserId} onChange={e => setLoginUserId(e.target.value)}>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} - {u.role}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn primary" onClick={() => dispatch({ type: 'LOGIN', userId: loginUserId })}>
                <Icon name="userkey" /> Sign In
              </button>
            </div>
          </div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={() => dispatch({ type: 'RESET_PASSWORD' })}>Send Password Reset</button>
            <button className="btn" onClick={() => dispatch({ type: 'LOGOUT' })}>End Session</button>
          </div>
        </Panel>

        <Panel title="Invite User" hint="Add staff to a shop account with a controlled role">
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input value={inviteName} onChange={e => setInviteName(e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                {['Technician', 'Service Advisor', 'Parts Manager', 'Accountant', 'Read-only Staff', 'Admin'].map(r => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn primary" onClick={() => dispatch({ type: 'INVITE_USER', name: inviteName, email: inviteEmail, role: inviteRole })}>
                Invite User
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Users and Permissions" hint="Role-based access control for MVP">
        <table>
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td><Badge text={u.role} /></td>
                <td><Badge text={u.status} /></td>
                <td>{u.lastLogin}</td>
                <td>
                  <div className="row-actions">
                    <button className="mini-btn" onClick={() => dispatch({ type: 'CHANGE_ROLE', userId: u.id, role: 'Owner' })}>Owner</button>
                    <button className="mini-btn" onClick={() => dispatch({ type: 'CHANGE_ROLE', userId: u.id, role: 'Technician' })}>Tech</button>
                    <button className="mini-btn" onClick={() => dispatch({ type: 'TOGGLE_USER_STATUS', userId: u.id })}>Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Audit Trail" hint="Security and workflow events">
        <table>
          <thead>
            <tr><th>Action</th><th>User</th><th>Entity</th><th>Time</th></tr>
          </thead>
          <tbody>
            {auditLogs.map((log, i) => (
              <tr key={i}>
                <td>{log.action}</td>
                <td>{log.user}</td>
                <td>{log.entity}</td>
                <td>{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
