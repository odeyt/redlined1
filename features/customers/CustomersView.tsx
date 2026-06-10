'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import type { Customer } from '@/lib/types';
import { fetchCustomers, saveCustomer, updateFollowUp } from '@/services/customerService';

const EMPTY_FORM = { name: '', type: 'Retail', phone: '', email: '', address: '', tags: '', followUp: '' };

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchCustomers()
      .then(setCustomers)
      .catch((err) => setError('Load error: ' + (err?.message || JSON.stringify(err))))
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const newCustomer = await saveCustomer({
        name: form.name,
        type: form.type,
        phone: form.phone,
        email: form.email,
        address: form.address,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        followUp: form.followUp,
        portalToken: null,
      });
      setCustomers(prev => [newCustomer, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      notify(`${newCustomer.name} saved.`);
    } catch {
      notify('Save failed. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowUp(customerId: string, customerName: string) {
    const msg = 'Follow-up sent just now';
    try {
      await updateFollowUp(customerId, msg);
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, followUp: msg } : c));
      notify(`Follow-up sent to ${customerName}.`);
    } catch {
      notify('Failed to send follow-up.');
    }
  }

  return (
    <Panel title="Customer Accounts" hint="Retail, mobile, fleet, dealer, wholesale, and enterprise relationships">
      {toast && <div className="toast toast-visible">{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Customer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="login-field">
            <label>Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer or business name" />
          </div>
          <div className="login-field">
            <label>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-soft)' }}>
              <option>Retail</option>
              <option>Fleet</option>
              <option>Dealer</option>
              <option>Enterprise Fleet</option>
              <option>Wholesale</option>
            </select>
          </div>
          <div className="login-field">
            <label>Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
          </div>
          <div className="login-field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@example.com" />
          </div>
          <div className="login-field" style={{ gridColumn: '1 / -1' }}>
            <label>Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
          </div>
          <div className="login-field">
            <label>Tags (comma separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Priority, SMS OK, Net 30" />
          </div>
          <div className="login-field">
            <label>Follow-up note</label>
            <input value={form.followUp} onChange={e => setForm(f => ({ ...f, followUp: e.target.value }))} placeholder="e.g. Call about estimate" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Customer'}</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: 'var(--muted)', padding: 16 }}>Loading customers…</p>}
      {error && <p style={{ color: 'var(--danger)', padding: 16 }}>{error}</p>}

      {!loading && customers.length === 0 && (
        <p style={{ color: 'var(--muted)', padding: 16 }}>No customers yet. Add your first one above.</p>
      )}

      {customers.length > 0 && (
        <table>
          <thead>
            <tr><th>Customer</th><th>Type</th><th>Contact</th><th>Tags</th><th>Follow-up</th><th>Action</th></tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="meta">{c.id} — {c.address}</div>
                </td>
                <td><Badge text={c.type} /></td>
                <td>
                  {c.phone}
                  <div className="meta">{c.email}</div>
                </td>
                <td>{c.tags.map((tag, i) => <Badge key={i} text={tag} />)}</td>
                <td>{c.followUp}</td>
                <td>
                  <div className="row-actions">
                    <button className="mini-btn" onClick={() => handleFollowUp(c.id, c.name)}>
                      Send follow-up
                    </button>
                    {c.portalToken && (
                      <button
                        className="mini-btn"
                        title="Copy customer portal link to clipboard"
                        onClick={() => {
                          const url = `${window.location.origin}/portal/${c.portalToken}`;
                          navigator.clipboard.writeText(url).then(() => notify(`Portal link for ${c.name} copied!`));
                        }}
                      >
                        🔗 Portal Link
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
