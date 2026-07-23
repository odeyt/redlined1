'use client';

import { useEffect, useState } from 'react';
import { usePagination } from '@/lib/usePagination';
import { Pagination } from '@/components/Pagination';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import type { Customer } from '@/lib/types';
import { fetchCustomers, saveCustomer, updateCustomer, updateFollowUp, deleteCustomer, updateCustomerEmail } from '@/services/customerService';
import { supabase } from '@/lib/supabase';
import { useAppDispatch } from '@/lib/store';
import { getShopId } from '@/lib/shopStore';
import { useShop } from '@/lib/useShop';
import { fetchMaintenanceSchedules, getDaysUntilDue, getDueStatus, type MaintenanceSchedule } from '@/services/maintenanceService';
import { parseFreeTierLimitError, freeTierLimitMessage } from '@/lib/freeTierLimit';

const EMPTY_FORM = { name: '', type: 'Retail', phone: '', email: '', address: '', tags: '', followUp: '' };

interface Vehicle { id: string; label: string; year: string; make: string; model: string; plate: string; status: string; mileage: string; }
interface Invoice { number: string; status: string; date: string; subtotal: number; tax: number; discount: number; shop_supplies: number; }
interface RepairOrder { ro_number: string; status: string; opened_date: string; concern: string; vehicle: string; }

