'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchRepairOrders, createRepairOrder, updateRepairOrder,
  closeRepairOrder, deleteRepairOrder, nextRONumber, calcROTotal,
  RO_STATUSES, type RepairOrder,
} from '@/services/repairOrderService';
import { createInvoice, formatMoney, CURRENCIES, nextInvoiceNumber } from '@/services/invoiceService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { fetchShopSettings, type ShopSettings } from '@/services/shopSettingsService';

const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';

const STATUS_COLORS: Record<string, string> = {
  'Open': '#2196f3',
  'In Progress': '#ff9800',
  'Pending Parts': '#9c27b0',
  'Pending Approval': '#f59e0b',
  'Complete': '#4caf50',
  'Closed': '#888',
  'Void': '#f44336',
};

const EMPTY_FORM = {
  roNumber: '',
  jobCardId: '',
  invoiceNumber: '',
  customerName: '',
  customerId: '',
  vehicle: '',
  status: 'Open',
  concern: '',
  cause: '',
  correction: '',
  technician: '',
  laborHours: 0,
  partsTotal: 0,
  laborRate: 145,
  notes: '',
  currency: 'USD',
  openedDate: new Date().toISOString(),
  closedDate: null as string | null,
};

export function RepairOrdersView() {
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RepairOrder | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchRepairOrders();
      setOrders(data);
      if (data.length > 0) setSelected(data[0]);
    } catch (e: unknown) {
      setError('Load error: ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function openNew() {
    const num = await nextRONumber();
    setForm({ ...EMPTY_FORM, roNumber: num, laborRate: shopSettings?.laborRate ?? 145, openedDate: new Date().toISOString() });
    setEditingId(null);
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(ro: RepairOrder) {
    setForm({
      roNumber: ro.roNumber,
      jobCardId: ro.jobCardId,
      invoiceNumber: ro.invoiceNumber,
      customerName: ro.customerName,
      customerId: ro.customerId,
      vehicle: ro.vehicle,
      status: ro.status,
      concern: ro.concern,
      cause: ro.cause,
      correction: ro.correction,
      technician: ro.technician,
      laborHours: ro.laborHours,
      partsTotal: ro.partsTotal,
      laborRate: ro.laborRate,
      notes: ro.notes,
      currency: ro.currency,
      openedDate: ro.openedDate,
      closedDate: ro.closedDate,
    });
    setEditingId(ro.id);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updateRepairOrder(editingId, { ...form });
        const updated: RepairOrder = { ...selected!, ...form, id: editingId, createdAt: selected?.createdAt ?? '' };
        setOrders(prev => prev.map(r => r.id === editingId ? updated : r));
        setSelected(updated);
        notify(`${form.roNumber} updated.`);
      } else {
        const saved = await createRepairOrder(form);
        setOrders(prev => [saved, ...prev]);
        setSelected(saved);
        notify(`${saved.roNumber} created.`);
      }
      setShowForm(false); setEditingId(null);
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleStatusChange(ro: RepairOrder, status: string) {
    try {
      await updateRepairOrder(ro.id, { status });
      const updated = { ...ro, status };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`Status updated to ${status}.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleClose(ro: RepairOrder) {
    if (!confirm(`Close ${ro.roNumber}? This will record the closed date.`)) return;
    try {
      await closeRepairOrder(ro.id);
      const updated = { ...ro, status: 'Closed', closedDate: new Date().toISOString() };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`${ro.roNumber} closed.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleConvertToInvoice(ro: RepairOrder) {
    if (!confirm(`Convert ${ro.roNumber} to an invoice?`)) return;
    try {
      const invNumber = await nextInvoiceNumber();
      const total = calcROTotal(ro);
      await createInvoice({
        invoiceNumber: invNumber,
        customerName: ro.customerName,
        customerId: ro.customerId,
        vehicle: ro.vehicle,
        jobCardId: ro.jobCardId,
        status: 'Draft',
        lines: [
          { note: ro.roNumber, description: `Labor — ${ro.correction || ro.concern}`, qty: ro.laborHours, rate: ro.laborRate },
          ...(ro.partsTotal > 0 ? [{ note: '', description: 'Parts', qty: 1, rate: ro.partsTotal }] : []),
        ],
        discount: 0,
        shopSupplies: 0,
        taxRate: (shopSettings?.defaultTaxRate ?? 0.08),
        notes: `Converted from ${ro.roNumber}. ${ro.notes}`.trim(),
        dueDate: '',
        paidDate: null,
        currency: ro.currency,
      });
      await updateRepairOrder(ro.id, { status: 'Complete', invoiceNumber: invNumber });
      const updated = { ...ro, status: 'Complete', invoiceNumber: invNumber };
      setOrders(prev => prev.map(r => r.id === ro.id ? updated : r));
      setSelected(updated);
      notify(`${ro.roNumber} converted to ${invNumber}. Go to Invoices to view it.`);
    } catch (e: unknown) { setError('Convert failed: ' + (e instanceof Error ? e.message : '')); }
  }

  async function handleDelete(ro: RepairOrder) {
    if (!confirm(`Delete ${ro.roNumber}?`)) return;
    try {
      await deleteRepairOrder(ro.id);
      setOrders(prev => prev.filter(r => r.id !== ro.id));
      setSelected(orders.find(r => r.id !== ro.id) ?? null);
      notify(`${ro.roNumber} deleted.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  const filtered = orders.filter(ro => {
    const matchStatus = filterStatus === 'All' || ro.status === filterStatus;
    const matchSearch = !search || [ro.roNumber, ro.customerName, ro.vehicle, ro.technician]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const openCount = orders.filter(r => r.status === 'Open' || r.status === 'In Progress').length;
  const pendingCount = orders.filter(r => r.status === 'Pending Parts' || r.status === 'Pending Approval').length;
  const completeCount = orders.filter(r => r.status === 'Complete' || r.status === 'Closed').length;
  const totalLabor = orders.filter(r => r.status !== 'Void').reduce((s, r) => s + r.laborHours * r.laborRate, 0);

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open / In Progress</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2196f3' }}>{openCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complete / Closed</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{completeCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Labor Value</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>${totalLabor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: RO List ── */}
        <Panel title="Repair Orders" hint="Click an RO to view the full 3C worksheet">
          {/* Most Recent */}
          {orders.length > 0 && (
            <div onClick={() => { setSelected(orders[0]); setShowForm(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', marginBottom: 12, cursor: 'pointer' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Most Recent</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{orders[0].roNumber} — {orders[0].customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{orders[0].vehicle} · {orders[0].technician || 'Unassigned'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{formatMoney(calcROTotal(orders[0]), orders[0].currency)}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[orders[0].status] || '#888' }}>{orders[0].status}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search RO, customer, vehicle…" className="search" style={{ flex: 1, minWidth: 120 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
              <option value="All">All Status</option>
              {RO_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary" onClick={openNew}>+ New RO</button>
          </div>

          {/* New / Edit Form */}
          {showForm && (
            <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{editingId ? `✏️ Edit ${form.roNumber}` : 'New Repair Order'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>RO Number</label>
                  <input value={form.roNumber} onChange={e => setForm(f => ({ ...f, roNumber: e.target.value }))} required readOnly={!!editingId} style={editingId ? { opacity: 0.6 } : {}} />
                </div>
                <div className="login-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {RO_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Customer</label>
                  <select value={form.customerId} onChange={e => {
                    const c = customers.find(c => c.id === e.target.value);
                    setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName }));
                  }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Customer Name</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                </div>
                <div className="login-field">
                  <label>Vehicle</label>
                  <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="2022 Ford F-150" />
                </div>
                <div className="login-field">
                  <label>Technician</label>
                  <input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} placeholder="Tech name" />
                </div>
                <div className="login-field">
                  <label>Job Card ID</label>
                  <input value={form.jobCardId} onChange={e => setForm(f => ({ ...f, jobCardId: e.target.value }))} placeholder="JC-001" />
                </div>
              </div>

              {/* 3C Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <div className="login-field">
                  <label>🔴 Concern (Customer Complaint)</label>
                  <textarea value={form.concern} onChange={e => setForm(f => ({ ...f, concern: e.target.value }))} rows={2} placeholder="What the customer reports…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
                <div className="login-field">
                  <label>🟡 Cause (Technician Finding)</label>
                  <textarea value={form.cause} onChange={e => setForm(f => ({ ...f, cause: e.target.value }))} rows={2} placeholder="Root cause found…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
                <div className="login-field">
                  <label>🟢 Correction (Work Performed)</label>
                  <textarea value={form.correction} onChange={e => setForm(f => ({ ...f, correction: e.target.value }))} rows={2} placeholder="Work performed to correct…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Labor Hours</label>
                  <input type="number" value={form.laborHours} onChange={e => setForm(f => ({ ...f, laborHours: Number(e.target.value) }))} min="0" step="0.5" />
                </div>
                <div className="login-field">
                  <label>Labor Rate ($/hr)</label>
                  <input type="number" value={form.laborRate} onChange={e => setForm(f => ({ ...f, laborRate: Number(e.target.value) }))} min="0" step="5" />
                </div>
                <div className="login-field">
                  <label>Parts Total ($)</label>
                  <input type="number" value={form.partsTotal} onChange={e => setForm(f => ({ ...f, partsTotal: Number(e.target.value) }))} min="0" step="0.01" />
                </div>
                <div className="login-field">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>)}
                  </select>
                </div>
              </div>

              <div className="login-field" style={{ marginBottom: 12 }}>
                <label>Internal Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes, parts ordered, warranty info…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create RO'}</button>
              </div>
            </form>
          )}

          {loading && <p style={{ color: 'var(--muted)' }}>Loading repair orders…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {orders.length === 0 ? 'No repair orders yet. Create your first one.' : 'No ROs match your filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(ro => {
              const isSelected = selected?.id === ro.id;
              const isLatest = ro.id === orders[0]?.id;
              return (
                <div key={ro.id} onClick={() => { setSelected(ro); setShowForm(false); }}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`, background: isSelected ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{ro.roNumber}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: STATUS_COLORS[ro.status] || '#888', textTransform: 'uppercase' }}>{ro.status}</span>
                      {isLatest && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(204,0,0,0.1)', padding: '1px 6px', borderRadius: 10 }}>LATEST</span>}
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{ro.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ro.vehicle} {ro.technician ? `· ${ro.technician}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{formatMoney(calcROTotal(ro), ro.currency)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(ro.openedDate)}</div>
                    </div>
                  </div>
                  {ro.concern && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>🔴 {ro.concern.slice(0, 80)}{ro.concern.length > 80 ? '…' : ''}</div>}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── Right: RO Detail ── */}
        {selected && !showForm && (
          <div>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <select value={selected.status} onChange={e => handleStatusChange(selected, e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontWeight: 600 }}>
                {RO_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary" onClick={() => openEdit(selected)}>✏️ Edit</button>
              <button className="btn" onClick={() => setShowPreview(true)}>👁 Preview</button>
              {selected.status !== 'Closed' && selected.status !== 'Void' && (
                <button className="btn" style={{ background: 'rgba(76,175,80,0.1)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleClose(selected)}>✓ Close RO</button>
              )}
              {(selected.status === 'Complete' || selected.status === 'Closed') && !selected.invoiceNumber && (
                <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', fontWeight: 600 }} onClick={() => handleConvertToInvoice(selected)}>⚡ Create Invoice</button>
              )}
              <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
            </div>

            {/* RO Detail Card — 3C Worksheet */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 28 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 48, maxWidth: 110, objectFit: 'contain', borderRadius: 6 }} />}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                    {shopSettings?.address && <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                    {shopSettings?.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {shopSettings.phone}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Repair Order</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.roNumber}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status.toUpperCase()}</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
                    Opened: {fmt(selected.openedDate)}<br />
                    {selected.closedDate && <span style={{ color: '#4caf50' }}>Closed: {fmt(selected.closedDate)}</span>}
                  </div>
                </div>
              </div>

              {/* Customer + Vehicle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Customer</div>
                  <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                </div>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Vehicle</div>
                  <div style={{ fontWeight: 600 }}>{selected.vehicle || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Technician</div>
                  <div style={{ fontWeight: 600 }}>{selected.technician || '—'}</div>
                  {selected.jobCardId && <div style={{ fontSize: 11, color: 'var(--muted)' }}>JC: {selected.jobCardId}</div>}
                </div>
              </div>

              {/* 3C Worksheet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {[
                  { color: '#f44336', label: '🔴 Concern', text: selected.concern, bg: 'rgba(244,67,54,0.05)', border: 'rgba(244,67,54,0.2)' },
                  { color: '#ff9800', label: '🟡 Cause', text: selected.cause, bg: 'rgba(255,152,0,0.05)', border: 'rgba(255,152,0,0.2)' },
                  { color: '#4caf50', label: '🟢 Correction', text: selected.correction, bg: 'rgba(76,175,80,0.05)', border: 'rgba(76,175,80,0.2)' },
                ].map(({ label, text, bg, border }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, color: 'var(--muted)' }}>{label}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{text || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Not recorded</span>}</div>
                  </div>
                ))}
              </div>

              {/* Labor + Parts */}
              <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Charges</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Labor</div>
                    <div style={{ fontWeight: 600 }}>{selected.laborHours} hrs × {formatMoney(selected.laborRate, selected.currency)}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(selected.laborHours * selected.laborRate, selected.currency)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Parts</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(selected.partsTotal, selected.currency)}</div>
                  </div>
                  <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total</div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>{formatMoney(calcROTotal(selected), selected.currency)}</div>
                    {selected.invoiceNumber && <div style={{ fontSize: 11, color: '#4caf50', marginTop: 4 }}>→ {selected.invoiceNumber}</div>}
                  </div>
                </div>
              </div>

              {selected.notes && (
                <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Internal Notes</div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!selected && !showForm && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
            Select a repair order to view the worksheet
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 720, padding: 48, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 16, right: 16, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15 }}>✕ Close</button>
            <button onClick={() => { setShowPreview(false); window.print(); }} style={{ position: 'absolute', top: 16, right: 100, background: '#cc0000', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>🖨 Print</button>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32, paddingBottom: 24, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 56, maxWidth: 130, objectFit: 'contain' }} />}
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#cc0000' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                  {shopSettings?.address && <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line', marginTop: 4 }}>{shopSettings.address}</div>}
                  {shopSettings?.phone && <div style={{ fontSize: 12, color: '#555' }}>📞 {shopSettings.phone}</div>}
                  {shopSettings?.email && <div style={{ fontSize: 12, color: '#555' }}>✉️ {shopSettings.email}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Repair Order</div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{selected.roNumber}</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status}</span>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  Opened: {fmt(selected.openedDate)}<br />
                  {selected.closedDate && <>Closed: {fmt(selected.closedDate)}</>}
                </div>
              </div>
            </div>

            {/* Customer / Vehicle / Tech */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
              {[['Customer', selected.customerName], ['Vehicle', selected.vehicle], ['Technician', selected.technician || '—']].map(([label, val]) => (
                <div key={label} style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontWeight: 600 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 3C */}
            {[
              { label: '🔴 Concern (Customer Complaint)', text: selected.concern, bg: '#fff5f5', border: '#fecaca' },
              { label: '🟡 Cause (Technician Finding)', text: selected.cause, bg: '#fffbeb', border: '#fde68a' },
              { label: '🟢 Correction (Work Performed)', text: selected.correction, bg: '#f0fdf4', border: '#bbf7d0' },
            ].map(({ label, text, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: text ? '#111' : '#999', fontStyle: text ? 'normal' : 'italic' }}>{text || 'Not recorded'}</div>
              </div>
            ))}

            {/* Charges */}
            <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '16px 20px', marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Labor</div>
                  <div style={{ fontSize: 13 }}>{selected.laborHours} hrs × {formatMoney(selected.laborRate, selected.currency)}</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(selected.laborHours * selected.laborRate, selected.currency)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Parts</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(selected.partsTotal, selected.currency)}</div>
                </div>
                <div style={{ borderLeft: '3px solid #cc0000', paddingLeft: 16 }}>
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Total</div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: '#cc0000' }}>{formatMoney(calcROTotal(selected), selected.currency)}</div>
                </div>
              </div>
            </div>

            {selected.notes && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{selected.notes}</p>
              </div>
            )}

            <div style={{ marginTop: 32, textAlign: 'center', fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 14 }}>
              {shopSettings?.companyName || 'Redlined1'}{shopSettings?.phone ? ` · ${shopSettings.phone}` : ''}{shopSettings?.email ? ` · ${shopSettings.email}` : ''}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
