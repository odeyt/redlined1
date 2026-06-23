'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchEstimates, createEstimate, updateEstimate, approveEstimate,
  deleteEstimate, nextEstimateNumber, calculateEstimateTotals,
  type EstimateFull, type EstimateLine,
} from '@/services/estimateService';
import { createInvoice, nextInvoiceNumber } from '@/services/invoiceService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { fetchShopSettings, type ShopSettings } from '@/services/shopSettingsService';
import { CURRENCIES, formatMoney } from '@/services/invoiceService';

const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';

const STATUS_COLORS: Record<string, string> = {
  Draft: '#888', Sent: '#2196f3', Approved: '#4caf50',
  Declined: '#f44336', Converted: '#9c27b0',
};

// Form uses string for qty/rate so the user can type freely (decimals, clearing)
type FormLine = { note: string; description: string; qty: string; rate: string };
const EMPTY_LINE: FormLine = { note: '', description: '', qty: '1', rate: '0' };

const EMPTY_FORM = {
  estimateNumber: '',
  customerName: '',
  customerId: '',
  vehicle: '',
  jobCardId: '',
  status: 'Draft',
  lines: [{ ...EMPTY_LINE }] as FormLine[],
  discount: 0,
  shopSupplies: 0,
  taxRate: 0.08,
  notes: '',
  validUntil: '',
  approvedDate: null as string | null,
  currency: 'USD',
};