export function CustomersView() {
  const dispatch = useAppDispatch();
  const { currentShop } = useShop();
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [saving, setSaving]               = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [toast, setToast]                 = useState('');
  const [selected, setSelected]           = useState<Customer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [vehicles, setVehicles]           = useState<Vehicle[]>([]);
  const [invoices, setInvoices]           = useState<Invoice[]>([]);
  const [ros, setRos]                     = useState<RepairOrder[]>([]);
  const [maintSchedules, setMaintSchedules] = useState<MaintenanceSchedule[]>([]);
  const [reminderSending, setReminderSending] = useState<string | null>(null);
  const [emailPrompt, setEmailPrompt] = useState<{
    customerId: string;
    customerName: string;
    pendingEmail: string;
    saving: boolean;
    action: 'followup' | 'reminder';
    reminderExtra?: { serviceType: string; vehicle: string; dueText: string; nextDueDate: string };
  } | null>(null);
  const [search, setSearch] = useState('');
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentShop?.id) return;
    fetchCustomers()
      .then(list => {
        setCustomers(list);
        // If a deep-link arrived before data loaded, open now
        setPendingCustomerId(pending => {
          if (pending) {
            const found = list.find(c => c.id === pending);
            if (found) setTimeout(() => openDetail(found), 0);
          }
          return null;
        });
      })
      .catch((err) => setError('Load error: ' + (err?.message || JSON.stringify(err))))
      .finally(() => setLoading(false));
  }, [currentShop?.id]);

  useEffect(() => {
    function handleOpenCustomer(e: Event) {
      const { customerId } = (e as CustomEvent).detail ?? {};
      if (!customerId) return;
      setCustomers(current => {
        const found = current.find(c => c.id === customerId);
        if (found) {
          openDetail(found);
        } else {
          // Data not yet loaded — store the pending ID
          setPendingCustomerId(customerId);
        }
        return current;
      });
    }
    window.addEventListener('open-customer', handleOpenCustomer);
    return () => window.removeEventListener('open-customer', handleOpenCustomer);
  }, []);

  async function openDetail(c: Customer) {
    setSelected(c);
    setDetailLoading(true);
    setVehicles([]); setInvoices([]); setRos([]); setMaintSchedules([]);
    try {
      const [{ data: vData }, { data: iData }, { data: rData }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('customer_id', c.id),
        supabase.from('invoices').select('number,status,date,subtotal,tax,discount,shop_supplies').eq('customer_id', c.id).order('created_at', { ascending: false }),
        supabase.from('repair_orders').select('ro_number,status,opened_date,concern,vehicle').eq('customer_id', c.id).order('created_at', { ascending: false }),
      ]);
      setVehicles((vData ?? []).map((v: Record<string, string>) => ({
        id: v.id, label: v.label || `${v.year} ${v.make} ${v.model}`.trim(),
        year: v.year, make: v.make, model: v.model, plate: v.plate || v.license_plate || '',
        status: v.status, mileage: v.mileage,
      })));
      setInvoices(iData ?? []);
      setRos(rData ?? []);
    } catch { /* show what we have */ }
    // Load maintenance schedules independently so a failure doesn't blank the drawer
    fetchMaintenanceSchedules()
      .then(all => setMaintSchedules(all.filter(s =>
        s.customerId === c.id || s.customerName.toLowerCase() === c.name.toLowerCase()
      )))
      .catch(() => {});
    setDetailLoading(false);
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setForm({ name: c.name, type: c.type, phone: c.phone, email: c.email, address: c.address, tags: c.tags.join(', '), followUp: c.followUp });
    setDrawerEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name, type: form.type, phone: form.phone, email: form.email,
      address: form.address, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      followUp: form.followUp,
    };
    try {
      if (editingId) {
        const updated = await updateCustomer(editingId, payload);
        setCustomers(prev => prev.map(c => c.id === editingId ? updated : c));
        if (selected?.id === editingId) setSelected(updated);
        notify(`${updated.name} updated.`);
      } else {
        const newCustomer = await saveCustomer({ ...payload, portalToken: null });
        setCustomers(prev => [newCustomer, ...prev]);
        notify(`${newCustomer.name} saved.`);
      }
      setForm(EMPTY_FORM); setShowForm(false); setEditingId(null); setDrawerEditing(false);
    } catch (err) {
      const limitInfo = parseFreeTierLimitError(err);
      const msg = limitInfo ? freeTierLimitMessage(limitInfo) : (err instanceof Error ? err.message : JSON.stringify(err));
      notify(limitInfo ? msg : 'Save failed: ' + msg);
      setError(limitInfo ? msg : 'Save failed: ' + msg);
    }
    finally { setSaving(false); }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try {
      await deleteCustomer(c.id);
      setCustomers(prev => prev.filter(x => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
      notify(`${c.name} deleted.`);
    } catch { notify('Delete failed. Check your connection.'); }
  }

  async function sendFollowUpEmail(customerId: string, customerName: string, email: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';
    const res = await fetch('/api/send-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'followup', customerId, email, customerName, shopId: getShopId() }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    const msg = 'Follow-up sent just now';
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, followUp: msg } : c));
    if (selected?.id === customerId) setSelected(s => s ? { ...s, followUp: msg } : s);
    notify(`Follow-up emailed to ${customerName}.`);
  }

  function handleFollowUp(customerId: string, customerName: string) {
    const customer = customers.find(c => c.id === customerId);
    if (customer?.email) {
      sendFollowUpEmail(customerId, customerName, customer.email).catch(() => notify('Failed to send follow-up.'));
    } else {
      setEmailPrompt({ customerId, customerName, pendingEmail: '', saving: false, action: 'followup' });
    }
  }

  async function handleEmailPromptSend() {
    if (!emailPrompt || !emailPrompt.pendingEmail) return;
    setEmailPrompt(p => p ? { ...p, saving: true } : null);
    try {
      // Save email to customer record
      await updateCustomerEmail(emailPrompt.customerId, emailPrompt.pendingEmail);
      setCustomers(prev => prev.map(c => c.id === emailPrompt.customerId ? { ...c, email: emailPrompt.pendingEmail } : c));
      if (selected?.id === emailPrompt.customerId) setSelected(s => s ? { ...s, email: emailPrompt.pendingEmail } : s);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      if (emailPrompt.action === 'followup') {
        await sendFollowUpEmail(emailPrompt.customerId, emailPrompt.customerName, emailPrompt.pendingEmail);
      } else {
        // reminder
        const extra = emailPrompt.reminderExtra;
        const res = await fetch('/api/send-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: 'reminder',
            customerId: emailPrompt.customerId,
            email: emailPrompt.pendingEmail,
            customerName: emailPrompt.customerName,
            shopId: getShopId(),
            extra,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        notify(`Reminder emailed to ${emailPrompt.customerName}.`);
      }
      setEmailPrompt(null);
    } catch (e: unknown) {
      notify('Failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setEmailPrompt(p => p ? { ...p, saving: false } : null);
    }
  }

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [c.name, c.phone, c.email, c.address].some(v => v && v.toLowerCase().includes(q));
  });
  const custPage = usePagination(filtered, { pageSize: 25 });

  const money = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const calcTotal = (i: Invoice) => (i.subtotal || 0) - (i.discount || 0) + (i.tax || 0) + (i.shop_supplies || 0);

  const STATUS_COLOR: Record<string, string> = {
    Paid: '#22c55e', Sent: '#3b82f6', Draft: '#888', Void: '#ef4444',
    Open: '#3b82f6', 'In Progress': '#f59e0b', Complete: '#22c55e', Closed: '#9e9e9e',
    Active: '#22c55e', Inactive: '#888',
  };

  return (
    <>
      <Panel title="Customer Accounts" hint="Retail, mobile, fleet, dealer, wholesale, and enterprise relationships">
        {toast && <div className="toast toast-visible">{toast}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setEditingId(null); setForm(EMPTY_FORM); }}>
            {showForm ? 'Cancel' : '+ Add Customer'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: `1px solid ${editingId ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{editingId ? 'Edit Customer' : 'New Customer'}</div>
            <div className="login-field"><label>Name *</label><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer or business name" /></div>
            <div className="login-field">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-soft)' }}>
                <option>Retail</option><option>Fleet</option><option>Dealer</option><option>Enterprise Fleet</option><option>Wholesale</option>
              </select>
            </div>
            <div className="login-field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" /></div>
            <div className="login-field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@example.com" /></div>
            <div className="login-field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" /></div>
            <div className="login-field"><label>Tags (comma separated)</label><input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Priority, SMS OK, Net 30" /></div>
            <div className="login-field"><label>Follow-up note</label><input value={form.followUp} onChange={e => setForm(f => ({ ...f, followUp: e.target.value }))} placeholder="e.g. Call about estimate" /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update Customer' : 'Save Customer'}</button>
            </div>
          </form>
        )}

        <div style={{ marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers…" className="search" style={{ width: '100%', maxWidth: 340 }} />
        </div>

        {loading && <p style={{ color: 'var(--muted)', padding: 16 }}>Loading customers…</p>}
        {error && <p style={{ color: 'var(--danger)', padding: 16 }}>{error}</p>}
        {!loading && customers.length === 0 && <p style={{ color: 'var(--muted)', padding: 16 }}>No customers yet. Add your first one above.</p>}
        {!loading && customers.length > 0 && filtered.length === 0 && <p style={{ color: 'var(--muted)', padding: 16 }}>No customers match your search.</p>}

        {custPage.pageItems.length > 0 && (
          <>
          <table>
            <thead>
              <tr><th>Customer</th><th>Type</th><th>Contact</th><th>Tags</th><th>Follow-up</th><th>Action</th></tr>
            </thead>
            <tbody>
              {custPage.pageItems.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }}>
                  <td onClick={() => openDetail(c)}>
                    <strong style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}>{c.name}</strong>
                    <div className="meta">{c.id} — {c.address}</div>
                  </td>
                  <td><Badge text={c.type} /></td>
                  <td>{c.phone}<div className="meta">{c.email}</div></td>
                  <td>{c.tags.map((tag, i) => <Badge key={i} text={tag} />)}</td>
                  <td>{c.followUp}</td>
                  <td>
                    <div className="row-actions">
                      <button className="mini-btn" onClick={() => openDetail(c)}>View</button>
                      <button className="mini-btn" onClick={() => { setSelected(c); openEdit(c); }}>Edit</button>
                      <button className="mini-btn" onClick={() => handleFollowUp(c.id, c.name)}>Follow-up</button>
                      <button className="mini-btn" style={{ color: 'var(--accent)' }} onClick={() => handleDelete(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={custPage.page} totalPages={custPage.totalPages} totalItems={custPage.totalItems}
            startIndex={custPage.startIndex} endIndex={custPage.endIndex}
            hasPrev={custPage.hasPrev} hasNext={custPage.hasNext}
            onPrev={custPage.prevPage} onNext={custPage.nextPage}
            onFirst={custPage.goToFirst} onLast={custPage.goToLast} onPage={custPage.setPage}
          />
          </>
        )}
      </Panel>

      {/* ── Customer Detail Drawer ── */}
      {selected && (
        <>
          {/* Backdrop */}
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 }} />

          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '95vw',
            background: 'var(--bg)', borderLeft: '1px solid var(--line)',
            zIndex: 301, overflowY: 'auto', display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, background: 'var(--surface-soft)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.id}</div>
                  </div>
                </div>
                <Badge text={selected.type} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!drawerEditing && (
                  <button onClick={() => openEdit(selected)}
                    style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ✏ Edit
                  </button>
                )}
                <button onClick={() => { setSelected(null); setDrawerEditing(false); setEditingId(null); setForm(EMPTY_FORM); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)', padding: 4 }}>✕</button>
              </div>
            </div>

            {/* ── Inline Edit Form ── */}
            {drawerEditing && (
              <form onSubmit={handleSave} style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Edit Customer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="login-field"><label>Name *</label><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="login-field">
                    <label>Type</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-soft)' }}>
                      <option>Retail</option><option>Fleet</option><option>Dealer</option><option>Enterprise Fleet</option><option>Wholesale</option>
                    </select>
                  </div>
                  <div className="login-field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="login-field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}><label>Address</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                  <div className="login-field"><label>Tags (comma separated)</label><input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
                  <div className="login-field"><label>Follow-up note</label><input value={form.followUp} onChange={e => setForm(f => ({ ...f, followUp: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => { setDrawerEditing(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update Customer'}</button>
                </div>
              </form>
            )}

            <div style={{ padding: '20px 24px', flex: 1 }}>

              {/* Contact Info */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">Contact Info</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Phone', value: selected.phone },
                    { label: 'Email', value: selected.email },
                    { label: 'Address', value: selected.address },
                    { label: 'Follow-up', value: selected.followUp },
                  ].map(({ label, value }) => value ? (
                    <div key={label} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                    </div>
                  ) : null)}
                </div>
                {selected.tags.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.tags.map((tag, i) => <Badge key={i} text={tag} />)}
                  </div>
                )}
              </div>

              {detailLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading records…</p>}

              {/* Vehicles */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">
                  Vehicles {vehicles.length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 6 }}>{vehicles.length}</span>}
                </div>
                {vehicles.length === 0 && !detailLoading
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No vehicles on file.</p>
                  : vehicles.map(v => (
                    <div key={v.id} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{v.label || `${v.year} ${v.make} ${v.model}`.trim() || 'Unknown Vehicle'}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {v.plate && `Plate: ${v.plate}`}{v.mileage ? ` · ${Number(v.mileage).toLocaleString()} mi` : ''}
                        </div>
                      </div>
                      {v.status && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (STATUS_COLOR[v.status] || '#888') + '22', color: STATUS_COLOR[v.status] || '#888' }}>{v.status}</span>}
                    </div>
                  ))
                }
              </div>

              {/* Repair Orders */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">
                  Repair Orders {ros.length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 6 }}>{ros.length}</span>}
                </div>
                {ros.length === 0 && !detailLoading
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No repair orders yet.</p>
                  : ros.slice(0, 5).map(r => (
                    <div key={r.ro_number} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.ro_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.vehicle}{r.concern ? ` · ${r.concern}` : ''}</div>
                        {r.opened_date && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(r.opened_date).toLocaleDateString()}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (STATUS_COLOR[r.status] || '#888') + '22', color: STATUS_COLOR[r.status] || '#888', whiteSpace: 'nowrap' }}>{r.status}</span>
                    </div>
                  ))
                }
              </div>

              {/* Invoices */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">
                  Invoices {invoices.length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 6 }}>{invoices.length}</span>}
                </div>
                {invoices.length === 0 && !detailLoading
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No invoices yet.</p>
                  : invoices.slice(0, 5).map(inv => (
                    <div key={inv.number} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{inv.number}</div>
                        {inv.date && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(inv.date).toLocaleDateString()}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{money(calcTotal(inv))}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (STATUS_COLOR[inv.status] || '#888') + '22', color: STATUS_COLOR[inv.status] || '#888' }}>{inv.status}</span>
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* Maintenance Schedules */}
              <div style={{ marginBottom: 24 }}>
                <div className="section-label">
                  Maintenance Schedules
                  {maintSchedules.length > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, marginLeft: 6 }}>{maintSchedules.length}</span>}
                </div>
                {maintSchedules.length === 0 && !detailLoading
                  ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No maintenance schedules. Close a job card to auto-create one.</p>
                  : maintSchedules.map(ms => {
                    const status = getDueStatus(ms);
                    const days = getDaysUntilDue(ms.nextDueDate);
                    const urgencyColor = status === 'overdue' ? '#f44336' : status === 'due-soon' ? '#ff9800' : '#4caf50';
                    const dueText = days === null ? 'No date set' : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`;
                    const msgBody = `Hi ${ms.customerName.split(' ')[0]}, your ${ms.serviceType} for your ${ms.vehicle} is ${dueText.toLowerCase()}${ms.nextDueDate ? ` (${new Date(ms.nextDueDate).toLocaleDateString()})` : ''}. Call us to book your appointment. — Redlined Auto Repair`;
                    return (
                      <div key={ms.id} style={{ background: `${urgencyColor}0d`, border: `1px solid ${urgencyColor}33`, borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{ms.serviceType}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ms.vehicle}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: `${urgencyColor}22`, color: urgencyColor, whiteSpace: 'nowrap' }}>{dueText}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            className="mini-btn"
                            style={{ flex: 1, background: `${urgencyColor}15`, color: urgencyColor, border: `1px solid ${urgencyColor}44`, fontSize: 11 }}
                            disabled={reminderSending === ms.id}
                            onClick={async () => {
                              const custEmail = selected?.email ?? '';
                              const extra = { serviceType: ms.serviceType, vehicle: ms.vehicle, dueText, nextDueDate: ms.nextDueDate ?? '' };
                              if (!custEmail) {
                                setEmailPrompt({ customerId: selected!.id, customerName: selected!.name, pendingEmail: '', saving: false, action: 'reminder', reminderExtra: extra });
                                return;
                              }
                              setReminderSending(ms.id);
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token ?? '';
                                const res = await fetch('/api/send-followup', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ type: 'reminder', customerId: selected!.id, email: custEmail, customerName: selected!.name, shopId: getShopId(), extra }),
                                });
                                const json = await res.json();
                                if (!res.ok) throw new Error(json.error);
                                notify(`Reminder emailed to ${selected!.name} — ${ms.serviceType} ${dueText.toLowerCase()}.`);
                              } catch (e: unknown) {
                                notify('Failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
                              } finally {
                                setReminderSending(null);
                              }
                            }}
                          >
                            {reminderSending === ms.id ? 'Sending…' : '📣 Send Reminder'}
                          </button>
                          <button
                            className="mini-btn"
                            style={{ fontSize: 11 }}
                            onClick={() => { navigator.clipboard.writeText(msgBody); notify('Reminder message copied to clipboard!'); }}
                          >
                            📋 Copy Message
                          </button>
                        </div>
                      </div>
                    );
                  })
                }
              </div>

            </div>

            {/* Footer actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                  dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: selected.name, customerId: selected.id } });
                  setSelected(null);
                }}>＋ New Job Card</button>
                <button className="btn" style={{ flex: 1 }} onClick={() => {
                  dispatch({ type: 'SET_PREFILL', prefill: { customerName: selected.name, customerId: selected.id } });
                  dispatch({ type: 'SET_MODULE', module: 'appointments' });
                  setSelected(null);
                }}>📅 Book Appointment</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => handleFollowUp(selected.id, selected.name)}>✉ Send Follow-up</button>
                {selected.portalToken && (
                  <button className="btn" onClick={() => { const url = `${window.location.origin}/portal/${selected.portalToken}`; navigator.clipboard.writeText(url).then(() => notify('Portal link copied!')); }}>
                    🔗 Portal Link
                  </button>
                )}
                <button className="btn" onClick={() => setSelected(null)}>Close</button>
              </div>
              <button className="btn" style={{ color: '#ef4444', borderColor: '#ef4444', width: '100%' }} onClick={() => handleDelete(selected)}>
                🗑 Delete Customer
              </button>
            </div>
          </div>
        </>
      )}

      {/* Missing email prompt */}
      {emailPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>No Email Address on File</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              <strong>{emailPrompt.customerName}</strong> has no email address saved. Enter one below to send the {emailPrompt.action === 'followup' ? 'follow-up' : 'maintenance reminder'} — it will also be saved to their profile.
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>EMAIL ADDRESS</label>
            <input
              type="email"
              autoFocus
              value={emailPrompt.pendingEmail}
              onChange={e => setEmailPrompt(p => p ? { ...p, pendingEmail: e.target.value } : null)}
              onKeyDown={e => e.key === 'Enter' && emailPrompt.pendingEmail && handleEmailPromptSend()}
              placeholder="customer@example.com"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailPrompt(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                disabled={!emailPrompt.pendingEmail || emailPrompt.saving}
                onClick={handleEmailPromptSend}
                onMouseEnter={e => { if (emailPrompt.pendingEmail && !emailPrompt.saving) { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; } }}
                onMouseLeave={e => { if (emailPrompt.pendingEmail && !emailPrompt.saving) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; } }}
                style={{ padding: '8px 18px', borderRadius: 999, border: '2px solid #cc0000', background: 'transparent', color: '#cc0000', cursor: emailPrompt.pendingEmail ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: !emailPrompt.pendingEmail || emailPrompt.saving ? 0.6 : 1, transition: 'background .15s, color .15s' }}
              >
                {emailPrompt.saving ? 'Saving & Sending…' : '✉️ Save & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
