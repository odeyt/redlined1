'use client';

import { useEffect, useState, useCallback } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import {
  fetchPartsOrders, createPartsOrder, updatePartsOrder, deletePartsOrder,
  fetchVendors, createVendor, updateVendor, deleteVendor,
  PartsOrder, PartsVendor, LineItem,
  ORDER_STATUSES, PAYMENT_STATUSES, PART_CONDITIONS,
} from '@/services/partsOrderService';
import { fetchCustomers } from '@/services/customerService';
import { fetchVehicles } from '@/services/vehicleService';
import type { Customer } from '@/lib/types';

/* ── Currency support ── */
const CURRENCIES = [
  { code: 'USD', symbol: '$',    label: 'USD — US Dollar' },
  { code: 'EUR', symbol: '€',   label: 'EUR — Euro' },
  { code: 'GBP', symbol: '£',   label: 'GBP — British Pound' },
  { code: 'JPY', symbol: '¥',   label: 'JPY — Japanese Yen' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', symbol: 'A$',  label: 'AUD — Australian Dollar' },
  { code: 'CHF', symbol: 'Fr',  label: 'CHF — Swiss Franc' },
  { code: 'CNY', symbol: '¥',   label: 'CNY — Chinese Yuan' },
  { code: 'HKD', symbol: 'HK$', label: 'HKD — Hong Kong Dollar' },
  { code: 'SGD', symbol: 'S$',  label: 'SGD — Singapore Dollar' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN — Mexican Peso' },
  { code: 'BRL', symbol: 'R$',  label: 'BRL — Brazilian Real' },
  { code: 'INR', symbol: '₹',   label: 'INR — Indian Rupee' },
  { code: 'KRW', symbol: '₩',   label: 'KRW — South Korean Won' },
  { code: 'SEK', symbol: 'kr',  label: 'SEK — Swedish Krona' },
  { code: 'NOK', symbol: 'kr',  label: 'NOK — Norwegian Krone' },
  { code: 'DKK', symbol: 'kr',  label: 'DKK — Danish Krone' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD — New Zealand Dollar' },
  { code: 'ZAR', symbol: 'R',   label: 'ZAR — South African Rand' },
  { code: 'AED', symbol: 'د.إ', label: 'AED — UAE Dirham' },
  { code: 'SAR', symbol: '﷼',   label: 'SAR — Saudi Riyal' },
  { code: 'THB', symbol: '฿',   label: 'THB — Thai Baht' },
  { code: 'MYR', symbol: 'RM',  label: 'MYR — Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp',  label: 'IDR — Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱',   label: 'PHP — Philippine Peso' },
  { code: 'VND', symbol: '₫',   label: 'VND — Vietnamese Dong' },
  { code: 'LAK', symbol: '₭',   label: 'LAK — Lao Kip' },
  { code: 'KHR', symbol: '៛',   label: 'KHR — Cambodian Riel' },
  { code: 'TWD', symbol: 'NT$', label: 'TWD — Taiwan Dollar' },
  { code: 'PKR', symbol: '₨',   label: 'PKR — Pakistani Rupee' },
  { code: 'BDT', symbol: '৳',   label: 'BDT — Bangladeshi Taka' },
  { code: 'TRY', symbol: '₺',   label: 'TRY — Turkish Lira' },
  { code: 'RUB', symbol: '₽',   label: 'RUB — Russian Ruble' },
  { code: 'PLN', symbol: 'zł',  label: 'PLN — Polish Złoty' },
  { code: 'CZK', symbol: 'Kč',  label: 'CZK — Czech Koruna' },
  { code: 'HUF', symbol: 'Ft',  label: 'HUF — Hungarian Forint' },
  { code: 'RON', symbol: 'lei', label: 'RON — Romanian Leu' },
  { code: 'EGP', symbol: '£',   label: 'EGP — Egyptian Pound' },
  { code: 'NGN', symbol: '₦',   label: 'NGN — Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', label: 'KES — Kenyan Shilling' },
  { code: 'GHS', symbol: '₵',   label: 'GHS — Ghanaian Cedi' },
  { code: 'CLP', symbol: '$',   label: 'CLP — Chilean Peso' },
  { code: 'COP', symbol: '$',   label: 'COP — Colombian Peso' },
  { code: 'ARS', symbol: '$',   label: 'ARS — Argentine Peso' },
  { code: 'PEN', symbol: 'S/',  label: 'PEN — Peruvian Sol' },
  { code: 'ILS', symbol: '₪',   label: 'ILS — Israeli New Shekel' },
  { code: 'QAR', symbol: '﷼',   label: 'QAR — Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك', label: 'KWD — Kuwaiti Dinar' },
  { code: 'BHD', symbol: '.د.ب', label: 'BHD — Bahraini Dinar' },
  { code: 'OMR', symbol: '﷼',   label: 'OMR — Omani Rial' },
  { code: 'JOD', symbol: 'JD',  label: 'JOD — Jordanian Dinar' },
  { code: 'MAD', symbol: 'MAD', label: 'MAD — Moroccan Dirham' },
  { code: 'UAH', symbol: '₴',   label: 'UAH — Ukrainian Hryvnia' },
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
  'Pending':          '#6b7280',
  'Ordered':          '#3b82f6',
  'Deposit Paid':     '#8b5cf6',
  'Waiting Customer': '#f59e0b',
  'Pending Customer': '#ec4899',
  'Backordered':      '#f97316',
  'Received':         '#22c55e',
  'Returned':         '#94a3b8',
  'Cancelled':        '#ef4444',
};
const PAY_COLOR: Record<string, string> = {
  'Unpaid':       '#ef4444',
  'Partial':      '#f59e0b',
  'Paid in Full': '#22c55e',
};

const EMPTY_LINE: LineItem = { partName: '', partNumber: '', condition: 'New', quantity: 1, unitCost: 0 };

type FormState = {
  lineItems: LineItem[];
  vendorName: string; vendorPhone: string; vendorEmail: string;
  coreCharge: number; depositPaid: number;
  totalCost: number; balanceDue: number; paymentStatus: string;
  status: string;
  orderDate: string; etr: string; receivedDate: string;
  jobCardNumber: string; repairOrderNumber: string; estimateNumber: string; invoiceNumber: string;
  vehicle: string; customerName: string;
  warranty: string; notes: string;
  currency: string;
};

const EMPTY_ORDER: FormState = {
  lineItems: [{ ...EMPTY_LINE }],
  vendorName: '', vendorPhone: '', vendorEmail: '',
  coreCharge: 0, depositPaid: 0,
  totalCost: 0, balanceDue: 0, paymentStatus: 'Unpaid',
  status: 'Pending',
  orderDate: today(), etr: '', receivedDate: '',
  jobCardNumber: '', repairOrderNumber: '', estimateNumber: '', invoiceNumber: '',
  vehicle: '', customerName: '',
  warranty: '', notes: '',
  currency: 'USD',
};

const EMPTY_VENDOR = { name: '', phone: '', email: '', website: '', notes: '' };

function calcTotals(items: LineItem[], coreCharge: number, depositPaid: number) {
  const total = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const balance = Math.max(0, total + coreCharge - depositPaid);
  const payStatus = depositPaid <= 0 ? 'Unpaid' : balance <= 0 ? 'Paid in Full' : 'Partial';
  return { totalCost: total, balanceDue: balance, paymentStatus: payStatus };
}

export function PartsOrdersView() {
  const { shopId } = useShop();
  const dispatch = useAppDispatch();

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
  const [formError, setFormError] = useState('');

  /* vendor modal */
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorForm, setVendorForm]           = useState(EMPTY_VENDOR);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [savingVendor, setSavingVendor]       = useState(false);
  const [vendorTab, setVendorTab]             = useState<'list' | 'add'>('list');

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
    const [ordersR, vendorsR, customersR, vehiclesR] = await Promise.allSettled([
      fetchPartsOrders(), fetchVendors(), fetchCustomers(), fetchVehicles(),
    ]);
    if (ordersR.status === 'fulfilled') {
      setOrders(ordersR.value);
    } else {
      const msg = (ordersR.reason as {message?: string})?.message ?? String(ordersR.reason);
      setError(`Could not load parts orders: ${msg}`);
    }
    if (vendorsR.status === 'fulfilled')   { setVendors(vendorsR.value); }
    else if (ordersR.status === 'fulfilled') setError('Vendor list unavailable — check parts_vendors table permissions.');
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

  /* patch form fields and recompute totals */
  function setF(patch: Partial<FormState>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      const totals = calcTotals(next.lineItems, next.coreCharge, next.depositPaid);
      return { ...next, ...totals };
    });
  }

  /* line item operations */
  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setForm(prev => {
      const lineItems = prev.lineItems.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      );
      return { ...prev, lineItems, ...calcTotals(lineItems, prev.coreCharge, prev.depositPaid) };
    });
  }

  function addLineItem() {
    setForm(prev => {
      const lineItems = [...prev.lineItems, { ...EMPTY_LINE }];
      return { ...prev, lineItems };
    });
  }

  function removeLineItem(idx: number) {
    setForm(prev => {
      const lineItems = prev.lineItems.filter((_, i) => i !== idx);
      return { ...prev, lineItems, ...calcTotals(lineItems, prev.coreCharge, prev.depositPaid) };
    });
  }

  function openNew() {
    setEditingId(null); setForm(EMPTY_ORDER); setShowForm(true);
  }

  function openEdit(o: PartsOrder) {
    setEditingId(o.id);
    const lineItems = o.lineItems && o.lineItems.length > 0 ? o.lineItems : [{
      partName: o.partName, partNumber: o.partNumber,
      condition: o.condition, quantity: o.quantity, unitCost: o.unitCost,
    }];
    const totals = calcTotals(lineItems, o.coreCharge, o.depositPaid);
    setForm({
      lineItems,
      vendorName: o.vendorName, vendorPhone: o.vendorPhone, vendorEmail: o.vendorEmail,
      coreCharge: o.coreCharge, depositPaid: o.depositPaid,
      ...totals,
      status: o.status, paymentStatus: o.paymentStatus,
      orderDate: o.orderDate, etr: o.etr, receivedDate: o.receivedDate,
      jobCardNumber: o.jobCardNumber, repairOrderNumber: o.repairOrderNumber,
      estimateNumber: o.estimateNumber, invoiceNumber: o.invoiceNumber,
      vehicle: o.vehicle, customerName: o.customerName,
      warranty: o.warranty, notes: o.notes,
      currency: o.currency || 'USD',
    });
    setSelected(null); setShowForm(true);
  }

  /* step 1: form submit → show confirm modal */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasItem = form.lineItems.some(i => i.partName.trim());
    if (!hasItem) return;
    setShowConfirm(true);
  }

  /* step 2: confirmed → save */
  async function handleConfirmedSave() {
    setShowConfirm(false);
    setSaving(true);
    setFormError('');
    // Build the PartsOrder payload from form
    const payload: Omit<PartsOrder, 'id' | 'createdAt'> = {
      lineItems: form.lineItems,
      partName: form.lineItems[0]?.partName || '',
      partNumber: form.lineItems[0]?.partNumber || '',
      condition: form.lineItems[0]?.condition || 'New',
      quantity: form.lineItems.reduce((s, i) => s + i.quantity, 0),
      unitCost: form.lineItems.length === 1 ? form.lineItems[0].unitCost : 0,
      vendorName: form.vendorName, vendorPhone: form.vendorPhone, vendorEmail: form.vendorEmail,
      coreCharge: form.coreCharge, depositPaid: form.depositPaid,
      totalCost: form.totalCost, balanceDue: form.balanceDue,
      status: form.status, paymentStatus: form.paymentStatus,
      orderDate: form.orderDate, etr: form.etr, receivedDate: form.receivedDate,
      jobCardNumber: form.jobCardNumber, repairOrderNumber: form.repairOrderNumber,
      estimateNumber: form.estimateNumber, invoiceNumber: form.invoiceNumber,
      vehicle: form.vehicle, customerName: form.customerName,
      warranty: form.warranty, notes: form.notes,
      currency: form.currency,
    };
    try {
      if (editingId) {
        const updated = await updatePartsOrder(editingId, payload);
        setOrders(prev => prev.map(o => o.id === editingId ? updated : o));
        notify(`✓ Order updated.`);
      } else {
        const created = await createPartsOrder(payload);
        setOrders(prev => [created, ...prev]);
        notify(`✓ Order saved.`);
      }
      setShowForm(false); setEditingId(null); setForm(EMPTY_ORDER);
    } catch (e: unknown) {
      const msg = (e as Record<string, unknown>)?.message as string || 'Save failed — please try again.';
      setFormError(msg);
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
      if (editingVendorId) {
        const v = await updateVendor(editingVendorId, vendorForm);
        setVendors(prev => prev.map(x => x.id === v.id ? v : x));
        notify(`Vendor "${v.name}" updated.`);
      } else {
        const v = await createVendor(vendorForm);
        setVendors(prev => [...prev, v]);
        setF({ vendorName: v.name, vendorPhone: v.phone, vendorEmail: v.email });
        notify(`Vendor "${v.name}" added.`);
      }
      setVendorForm(EMPTY_VENDOR);
      setEditingVendorId(null);
      setVendorTab('list');
    } catch { notify('Failed to save vendor.'); }
    finally { setSavingVendor(false); }
  }

  async function handleDeleteVendor(id: string, name: string) {
    if (!confirm(`Remove vendor "${name}"? This won't affect existing orders.`)) return;
    try {
      await deleteVendor(id);
      setVendors(prev => prev.filter(v => v.id !== id));
      notify(`Vendor "${name}" removed.`);
    } catch { notify('Failed to remove vendor.'); }
  }

  function openAddVendor() {
    setEditingVendorId(null);
    setVendorForm(EMPTY_VENDOR);
    setVendorTab('add');
    setShowVendorModal(true);
  }

  function openEditVendor(v: PartsVendor) {
    setEditingVendorId(v.id);
    setVendorForm({ name: v.name, phone: v.phone, email: v.email, website: v.website, notes: v.notes });
    setVendorTab('add');
  }

  function handleVendorSelect(name: string) {
    const v = vendors.find(v => v.name === name);
    setF({ vendorName: name, vendorPhone: v?.phone ?? '', vendorEmail: v?.email ?? '' });
  }

  function handleCustomerSelect(name: string) {
    setF({ customerName: name, vehicle: '' });
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
  const totalOrdered  = orders.filter(o => ['Pending','Ordered','Deposit Paid','Waiting Customer','Backordered'].includes(o.status)).length;
  const totalReceived = orders.filter(o => o.status === 'Received').length;
  const totalOwed     = orders.reduce((s, o) => s + o.balanceDue, 0);
  const totalDeposits = orders.reduce((s, o) => s + o.depositPaid, 0);
  const uniqueVendorNames = [...new Set(orders.map(o => o.vendorName).filter(Boolean))];

  function navigateToLinkedRecord(module: string, eventName: string, detail: Record<string, string>) {
    setSelected(null);
    dispatch({ type: 'SET_MODULE', module });
    setTimeout(() => window.dispatchEvent(new CustomEvent(eventName, { detail })), 80);
  }

  const money = (v: number) => fmt(v, form.currency || 'USD');
  const moneyO = (v: number, o?: PartsOrder) => fmt(v, o?.currency || 'USD');

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
  const cellInput: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px',
    background: 'var(--surface-soft)', fontSize: 13, width: '100%', boxSizing: 'border-box',
  };
  const thStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left',
    borderBottom: '2px solid var(--line)', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = { padding: '6px 6px 6px 0', verticalAlign: 'top' };

  /* ─── confirm summary ─── */
  const confirmSummary = () => {
    const cur = form.currency;
    const rows: { label: string; value: string; highlight?: boolean }[] = [];
    form.lineItems.forEach((item, idx) => {
      rows.push({ label: `Part ${form.lineItems.length > 1 ? idx + 1 : ''}`.trim(),
        value: `${item.partName}${item.partNumber ? ` (${item.partNumber})` : ''}` });
      rows.push({ label: '  Qty / Condition', value: `${item.quantity} × ${item.condition}` });
      rows.push({ label: '  Unit / Line Total', value: `${fmt(item.unitCost, cur)} → ${fmt(item.unitCost * item.quantity, cur)}` });
    });
    rows.push(
      { label: 'Vendor',       value: form.vendorName || '—' },
      { label: 'Customer',     value: form.customerName || '—' },
      { label: 'Vehicle',      value: form.vehicle || '—' },
      { label: 'Parts Total',  value: fmt(form.totalCost, cur) },
      { label: 'Core Charge',  value: fmt(form.coreCharge, cur) },
      { label: 'Deposit Paid', value: fmt(form.depositPaid, cur) },
      { label: 'Balance Due',  value: fmt(form.balanceDue, cur), highlight: form.balanceDue > 0 },
      { label: 'Currency',     value: cur },
      { label: 'Status',       value: form.status },
      { label: 'ETR',          value: form.etr ? new Date(form.etr).toLocaleDateString() : '—' },
    );
    return rows;
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
          { label: 'On Order',      value: totalOrdered,           color: '#3b82f6', sub: 'pending / ordered / waiting' },
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
                    <th>Customer / Vehicle</th><th>Parts</th><th>Vendor</th>
                    <th>Total Cost</th><th>Deposit</th><th>Balance</th>
                    <th>Status</th><th>Payment</th><th>ETR</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(o => {
                    const oc = o.currency || 'USD';
                    const items = o.lineItems && o.lineItems.length > 0 ? o.lineItems : [{ partName: o.partName, partNumber: o.partNumber, condition: o.condition, quantity: o.quantity, unitCost: o.unitCost }];
                    const firstItem = items[0];
                    return (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
                        <td>
                          {o.customerName && <div style={{ fontSize: 13, fontWeight: 600 }}>{o.customerName}</div>}
                          {o.vehicle && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.vehicle}</div>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{firstItem.partName}</div>
                          {firstItem.partNumber && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{firstItem.partNumber}</div>}
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{firstItem.condition} · qty {items.reduce((s, i) => s + i.quantity, 0)}</div>
                          {items.length > 1 && (
                            <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>+{items.length - 1} more part{items.length > 2 ? 's' : ''}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>{o.vendorName || '—'}</div>
                          {o.vendorPhone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.vendorPhone}</div>}
                        </td>
                        <td>{fmt(o.totalCost, oc)}</td>
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
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.partName || selected.lineItems?.[0]?.partName || 'Parts Order'}</div>
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
              {/* Line Items */}
              <SectionLabel label={`Parts (${(selected.lineItems?.length ?? 1)} item${(selected.lineItems?.length ?? 1) !== 1 ? 's' : ''})`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {(selected.lineItems && selected.lineItems.length > 0 ? selected.lineItems : [{
                  partName: selected.partName, partNumber: selected.partNumber,
                  condition: selected.condition, quantity: selected.quantity, unitCost: selected.unitCost,
                }]).map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.partName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 12 }}>
                      {item.partNumber && <span>#{item.partNumber}</span>}
                      <span>{item.condition}</span>
                      <span>Qty: {item.quantity}</span>
                      <span>{moneyO(item.unitCost, selected)} each</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--accent)' }}>
                      Line total: {moneyO(item.unitCost * item.quantity, selected)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pricing summary */}
              <SectionLabel label="Pricing Summary" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Parts Total',  value: moneyO(selected.totalCost, selected) },
                  { label: 'Core Charge',  value: moneyO(selected.coreCharge, selected) },
                  { label: 'Deposit Paid', value: moneyO(selected.depositPaid, selected), color: '#8b5cf6' },
                  { label: 'Balance Due',  value: moneyO(selected.balanceDue, selected), color: selected.balanceDue > 0 ? '#ef4444' : '#22c55e' },
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
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selected.jobCardNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>🗂 Job Card: <strong>{selected.jobCardNumber}</strong></span>
                        <button onClick={() => navigateToLinkedRecord('job-cards', 'open-job-card', { jobCardId: selected.jobCardNumber })}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                          Open →
                        </button>
                      </div>
                    )}
                    {selected.repairOrderNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>🔧 Repair Order: <strong>{selected.repairOrderNumber}</strong></span>
                        <button onClick={() => navigateToLinkedRecord('repair-orders', 'open-ro', { roNumber: selected.repairOrderNumber })}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                          Open →
                        </button>
                      </div>
                    )}
                    {selected.estimateNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>📋 Estimate: <strong>{selected.estimateNumber}</strong></span>
                        <button onClick={() => navigateToLinkedRecord('estimates', 'open-estimate', { estimateNumber: selected.estimateNumber })}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                          Open →
                        </button>
                      </div>
                    )}
                    {selected.invoiceNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>🧾 Invoice: <strong>{selected.invoiceNumber}</strong></span>
                        <button onClick={() => navigateToLinkedRecord('invoices', 'open-invoice', { invoiceNumber: selected.invoiceNumber })}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                          Open →
                        </button>
                      </div>
                    )}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 800, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {editingId ? '✏ Edit Parts Order' : '+ New Parts Order'}
              </div>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_ORDER); setFormError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)', lineHeight: 1 }}>✕</button>
            </div>

            {formError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.1)', color: '#dc2626', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠ {formError}</span>
                <button onClick={() => setFormError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
              </div>
            )}

            <form onSubmit={handleFormSubmit}>

              {/* ── Parts Table ── */}
              <FormSection label="Parts" />
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Part Name *</th>
                      <th style={thStyle}>Part # / SKU</th>
                      <th style={thStyle}>Condition</th>
                      <th style={{ ...thStyle, width: 70 }}>Qty</th>
                      <th style={{ ...thStyle, width: 110 }}>Unit Cost</th>
                      <th style={{ ...thStyle, width: 100 }}>Line Total</th>
                      <th style={{ ...thStyle, width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>
                          <input
                            value={item.partName}
                            onChange={e => updateLineItem(idx, 'partName', e.target.value)}
                            placeholder="e.g. Brake Rotor"
                            style={cellInput}
                          />
                        </td>
                        <td style={tdStyle}>
                          <input
                            value={item.partNumber}
                            onChange={e => updateLineItem(idx, 'partNumber', e.target.value)}
                            placeholder="SKU"
                            style={cellInput}
                          />
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={item.condition}
                            onChange={e => updateLineItem(idx, 'condition', e.target.value)}
                            style={{ ...cellInput, paddingRight: 6 }}
                          >
                            {PART_CONDITIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="number" min={1}
                            value={item.quantity}
                            onFocus={e => e.target.select()}
                            onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value) || 1)}
                            style={{ ...cellInput, textAlign: 'center' }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="number" min={0} step="0.01"
                            value={item.unitCost || ''}
                            placeholder="0.00"
                            onFocus={e => e.target.select()}
                            onChange={e => updateLineItem(idx, 'unitCost', Number(e.target.value) || 0)}
                            style={cellInput}
                          />
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, fontSize: 13, paddingLeft: 8, whiteSpace: 'nowrap', color: 'var(--accent)' }}>
                          {fmt(item.unitCost * item.quantity, form.currency)}
                        </td>
                        <td style={tdStyle}>
                          {form.lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(idx)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, padding: '4px 6px', lineHeight: 1 }}>
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addLineItem}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 24 }}>
                + Add Part
              </button>

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
                    <button type="button" onClick={openAddVendor}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      + Add
                    </button>
                    <button type="button" onClick={() => { setVendorTab('list'); setShowVendorModal(true); }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      ⚙ Manage
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {field(`Core Charge (${form.currency})`, <input type="number" min={0} step="0.01" value={form.coreCharge || ''} placeholder="0.00" onChange={e => setF({ coreCharge: Number(e.target.value) || 0 })} />)}
                {field(`Deposit Paid (${form.currency})`, <input type="number" min={0} step="0.01" value={form.depositPaid || ''} placeholder="0.00" onChange={e => setF({ depositPaid: Number(e.target.value) || 0 })} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <CalcBox label="Parts Total" value={money(form.totalCost)} />
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
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_ORDER); setFormError(''); }}>Cancel</button>
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
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              {editingId ? 'Confirm Update' : 'Confirm Order'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              Review the details below before saving.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {confirmSummary().map(({ label, value, highlight }, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: label.startsWith('  ') ? 'transparent' : 'var(--surface-soft)', borderRadius: 7, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', minWidth: 140 }}>{label.trim()}</span>
                  <span style={{ fontWeight: 700, color: highlight ? '#ef4444' : 'var(--text)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setShowConfirm(false); }}>← Back to Edit</button>
              <button className="btn btn-primary" onClick={handleConfirmedSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? '✓ Confirm Update' : '✓ Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor Manager Modal ── */}
      {showVendorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowVendorModal(false); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); setVendorTab('list'); } }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Vendor Manager</div>
              <button onClick={() => { setShowVendorModal(false); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); setVendorTab('list'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
              <button onClick={() => { setVendorTab('list'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: vendorTab === 'list' ? 700 : 400, background: vendorTab === 'list' ? 'var(--accent)' : 'var(--surface-soft)', color: vendorTab === 'list' ? '#fff' : 'var(--text)', fontSize: 13 }}>
                All Vendors ({vendors.length})
              </button>
              <button onClick={() => { setVendorTab('add'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: vendorTab === 'add' ? 700 : 400, background: vendorTab === 'add' ? 'var(--accent)' : 'var(--surface-soft)', color: vendorTab === 'add' ? '#fff' : 'var(--text)', fontSize: 13 }}>
                {editingVendorId ? '✏ Edit Vendor' : '+ Add Vendor'}
              </button>
            </div>

            {vendorTab === 'list' && (
              <div>
                {vendors.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No vendors yet. Click "+ Add Vendor" to create one.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {vendors.map(v => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                          {v.phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.phone}</div>}
                          {v.email && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.email}</div>}
                          {v.website && <div style={{ fontSize: 11, color: '#3b82f6' }}>{v.website}</div>}
                          {v.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{v.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => openEditVendor(v)}
                            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ✏ Edit
                          </button>
                          <button onClick={() => handleDeleteVendor(v.id, v.name)}
                            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff0f0', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            🗑 Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setVendorTab('add'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}
                  className="btn btn-primary" style={{ marginTop: 16, width: '100%' }}>
                  + Add New Vendor
                </button>
              </div>
            )}

            {vendorTab === 'add' && (
              <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="login-field">
                  <label>Vendor Name *</label>
                  <input required value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AutoZone Pro" />
                </div>
                <div className="login-field"><label>Phone</label><input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="555-000-0000" /></div>
                <div className="login-field"><label>Email</label><input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="parts@vendor.com" /></div>
                <div className="login-field"><label>Website</label><input value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))} placeholder="www.vendor.com" /></div>
                <div className="login-field"><label>Account # / Notes</label><input value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} placeholder="Account #, terms, net-30, etc." /></div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => { setVendorTab('list'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}>← Back</button>
                  <button type="submit" className="btn btn-primary" disabled={savingVendor}>
                    {savingVendor ? 'Saving…' : editingVendorId ? '✓ Save Changes' : '+ Add Vendor'}
                  </button>
                </div>
              </form>
            )}
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

// Suppress unused import warning
void (PAYMENT_STATUSES);