export function EstimatesView() {
  const { prefill } = useAppState();
  const dispatch = useAppDispatch();
  const [estimates, setEstimates] = useState<EstimateFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<EstimateFull | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
  }, []);

  useEffect(() => {
    function handleOpenEstimate(e: Event) {
      const { estimateNumber } = (e as CustomEvent).detail ?? {};
      if (!estimateNumber) return;
      setEstimates(current => {
        const found = current.find(est => est.estimateNumber === estimateNumber);
        if (found) { setSelected(found); setShowForm(false); }
        return current;
      });
    }
    window.addEventListener('open-estimate', handleOpenEstimate);
    return () => window.removeEventListener('open-estimate', handleOpenEstimate);
  }, []);

  // Open new form pre-filled when navigated from another module (e.g. Inspection → Estimate)
  useEffect(() => {
    if (!prefill?.customerName) return;
    nextEstimateNumber().then(num => {
      setForm(f => ({ ...f, estimateNumber: num, customerName: prefill.customerName ?? '', customerId: prefill.customerId ?? '' }));
      setEditingId(null);
      setShowForm(true);
      setSelected(null);
      dispatch({ type: 'CLEAR_PREFILL' });
    }).catch(() => {});
  }, [prefill]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchEstimates();
      setEstimates(data);
      if (data.length > 0) setSelected(data[0]);
    } catch (e: unknown) {
      setError('Load error: ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function openNewForm() {
    const num = await nextEstimateNumber();
    setForm({ ...EMPTY_FORM, estimateNumber: num, lines: [{ ...EMPTY_LINE }] });
    setEditingId(null);
    setShowForm(true);
    setSelected(null);
  }

  function openEditForm(est: EstimateFull) {
    setForm({
      estimateNumber: est.estimateNumber,
      customerName: est.customerName,
      customerId: est.customerId,
      vehicle: est.vehicle,
      jobCardId: est.jobCardId,
      status: est.status,
      lines: est.lines.length > 0 ? est.lines.map(l => ({ note: l.note, description: l.description, qty: String(l.qty), rate: String(l.rate) })) : [{ ...EMPTY_LINE }],
      discount: est.discount,
      shopSupplies: est.shopSupplies,
      taxRate: est.taxRate,
      notes: est.notes,
      validUntil: est.validUntil || '',
      approvedDate: est.approvedDate,
      currency: est.currency || 'USD',
    });
    setEditingId(est.id);
    setShowForm(true);
  }

  function setLine(i: number, field: keyof FormLine, value: string) {
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    if (!form.estimateNumber) return setError('Estimate number is required.');
    setSaving(true); setError('');
    const parsedLines: EstimateLine[] = form.lines.map(l => ({ note: l.note, description: l.description, qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0 }));
    try {
      if (editingId) {
        await updateEstimate(editingId, { ...form, lines: parsedLines });
        const updated: EstimateFull = { ...selected!, ...form, lines: parsedLines, id: editingId, createdAt: selected?.createdAt ?? '' };
        setEstimates(prev => prev.map(e => e.id === editingId ? updated : e));
        setSelected(updated);
        notify(`${form.estimateNumber} updated.`);
      } else {
        const saved = await createEstimate({ ...form, lines: parsedLines });
        setEstimates(prev => [saved, ...prev]);
        setSelected(saved);
        notify(`${saved.estimateNumber} created.`);
      }
      setShowForm(false); setEditingId(null);
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleApprove(est: EstimateFull) {
    try {
      await approveEstimate(est.id);
      const updated = { ...est, status: 'Approved', approvedDate: new Date().toISOString() };
      setEstimates(prev => prev.map(e => e.id === est.id ? updated : e));
      setSelected(updated);
      notify(`${est.estimateNumber} approved.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleDecline(est: EstimateFull) {
    if (!confirm(`Decline ${est.estimateNumber}?`)) return;
    try {
      await updateEstimate(est.id, { status: 'Declined' });
      const updated = { ...est, status: 'Declined' };
      setEstimates(prev => prev.map(e => e.id === est.id ? updated : e));
      setSelected(updated);
      notify(`${est.estimateNumber} declined.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleConvertToInvoice(est: EstimateFull) {
    if (!confirm(`Convert ${est.estimateNumber} to an invoice?`)) return;
    try {
      const invNumber = await nextInvoiceNumber();
      await createInvoice({
        invoiceNumber: invNumber,
        customerName: est.customerName,
        customerId: est.customerId,
        vehicle: est.vehicle,
        jobCardId: est.jobCardId,
        status: 'Draft',
        lines: est.lines,
        discount: est.discount,
        shopSupplies: est.shopSupplies,
        taxRate: est.taxRate,
        notes: `Converted from ${est.estimateNumber}. ${est.notes}`.trim(),
        dueDate: '',
        paidDate: null,
        currency: est.currency,
      });
      await updateEstimate(est.id, { status: 'Converted' });
      const updated = { ...est, status: 'Converted' };
      setEstimates(prev => prev.map(e => e.id === est.id ? updated : e));
      setSelected(updated);
      notify(`${est.estimateNumber} → ${invNumber} created. Opening Invoices…`);
      setTimeout(() => dispatch({ type: 'SET_MODULE', module: 'invoices' }), 800);
    } catch (e: unknown) { setError('Convert failed: ' + (e instanceof Error ? e.message : '')); }
  }

  async function handleDelete(est: EstimateFull) {
    if (!confirm(`Delete ${est.estimateNumber}?`)) return;
    try {
      await deleteEstimate(est.id);
      setEstimates(prev => prev.filter(e => e.id !== est.id));
      setSelected(estimates.find(e => e.id !== est.id) ?? null);
      notify(`${est.estimateNumber} deleted.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  const filtered = estimates.filter(est => {
    const matchStatus = filterStatus === 'All' || est.status === filterStatus;
    const matchSearch = !search || [est.estimateNumber, est.customerName, est.vehicle]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const totals = selected ? calculateEstimateTotals(selected) : null;
  const totalValue = estimates.reduce((s, e) => s + calculateEstimateTotals(e).total, 0);
  const pendingCount = estimates.filter(e => e.status === 'Sent').length;
  const approvedCount = estimates.filter(e => e.status === 'Approved').length;
  const convertedCount = estimates.filter(e => e.status === 'Converted').length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Estimates</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{estimates.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending Approval</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2196f3' }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approved</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{approvedCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Converted</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#9c27b0' }}>{convertedCount}</div>
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: Estimate List ── */}
        <Panel title="Estimates" hint="Click an estimate to view details">
          {/* Most Recent banner */}
          {estimates.length > 0 && (
            <div onClick={() => { setSelected(estimates[0]); setShowForm(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', marginBottom: 12, cursor: 'pointer' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Most Recent</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{estimates[0].estimateNumber} — {estimates[0].customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{estimates[0].vehicle} · {fmt(estimates[0].createdAt)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{formatMoney(calculateEstimateTotals(estimates[0]).total, estimates[0].currency || 'USD')}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[estimates[0].status] || '#888' }}>{estimates[0].status}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="search" style={{ flex: 1, minWidth: 120 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
              {['All', 'Draft', 'Sent', 'Approved', 'Declined', 'Converted'].map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary" onClick={openNewForm}>+ New</button>
          </div>

          {showForm && (
            <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{editingId ? `✏️ Edit ${form.estimateNumber}` : 'New Estimate'}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Estimate #</label>
                  <input value={form.estimateNumber} onChange={e => setForm(f => ({ ...f, estimateNumber: e.target.value }))} required readOnly={!!editingId} style={editingId ? { opacity: 0.6 } : {}} />
                </div>
                <div className="login-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {['Draft', 'Sent', 'Approved', 'Declined', 'Converted'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Customer</label>
                  <select value={form.customerId} onChange={e => {
                    const c = customers.find(c => c.id === e.target.value);
                    setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName }));
                  }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Customer Name</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Customer name" required />
                </div>
                <div className="login-field">
                  <label>Vehicle</label>
                  <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="2022 Ford F-150" />
                </div>
                <div className="login-field">
                  <label>Valid Until</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }} />
                </div>
                <div className="login-field">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Job Card ID (optional)</label>
                  <input value={form.jobCardId} onChange={e => setForm(f => ({ ...f, jobCardId: e.target.value }))} placeholder="JC-001" />
                </div>
              </div>

              {/* Line Items */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Line Items</label>
                  <button type="button" className="mini-btn primary" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { note: '', description: '', qty: '1', rate: '0' }] }))}>+ Add Line</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr 0.7fr 1.1fr auto', gap: 4, marginBottom: 4 }}>
                  {['Note / Ref', 'Description', 'Qty', 'Rate', ''].map((h, i) => (
                    <div key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>{h}</div>
                  ))}
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr 0.7fr 1.1fr auto', gap: 4, marginBottom: 6 }}>
                    <input value={line.note} onChange={e => setLine(i, 'note', e.target.value)} placeholder="Ref #" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Labor / Part description" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <input type="text" inputMode="numeric" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="1" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <input type="text" inputMode="decimal" value={line.rate} onChange={e => setLine(i, 'rate', e.target.value)} placeholder="0.00" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <button type="button" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Discount ($)</label>
                  <input type="text" inputMode="decimal" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
                </div>
                <div className="login-field">
                  <label>Shop Supplies ($)</label>
                  <input type="text" inputMode="decimal" value={form.shopSupplies} onChange={e => setForm(f => ({ ...f, shopSupplies: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
                </div>
                <div className="login-field">
                  <label>Tax Rate (%)</label>
                  <input type="text" inputMode="decimal" value={(form.taxRate * 100).toFixed(1)} onChange={e => setForm(f => ({ ...f, taxRate: (parseFloat(e.target.value) || 0) / 100 }))} placeholder="8.0" />
                </div>
              </div>

              <div className="login-field" style={{ marginBottom: 12 }}>
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Work description, warranty, conditions…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Estimate'}</button>
              </div>
            </form>
          )}

          {loading && <p style={{ color: 'var(--muted)' }}>Loading estimates…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {estimates.length === 0 ? 'No estimates yet. Create your first one.' : 'No estimates match your filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(est => {
              const t = calculateEstimateTotals(est);
              const isSelected = selected?.id === est.id;
              const isLatest = est.id === estimates[0]?.id;
              return (
                <div key={est.id} onClick={() => { setSelected(est); setShowForm(false); }}
                  style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`, background: isSelected ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{est.estimateNumber}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: STATUS_COLORS[est.status] || '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{est.status}</span>
                      {isLatest && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(204,0,0,0.1)', padding: '1px 6px', borderRadius: 10 }}>LATEST</span>}
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{est.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{est.vehicle}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(t.total, est.currency || 'USD')}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(est.createdAt)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ── Right: Estimate Detail ── */}
        {selected && !showForm && totals && (
          <div>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => openEditForm(selected)}>✏️ Edit</button>
              <button className="btn" onClick={() => setShowPreview(true)}>👁 Preview</button>
              {selected.status !== 'Approved' && selected.status !== 'Converted' && selected.status !== 'Declined' && (
                <button className="btn" style={{ background: 'rgba(76,175,80,0.12)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleApprove(selected)}>✓ Approve</button>
              )}
              {selected.status !== 'Declined' && selected.status !== 'Converted' && (
                <button className="btn" style={{ background: 'rgba(244,67,54,0.08)', color: '#f44336', border: '1px solid #f4433633' }} onClick={() => handleDecline(selected)}>✕ Decline</button>
              )}
              {(selected.status === 'Approved') && (
                <button className="btn" style={{ background: 'rgba(156,39,176,0.1)', color: '#9c27b0', border: '1px solid #9c27b033', fontWeight: 600 }} onClick={() => handleConvertToInvoice(selected)}>⚡ Convert to Invoice</button>
              )}
              <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
            </div>

            {/* Estimate detail card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 28 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 48, maxWidth: 110, objectFit: 'contain', borderRadius: 6 }} />}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                    {shopSettings?.tagline && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{shopSettings.tagline}</div>}
                    {shopSettings?.address && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                    {shopSettings?.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {shopSettings.phone}</div>}
                    {shopSettings?.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>✉️ {shopSettings.email}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{selected.estimateNumber}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status.toUpperCase()}</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
                    Created: {fmt(selected.createdAt)}<br />
                    {selected.validUntil && <>Valid until: {fmt(selected.validUntil)}<br /></>}
                    {selected.approvedDate && <span style={{ color: '#4caf50' }}>Approved: {fmt(selected.approvedDate)}</span>}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Prepared For</div>
                  <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                  {selected.vehicle && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.vehicle}</div>}
                </div>
                {selected.jobCardId && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reference</div>
                    <div style={{ fontSize: 13 }}>Job Card: <strong>{selected.jobCardId}</strong></div>
                  </div>
                )}
              </div>

              {/* Lines */}
              <table style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: 100 }}>Note / Ref</th>
                    <th style={{ textAlign: 'left' }}>Description</th>
                    <th style={{ textAlign: 'right', width: 60 }}>Qty</th>
                    <th style={{ textAlign: 'right', width: 90 }}>Rate</th>
                    <th style={{ textAlign: 'right', width: 100 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>No line items</td></tr>}
                  {selected.lines.map((line, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{line.note || '—'}</td>
                      <td>{line.description}</td>
                      <td style={{ textAlign: 'right' }}>{line.qty}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(line.rate, selected.currency)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(line.qty * line.rate, selected.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <div style={{ width: 280 }}>
                  {([
                    ['Subtotal', formatMoney(totals.subtotal, selected.currency)],
                    totals.discount > 0 ? ['Discount', `-${formatMoney(totals.discount, selected.currency)}`] : null,
                    totals.shopSupplies > 0 ? ['Shop Supplies', formatMoney(totals.shopSupplies, selected.currency)] : null,
                    [`Tax (${(selected.taxRate * 100).toFixed(1)}%)`, formatMoney(totals.tax, selected.currency)],
                  ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>{label}</span><span>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 17 }}>
                    <span>Total ({selected.currency})</span>
                    <span style={{ color: 'var(--accent)' }}>{formatMoney(totals.total, selected.currency)}</span>
                  </div>
                </div>
              </div>

              {selected.notes && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!selected && !showForm && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
            Select an estimate to view details
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && selected && totals && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 720, padding: 48, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 16, right: 16, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, color: '#333' }}>✕ Close</button>
            <button onClick={() => { setShowPreview(false); window.print(); }} style={{ position: 'absolute', top: 16, right: 100, background: '#cc0000', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>🖨 Print</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 56, maxWidth: 130, objectFit: 'contain', borderRadius: 6 }} />}
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#cc0000' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                  {shopSettings?.tagline && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{shopSettings.tagline}</div>}
                  {shopSettings?.address && <div style={{ fontSize: 12, color: '#555', marginTop: 6, whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    {shopSettings?.phone && <div>📞 {shopSettings.phone}</div>}
                    {shopSettings?.email && <div>✉️ {shopSettings.email}</div>}
                    {shopSettings?.website && <div>🌐 {shopSettings.website}</div>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Estimate</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#111', marginTop: 4 }}>{selected.estimateNumber}</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{selected.status.toUpperCase()}</span>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.7 }}>
                  Date: {fmt(selected.createdAt)}<br />
                  {selected.validUntil && <>Valid until: {fmt(selected.validUntil)}<br /></>}
                  {selected.approvedDate && <span style={{ color: '#4caf50', fontWeight: 600 }}>Approved: {fmt(selected.approvedDate)}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
              <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Prepared For</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.customerName}</div>
                {selected.vehicle && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{selected.vehicle}</div>}
              </div>
              {selected.jobCardId && (
                <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Reference</div>
                  <div>Job Card: <strong>{selected.jobCardId}</strong></div>
                </div>
              )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#111' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  {['Note / Ref', 'Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>{line.note || ''}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14 }}>{line.description}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{line.qty}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{formatMoney(line.rate, selected.currency)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(line.qty * line.rate, selected.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ width: 280 }}>
                {([
                  ['Subtotal', formatMoney(totals.subtotal, selected.currency)],
                  totals.discount > 0 ? ['Discount', `-${formatMoney(totals.discount, selected.currency)}`] : null,
                  totals.shopSupplies > 0 ? ['Shop Supplies', formatMoney(totals.shopSupplies, selected.currency)] : null,
                  [`Tax (${(selected.taxRate * 100).toFixed(1)}%)`, formatMoney(totals.tax, selected.currency)],
                ] as ([string, string] | null)[]).filter((row): row is [string, string] => row !== null).map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                    <span>{label}</span><span>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontWeight: 800, fontSize: 20, borderTop: '2px solid #cc0000', marginTop: 4 }}>
                  <span>Total ({selected.currency})</span>
                  <span style={{ color: '#cc0000' }}>{formatMoney(totals.total, selected.currency)}</span>
                </div>
              </div>
            </div>

            {selected.notes && (
              <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{selected.notes}</p>
              </div>
            )}

            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #eee', textAlign: 'center', fontSize: 11, color: '#aaa' }}>
              This estimate is valid until {selected.validUntil ? fmt(selected.validUntil) : 'further notice'} — {shopSettings?.companyName || 'Redlined1'}
              {shopSettings?.phone && ` · ${shopSettings.phone}`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
