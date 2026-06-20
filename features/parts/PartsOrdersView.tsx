'use client';

import { useEffect, useState, useCallback } from 'react';
import { useShop } from '@/lib/useShop';
import {
  fetchPartsOrders, createPartsOrder, updatePartsOrder, deletePartsOrder,
  fetchVendors, createVendor,
  PartsOrder, PartsVendor,
  ORDER_STATUSES, PAYMENT_STATUSES, PART_CONDITIONS,
} from '@/services/partsOrderService';
import { fetchCustomers } from '@/services/customerService';
import { fetchVehicles } from '@/services/vehicleService';
import type { Customer } from '@/lib/types';

/* ── Currency support ── */
const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD — Canadian Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN — Mexican Peso' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar' },
  { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen' },
];

function fmt(v: number, currency: string) {
  try {
    return v.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    const sym = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
    return `${sym}${v.toFixed(2)}`;
  }
}

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLOR: Record<string, string> = {
  'Ordered':      '#3b82f6',
  'Deposit Paid': '#8b5cf6',
  'Backordered':  '#f59e0b',
  'Received':     '#22c55e',
  'Returned':     '#6b7280',
  'Cancelled':    '#ef4444',
};
const PAY_COLOR: Record<string, string> = {
  'Unpaid':       '#ef4444',
  'Partial':      '#f59e0b',
  'Paid in Full': '#22c55e',
};

const EMPTY_ORDER: Omit<PartsOrder, 'id' | 'createdAt'> & { currency: string } = {
  partName: '', partNumber: '', quantity: 1, condition: 'New',
  vendorName: '', vendorPhone: '', vendorEmail: '',
  unitCost: 0, totalCost: 0, coreCharge: 0, depositPaid: 0, balanceDue: 0,
  status: 'Ordered', paymentStatus: 'Unpaid',
  orderDate: today(), etr: '', receivedDate: '',
  jobCardNumber: '', repairOrderNumber: '', estimateNumber: '', invoiceNumber: '',
  vehicle: '', customerName: '',
  warranty: '', notes: '',
  currency: 'USD',
};

const EMPTY_VENDOR = { name: '', phone: '', email: '', website: '', notes: '' };

type FormState = typeof EMPTY_ORDER;

export function PartsOrdersView() {
  const { shopId } = useShop();

  const [orders, setOrders]     = useState<PartsOrder[]>([]);
  const [vendors, setVendors]   = useState<PartsVendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; customerId: string; label: string }>>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState('');
  const [error, setError]       = useState('');

  /* form */
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_ORDER);
  const [saving, setSaving]       = useState(false);

  /* confirm modal */
  const [showConfirm, setShowConfirm] = useState(false);

  /* vendor modal */
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorForm, setVendorForm]           = useState(EMPTY_VENDOR);
  const [savingVendor, setSavingVendor]       = useState(false);

  /* filters */
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterVendor, setFilterVendor] = useState('All');
  const [search, setSearch]             = useState('');

  /* detail drawer */
  const [selected, setSelected] = useState<PartsOrder | null>(null);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    // Use allSettled so a permission error on parts_vendors doesn't block customers/vehicles
    const [ordersR, vendorsR, customersR, vehiclesR] = await Promise.allSettled([
      fetchPartsOrders(), fetchVendors(), fetchCustomers(), fetchVehicles(),
    ]);
    if (ordersR.status === 'fulfilled')    setOrders(ordersR.value);
    if (vendorsR.status === 'fulfilled')   setVendors(vendorsR.value);
    else setError('Vendor list unavailable — run the SQL fix in Supabase to enable parts_vendors RLS.');
    if (customersR.status === 'fulfilled') setCustomers(customersR.value);
    if (vehiclesR.status === 'fulfilled')  setVehicles(vehiclesR.value);
    setLoading(false);
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  /* vehicles filtered to selected customer */
  const customerVehicles = form.customerName
    ? vehicles.filter(v => {
        const c = customers.find(c => c.name === form.customerName);
        return c ? v.customerId === c.id : true;
      })
    : vehicles;

  /* auto-calc totals */
  function setF(patch: Partial<FormState>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      const total = next.unitCost * next.quantity;
      const balance = Math.max(0, total + next.coreCharge - next.depositPaid);
      const payStatus = next.depositPaid <= 0 ? 'Unpaid'
        : balance <= 0 ? 'Paid in Full' : 'Partial';
      return { ...next, totalCost: total, balanceDue: balance, paymentStatus: payStatus };
    });
  }

  function openNew() {
    setEditingId(null); setForm(EMPTY_ORDER); setShowForm(true);
  }

  function openEdit(o: PartsOrder) {
    setEditingId(o.id);
    setForm({
      partName: o.partName, partNumber: o.partNumber, quantity: o.quantity, condition: o.condition,
      vendorName: o.vendorName, vendorPhone: o.vendorPhone, vendorEmail: o.vendorEmail,
      unitCost: o.unitCost, totalCost: o.totalCost, coreCharge: o.coreCharge,
      depositPaid: o.depositPaid, balanceDue: o.balanceDue,
      status: o.status, paymentStatus: o.paymentStatus,
      orderDate: o.orderDate, etr: o.etr, receivedDate: o.receivedDate,
      jobCardNumber: o.jobCardNumber, repairOrderNumber: o.repairOrderNumber,
      estimateNumber: o.estimateNumber, invoiceNumber: o.invoiceNumber,
      vehicle: o.vehicle, customerName: o.customerName,
      warranty: o.warranty, notes: o.notes,
      currency: (o as PartsOrder & { currency?: string }).currency ?? 'USD',
    });
    setSelected(null); setShowForm(true);
  }

  /* step 1: form submit → show confirm modal */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partName.trim()) return;
    setShowConfirm(true);
  }

  /* step 2: confirmed → save */
  async function handleConfirmedSave() {
    setShowConfirm(false);
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updatePartsOrder(editingId, form as Omit<PartsOrder, 'id' | 'createdAt'>);
        setOrders(prev => prev.map(o => o.id === editingId ? updated : o));
        notify(`✓ "${updated.partName}" order updated.`);
      } else {
        const created = await createPartsOrder(form as Omit<PartsOrder, 'id' | 'createdAt'>);
        setOrders(prev => [created, ...prev]);
        notify(`✓ "${created.partName}" order saved.`);
      }
      setShowForm(false); setEditingId(null); setForm(EMPTY_ORDER);
    } catch (e: unknown) {
      setError((e as Record<string, unknown>)?.message as string || 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove order for "${name}"?`)) return;
    try {
      await deletePartsOrder(id);
      setOrders(prev => prev.filter(o => o.id !== id));
      setSelected(null);
      notify(`"${name}" order removed.`);
    } catch { notify('Delete failed.'); }
  }

  async function handleSaveVendor(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorForm.name.trim()) return;
    setSavingVendor(true);
    try {
      const v = await createVendor(vendorForm);
      setVendors(prev => [...prev, v]);
      setF({ vendorName: v.name, vendorPhone: v.phone, vendorEmail: v.email });
      setVendorForm(EMPTY_VENDOR);
      setShowVendorModal(false);
      notify(`Vendor "${v.name}" added.`);
    } catch { notify('Failed to add vendor.'); }
    finally { setSavingVendor(false); }
  }

  function handleVendorSelect(name: string) {
    const v = vendors.find(v => v.name === name);
    setF({ vendorName: name, vendorPhone: v?.phone ?? '', vendorEmail: v?.email ?? '' });
  }

  function handleCustomerSelect(name: string) {
    setF({ customerName: name, vehicle: '' }); // clear vehicle when customer changes
  }

  /* filters */
  const visible = orders.filter(o => {
    if (filterStatus !== 'All' && o.status !== filterStatus) return false;
    if (filterVendor !== 'All' && o.vendorName !== filterVendor) return false;
    if (search) {
      const q = search.toLowerCase();
      return [o.partName, o.partNumber, o.vendorName, o.customerName, o.vehicle,
              o.jobCardNumber, o.repairOrderNumber].some(f => f.toLowerCase().includes(q));
    }
    return true;
  });

  /* stats */
  const totalOrdered  = orders.filter(o => ['Ordered','Deposit Paid','Backordered'].includes(o.status)).length;
  const totalReceived = orders.filter(o => o.status === 'Received').length;
  const totalOwed     = orders.reduce((s, o) => s + o.balanceDue, 0);
  const totalDeposits = orders.reduce((s, o) => s + o.depositPaid, 0);
  const uniqueVendorNames = [...new Set(orders.map(o => o.vendorName).filter(Boolean))];

  const money = (v: number) => fmt(v, form.currency || 'USD');
  const moneyO = (v: number, o?: PartsOrder & { currency?: string }) =>
    fmt(v, o?.currency ?? 'USD');

  /* small helpers */
  const field = (label: string, children: React.ReactNode, full?: boolean) => (
    <div className="login-field" style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label>{label}</label>
      {children}
    </div>
  );
  const inp = (type: string, val: string | number, cb: (v: string) => void, ph?: string) => (
    <input type={type} value={val} onChange={e => cb(e.target.value)} placeholder={ph} />
  );
  const selStyle: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px',
    background: 'var(--surface-soft)', width: '100%',
  };

  /* ─── confirm summary ─── */
  const confirmSummary = () => {
    const cur = form.currency;
    return [
      { label: 'Part', value: `${form.partName}${form.partNumber ? ` (${form.partNumber})` : ''}` },
      { label: 'Qty / Condition', value: `${form.quantity} × ${form.condition}` },
      { label: 'Vendor', value: form.vendorName || '—' },
      { label: 'Customer', value: form.customerName || '—' },
      { label: 'Vehicle', value: form.vehicle || '—' },
      { label: 'Unit Cost', value: fmt(form.unitCost, cur) },
      { label: 'Total Cost', value: fmt(form.totalCost, cur) },
      { label: 'Core Charge', value: fmt(form.coreCharge, cur) },
      { label: 'Deposit Paid', value: fmt(form.depositPaid, cur) },
      { label: 'Balance Due', value: fmt(form.balanceDue, cur), highlight: form.balanceDue > 0 },
      { label: 'Currency', value: cur },
      { label: 'Status', value: form.status },
      { label: 'ETR', value: form.etr ? new Date(form.etr).toLocaleDateString() : '—' },
    ];
  };

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, background: '#111', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {toast}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,.1)', color: '#ef4444', borderRadius: 8, fontSize: 13 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'On Order',      value: totalOrdered,           color: '#3b82f6', sub: 'ordered / deposit / backorder' },
          { label: 'Received',      value: totalReceived,          color: '#22c55e', sub: 'this shop' },
          { label: 'Balance Due',   value: fmt(totalOwed, 'USD'),  color: '#ef4444', sub: 'outstanding to vendors' },
          { label: 'Deposits Paid', value: fmt(totalDeposits,'USD'), color: '#8b5cf6', sub: 'across all orders' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search part, vendor, job card, vehicle…"
          style={{ flex: 1, minWidth: 220, padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: 'var(--surface-soft)' }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-soft)', fontSize: 13 }}>
          <option value="All">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-soft)', fontSize: 13 }}>
          <option value="All">All Vendors</option>
          {uniqueVendorNames.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openNew}>+ New Parts Order</button>
      </div>

      {/* Table */}
      {loading
        ? <p style={{ color: 'var(--muted)', padding: 16 }}>Loading…</p>
        : visible.length === 0
          ? <p style={{ color: 'var(--muted)', padding: 16 }}>No parts orders yet. Click "+ New Parts Order" to start tracking.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Part</th><th>Vendor</th><th>Customer / Vehicle</th><th>Qty</th>
                    <th>Unit Cost</th><th>Deposit</th><th>Balance</th>
                    <th>Status</th><th>Payment</th><th>ETR</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(o => {
                    const oc = (o as PartsOrder & { currency?: string }).currency ?? 'USD';
                    return (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{o.partName}</div>
                          {o.partNumber && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.partNumber}</div>}
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.condition}</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>{o.vendorName || '—'}</div>
                          {o.vendorPhone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.vendorPhone}</div>}
                        </td>
                        <td>
                          {o.customerName && <div style={{ fontSize: 13, fontWeight: 600 }}>{o.customerName}</div>}
                          {o.vehicle && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.vehicle}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{o.quantity}</td>
                        <td>{fmt(o.unitCost, oc)}</td>
                        <td style={{ color: o.depositPaid > 0 ? '#8b5cf6' : 'var(--muted)' }}>{fmt(o.depositPaid, oc)}</td>
                        <td style={{ fontWeight: 700, color: o.balanceDue > 0 ? '#ef4444' : '#22c55e' }}>{fmt(o.balanceDue, oc)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[o.status] || '#888') + '22', color: STATUS_COLOR[o.status] || '#888', whiteSpace: 'nowrap' }}>
                            {o.status}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (PAY_COLOR[o.paymentStatus] || '#888') + '22', color: PAY_COLOR[o.paymentStatus] || '#888', whiteSpace: 'nowrap' }}>
                            {o.paymentStatus}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{o.etr ? new Date(o.etr).toLocaleDateString() : '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="row-actions">
                            <button className="mini-btn" onClick={() => openEdit(o)}>Edit</button>
                            <button className="mini-btn" style={{ color: 'var(--red,#cc0000)' }} onClick={() => handleDelete(o.id, o.partName)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      }

      {/* ── Detail Drawer ── */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw', background: 'var(--bg)', borderLeft: '1px solid var(--line)', zIndex: 301, overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface-soft)' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.partName}</div>
                {selected.partNumber && <div style={{ fontSize: 12, color: 'var(--muted)' }}>#{selected.partNumber}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[selected.status] || '#888') + '22', color: STATUS_COLOR[selected.status] || '#888' }}>{selected.status}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (PAY_COLOR[selected.paymentStatus] || '#888') + '22', color: PAY_COLOR[selected.paymentStatus] || '#888' }}>{selected.paymentStatus}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => openEdit(selected)} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✏ Edit</button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>✕</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px', flex: 1 }}>
              {/* Pricing */}
              <SectionLabel label="Pricing" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Unit Cost',   value: moneyO(selected.unitCost, selected as PartsOrder & { currency?: string }) },
                  { label: 'Qty × Total', value: `${selected.quantity} × ${moneyO(selected.unitCost, selected as PartsOrder & { currency?: string })} = ${moneyO(selected.totalCost, selected as PartsOrder & { currency?: string })}` },
                  { label: 'Core Charge', value: moneyO(selected.coreCharge, selected as PartsOrder & { currency?: string }) },
                  { label: 'Deposit Paid', value: moneyO(selected.depositPaid, selected as PartsOrder & { currency?: string }), color: '#8b5cf6' },
                  { label: 'Balance Due', value: moneyO(selected.balanceDue, selected as PartsOrder & { currency?: string }), color: selected.balanceDue > 0 ? '#ef4444' : '#22c55e' },
                  { label: 'Condition',   value: selected.condition },
                ].map(({ label, value, color }) => (
                  <InfoBox key={label} label={label} value={String(value)} color={color} />
                ))}
              </div>

              {/* Customer & Vehicle */}
              {(selected.customerName || selected.vehicle) && (
                <>
                  <SectionLabel label="Customer & Vehicle" />
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.customerName && <div style={{ fontSize: 13 }}>👤 <strong>{selected.customerName}</strong></div>}
                    {selected.vehicle && <div style={{ fontSize: 13 }}>🚗 {selected.vehicle}</div>}
                  </div>
                </>
              )}

              {/* Vendor */}
              {selected.vendorName && (
                <>
                  <SectionLabel label="Vendor" />
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.vendorName}</div>
                    {selected.vendorPhone && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{selected.vendorPhone}</div>}
                    {selected.vendorEmail && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.vendorEmail}</div>}
                  </div>
                </>
              )}

              {/* Dates */}
              <SectionLabel label="Dates" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Order Date', value: selected.orderDate },
                  { label: 'ETR',        value: selected.etr },
                  { label: 'Received',   value: selected.receivedDate },
                ].map(({ label, value }) => (
                  <InfoBox key={label} label={label} value={value ? new Date(value).toLocaleDateString() : '—'} />
                ))}
              </div>

              {/* Linked records */}
              {(selected.jobCardNumber || selected.repairOrderNumber || selected.estimateNumber || selected.invoiceNumber) && (
                <>
                  <SectionLabel label="Linked Records" />
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.jobCardNumber && <div style={{ fontSize: 13 }}>🗂 Job Card: <strong>{selected.jobCardNumber}</strong></div>}
                    {selected.repairOrderNumber && <div style={{ fontSize: 13 }}>🔧 Repair Order: <strong>{selected.repairOrderNumber}</strong></div>}
                    {selected.estimateNumber && <div style={{ fontSize: 13 }}>📋 Estimate: <strong>{selected.estimateNumber}</strong></div>}
                    {selected.invoiceNumber && <div style={{ fontSize: 13 }}>🧾 Invoice: <strong>{selected.invoiceNumber}</strong></div>}
                  </div>
                </>
              )}

              {(selected.warranty || selected.notes) && (
                <>
                  {selected.warranty && <><SectionLabel label="Warranty" /><div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>{selected.warranty}</div></>}
                  {selected.notes && <><SectionLabel label="Notes" /><div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>{selected.notes}</div></>}
                </>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openEdit(selected)}>✏ Edit Order</button>
              <button className="btn" style={{ color: '#ef4444' }} onClick={() => handleDelete(selected.id, selected.partName)}>Remove</button>
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </>
      )}

      {/* ── Add/Edit Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 700, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>
              {editingId ? '✏ Edit Parts Order' : '+ New Parts Order'}
            </div>

            <form onSubmit={handleFormSubmit}>

              {/* ── Part Details ── */}
              <FormSection label="Part Details" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Part Name *', inp('text', form.partName, v => setF({ partName: v }), 'e.g. Front Brake Rotor'), true)}
                {field('Part Number / SKU', inp('text', form.partNumber, v => setF({ partNumber: v }), 'e.g. BR-12345'))}
                {field('Condition', <select value={form.condition} onChange={e => setF({ condition: e.target.value })} style={selStyle}>{PART_CONDITIONS.map(o => <option key={o}>{o}</option>)}</select>)}
                {field('Quantity', <input type="number" min={1} value={form.quantity} onFocus={e => e.target.select()} onChange={e => setF({ quantity: Number(e.target.value) || 1 })} />)}
              </div>

              {/* ── Customer & Vehicle ── */}
              <FormSection label="Customer & Vehicle" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Customer', (
                  <select value={form.customerName} onChange={e => handleCustomerSelect(e.target.value)} style={selStyle}>
                    <option value="">— Select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    {form.customerName && !customers.find(c => c.name === form.customerName) && (
                      <option value={form.customerName}>{form.customerName}</option>
                    )}
                  </select>
                ))}
                {field('Vehicle', (
                  <select value={form.vehicle} onChange={e => setF({ vehicle: e.target.value })} style={selStyle}>
                    <option value="">— Select vehicle —</option>
                    {customerVehicles.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                    {form.vehicle && !customerVehicles.find(v => v.label === form.vehicle) && (
                      <option value={form.vehicle}>{form.vehicle}</option>
                    )}
                  </select>
                ))}
              </div>

              {/* ── Vendor ── */}
              <FormSection label="Vendor" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="login-field">
                  <label>Vendor Name</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={form.vendorName} onChange={e => handleVendorSelect(e.target.value)}
                      style={{ ...selStyle, flex: 1 }}>
                      <option value="">— Select vendor —</option>
                      {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                      {form.vendorName && !vendors.find(v => v.name === form.vendorName) && (
                        <option value={form.vendorName}>{form.vendorName}</option>
                      )}
                    </select>
                    <button type="button" onClick={() => setShowVendorModal(true)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      + Add
                    </button>
                  </div>
                </div>
                {field('Vendor Phone', inp('tel', form.vendorPhone, v => setF({ vendorPhone: v }), '555-000-0000'))}
                {field('Vendor Email', inp('email', form.vendorEmail, v => setF({ vendorEmail: v }), 'parts@vendor.com'))}
              </div>

              {/* ── Pricing ── */}
              <FormSection label="Pricing" />
              <div style={{ marginBottom: 10 }}>
                {field('Currency', (
                  <select value={form.currency} onChange={e => setF({ currency: e.target.value })} style={selStyle}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
                {field(`Unit Cost (${form.currency})`, <input type="number" min={0} step="0.01" value={form.unitCost || ''} placeholder="0.00" onChange={e => setF({ unitCost: Number(e.target.value) || 0 })} />)}
                {field(`Core Charge (${form.currency})`, <input type="number" min={0} step="0.01" value={form.coreCharge || ''} placeholder="0.00" onChange={e => setF({ coreCharge: Number(e.target.value) || 0 })} />)}
                {field(`Deposit Paid (${form.currency})`, <input type="number" min={0} step="0.01" value={form.depositPaid || ''} placeholder="0.00" onChange={e => setF({ depositPaid: Number(e.target.value) || 0 })} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <CalcBox label="Total Cost" value={money(form.totalCost)} />
                <CalcBox label="Balance Due" value={money(form.balanceDue)} color={form.balanceDue > 0 ? '#ef4444' : '#22c55e'} />
                <CalcBox label="Payment" value={form.paymentStatus} color={PAY_COLOR[form.paymentStatus]} />
              </div>

              {/* ── Status & Dates ── */}
              <FormSection label="Status & Dates" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Order Status', <select value={form.status} onChange={e => setF({ status: e.target.value })} style={selStyle}>{ORDER_STATUSES.map(o => <option key={o}>{o}</option>)}</select>)}
                {field('Order Date', inp('date', form.orderDate, v => setF({ orderDate: v })))}
                {field('ETR (Expected Arrival)', inp('date', form.etr, v => setF({ etr: v })))}
                {field('Received Date', inp('date', form.receivedDate, v => setF({ receivedDate: v })))}
              </div>

              {/* ── Linked Records ── */}
              <FormSection label="Linked Records" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Job Card #', inp('text', form.jobCardNumber, v => setF({ jobCardNumber: v }), 'e.g. JC-1042'))}
                {field('Repair Order #', inp('text', form.repairOrderNumber, v => setF({ repairOrderNumber: v }), 'e.g. RO-00012'))}
                {field('Estimate #', inp('text', form.estimateNumber, v => setF({ estimateNumber: v }), 'e.g. EST-0001'))}
                {field('Invoice #', inp('text', form.invoiceNumber, v => setF({ invoiceNumber: v }), 'e.g. INV-0001'))}
              </div>

              {/* ── Warranty & Notes ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 24 }}>
                {field('Warranty', inp('text', form.warranty, v => setF({ warranty: v }), 'e.g. 12 months / 12,000 miles'), true)}
                {field('Notes', <textarea value={form.notes} onChange={e => setF({ notes: e.target.value })} rows={2} placeholder="Any additional notes…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', width: '100%' }} />, true)}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_ORDER); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {editingId ? 'Review & Update' : 'Review & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Save Modal ── */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              {editingId ? 'Confirm Update' : 'Confirm Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              Review the details below before saving.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {confirmSummary().map(({ label, value, highlight }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--surface-soft)', borderRadius: 7, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', minWidth: 120 }}>{label}</span>
                  <span style={{ fontWeight: 700, color: highlight ? '#ef4444' : 'var(--text)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowConfirm(false)}>← Back to Edit</button>
              <button className="btn btn-primary" onClick={handleConfirmedSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? '✓ Confirm Update' : '✓ Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Vendor Modal ── */}
      {showVendorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowVendorModal(false); }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>Add Vendor</div>
            <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="login-field"><label>Vendor Name *</label><input required value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AutoZone Pro" /></div>
              <div className="login-field"><label>Phone</label><input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="555-000-0000" /></div>
              <div className="login-field"><label>Email</label><input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="parts@vendor.com" /></div>
              <div className="login-field"><label>Website</label><input value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))} placeholder="www.vendor.com" /></div>
              <div className="login-field"><label>Notes</label><input value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} placeholder="Account #, terms, etc." /></div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setShowVendorModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingVendor}>{savingVendor ? 'Saving…' : 'Add Vendor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── tiny sub-components to reduce repetition ── */
function SectionLabel({ label }: { label: string }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>{label}</div>;
}
function FormSection({ label }: { label: string }) {
  return <SectionLabel label={label} />;
}
function InfoBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}
function CalcBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 15, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}
