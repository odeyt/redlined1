'use client';

import { useEffect, useRef, useState } from 'react';
import { usePagination } from '@/lib/usePagination';
import { Pagination } from '@/components/Pagination';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchInvoices, createInvoice, updateInvoice, markInvoicePaid,
  deleteInvoice, nextInvoiceNumber, calculateTotals, formatMoney, CURRENCIES,
  type InvoiceFull, type InvoiceLine,
} from '@/services/invoiceService';
import { createPayment, fetchPayments, type Payment } from '@/services/paymentService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { fetchShopSettings, type ShopSettings } from '@/services/shopSettingsService';
import { usePlan, } from '@/lib/usePlan';
import { needsWatermark } from '@/lib/planGate';
import { FilterPills } from '@/components/FilterPills';
const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';

// This portal only uses these 3 currencies
const PORTAL_CURRENCIES = ['USD', 'THB', 'LAK'];

const STATUS_COLORS: Record<string, string> = {
  Draft: '#888', Sent: '#2196f3', Paid: '#4caf50', Void: '#f44336',
};

type FormLine = { note: string; description: string; laoDescription: string; qty: string; cost: string; markup: string; rate: string; currency: string };
const EMPTY_LINE: FormLine = { note: '', description: '', laoDescription: '', qty: '1', cost: '', markup: '', rate: '0', currency: '' };

async function translateToLao(text: string): Promise<string> {
  if (!text.trim()) return '';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|lo`);
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch { return text; }
}

const EMPTY_FORM = {
  invoiceNumber: '',
  customerName: '',
  customerId: '',
  vehicle: '',
  jobCardId: '',
  status: 'Draft',
  lines: [{ ...EMPTY_LINE }] as FormLine[],
  discount: 0,
  shopSupplies: 0,
  taxRate: 0,
  notes: '',
  dueDate: '',
  paidDate: null as string | null,
  currency: 'USD',
};

export function InvoicesView() {
  const dispatch = useAppDispatch();
  const { prefill } = useAppState();
  const { status: planStatus } = usePlan();
  const [invoices, setInvoices] = useState<InvoiceFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<InvoiceFull | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [custVehicles, setCustVehicles] = useState<{ id: string; label: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<Payment[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const ratesCache = useRef<Record<string, Record<string, number>>>({});
  const [ratesFetching, setRatesFetching] = useState(false);

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
  }, []);

  useEffect(() => {
    function handleOpenInvoice(e: Event) {
      const { invoiceNumber } = (e as CustomEvent).detail ?? {};
      if (!invoiceNumber) return;
      setInvoices(current => {
        const found = current.find(inv => inv.invoiceNumber === invoiceNumber);
        if (found) { setSelected(found); setShowForm(false); }
        return current;
      });
    }
    window.addEventListener('open-invoice', handleOpenInvoice);
    return () => window.removeEventListener('open-invoice', handleOpenInvoice);
  }, []);

  useEffect(() => {
    if (!selected) { setInvoicePayments([]); return; }
    fetchPayments().then(all => {
      setInvoicePayments(all.filter(p =>
        p.invoiceNumber === selected.invoiceNumber &&
        p.status !== 'Void' && p.status !== 'Refunded'
      ));
    }).catch(() => {});
  }, [selected?.id]);

  // Prefill: other modules (or header button) can navigate here with optional customer data
  useEffect(() => {
    const p = prefill as Record<string, unknown> | null;
    if (!p?.customerName && !p?.openNewForm) return;
    nextInvoiceNumber().then(num => {
      setForm(f => ({
        ...f,
        invoiceNumber: num,
        customerName: (p?.customerName as string) ?? '',
        customerId: (p?.customerId as string) ?? '',
        vehicle: (p?.vehicle as string) ?? '',
      }));
      setEditingId(null);
      setShowForm(true);
      setSelected(null);
      dispatch({ type: 'CLEAR_PREFILL' });
    }).catch(() => {});
  }, [prefill]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchInvoices();
      setInvoices(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } catch (e: unknown) {
      setError('Load error: ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function openNewForm() {
    const num = await nextInvoiceNumber();
    setForm({ ...EMPTY_FORM, invoiceNumber: num, lines: [{ ...EMPTY_LINE }] });
    setCustVehicles([]);
    setEditingId(null);
    setShowForm(true);
    setSelected(null);
  }

  function openEditForm(inv: InvoiceFull) {
    setForm({
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerId: inv.customerId,
      vehicle: inv.vehicle,
      jobCardId: inv.jobCardId,
      status: inv.status,
      lines: inv.lines.length > 0
        ? inv.lines.map(l => ({ note: l.note || '', description: l.description || '', laoDescription: l.laoDescription || '', qty: String(l.qty), cost: l.cost != null ? String(l.cost) : '', markup: l.markup != null ? String(l.markup) : '', rate: String(l.rate), currency: l.currency || '' }))
        : [{ ...EMPTY_LINE }],
      discount: inv.discount,
      shopSupplies: inv.shopSupplies,
      taxRate: inv.taxRate,
      notes: inv.notes,
      dueDate: inv.dueDate || '',
      paidDate: inv.paidDate,
      currency: inv.currency || 'USD',
    });
    setEditingId(inv.id);
    setShowForm(true);
    // Load vehicles for the existing customer
    setCustVehicles([]);
    if (inv.customerId) {
      supabase.from('vehicles').select('id, label').eq('shop_id', getShopId()).eq('customer_id', inv.customerId).order('label').limit(500)
        .then(({ data }) => setCustVehicles(data ?? []));
    }
  }

  async function getRate(from: string, to: string): Promise<number> {
    if (!from || !to || from === to) return 1;
    if (ratesCache.current[from]?.[to] != null) return ratesCache.current[from][to];
    try {
      setRatesFetching(true);
      const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`);
      const data = await res.json();
      const rates: Record<string, number> = data[from.toLowerCase()] ?? {};
      ratesCache.current[from] = rates;
      return rates[to.toLowerCase()] ?? 1;
    } catch { return 1; }
    finally { setRatesFetching(false); }
  }

  async function setLine(i: number, field: keyof FormLine, value: string) {
    const line = form.lines[i];
    if (!line) return;
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, [field]: value }) }));
    if (field === 'cost' || field === 'markup' || field === 'currency') {
      const cost = parseFloat(field === 'cost' ? value : line.cost) || 0;
      const markup = parseFloat(field === 'markup' ? value : line.markup);
      const pct = isNaN(markup) ? 0 : markup;
      if (cost === 0) return;
      const billingCur = field === 'currency' ? (value || form.currency) : (line.currency || form.currency);
      const fx = await getRate(form.currency, billingCur);
      const rate = +(cost * fx * (1 + pct / 100)).toFixed(2);
      setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, [field]: value, rate: String(rate) }) }));
    }
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }));
  }

  function removeLine(i: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    if (!form.invoiceNumber) return setError('Invoice number is required.');
    setSaving(true);
    setError('');
    const parsedLines: InvoiceLine[] = form.lines.map(l => {
      const cost = parseFloat(l.cost);
      const markup = parseFloat(l.markup);
      return {
        note: l.note,
        description: l.description,
        ...(l.laoDescription ? { laoDescription: l.laoDescription } : {}),
        qty: parseFloat(l.qty) || 0,
        rate: parseFloat(l.rate) || 0,
        ...(isNaN(cost) ? {} : { cost }),
        ...(isNaN(markup) ? {} : { markup }),
        ...(l.currency ? { currency: l.currency } : {}),
      };
    });
    try {
      if (editingId) {
        // Update existing invoice
        await updateInvoice(editingId, {
          customerName: form.customerName,
          customerId: form.customerId,
          vehicle: form.vehicle,
          jobCardId: form.jobCardId,
          status: form.status,
          lines: parsedLines,
          discount: form.discount,
          shopSupplies: form.shopSupplies,
          taxRate: form.taxRate,
          notes: form.notes,
          dueDate: form.dueDate,
          currency: form.currency,
        });
        const updated: InvoiceFull = {
          ...selected!,
          ...form,
          lines: parsedLines,
          id: editingId,
          createdAt: selected?.createdAt ?? '',
        };
        setInvoices(prev => prev.map(i => i.id === editingId ? updated : i));
        setSelected(updated);
        setShowForm(false);
        setEditingId(null);
        notify(`Invoice ${form.invoiceNumber} updated.`);
      } else {
        // Create new invoice
        const saved = await createInvoice({ ...form, lines: parsedLines });
        setInvoices(prev => [saved, ...prev]);
        setSelected(saved);
        setShowForm(false);
        notify(`Invoice ${saved.invoiceNumber} created.`);
      }
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleMarkPaid(inv: InvoiceFull) {
    try {
      const paidDate = new Date().toISOString();
      const total = calculateTotals(inv).total;
      await markInvoicePaid(inv.id);
      // Auto-create payment record so Reports stays in sync
      await createPayment({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerId: inv.customerId,
        amount: total,
        method: 'Invoice (Mark Paid)',
        methodDetail: '',
        status: 'Recorded',
        notes: `Auto-recorded when ${inv.invoiceNumber} marked paid`,
        currency: inv.currency || 'USD',
        referenceNumber: '',
        paymentDate: paidDate,
      });
      const updated = { ...inv, status: 'Paid', paidDate };
      setInvoices(prev => prev.map(i => i.id === inv.id ? updated : i));
      setSelected(updated);
      notify(`${inv.invoiceNumber} marked paid. ${formatMoney(total, inv.currency || 'USD')} payment recorded.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleStatusChange(inv: InvoiceFull, status: string) {
    try {
      const paidDate = status === 'Paid' ? new Date().toISOString() : undefined;
      await updateInvoice(inv.id, { status, ...(paidDate ? { paidDate } : {}) });
      if (status === 'Paid' && inv.status !== 'Paid') {
        const total = calculateTotals(inv).total;
        await createPayment({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          customerId: inv.customerId,
          amount: total,
          method: 'Invoice (Status Change)',
          methodDetail: '',
          status: 'Recorded',
          notes: `Auto-recorded when ${inv.invoiceNumber} set to Paid`,
          currency: inv.currency || 'USD',
          referenceNumber: '',
          paymentDate: paidDate!,
        });
      }
      const updated = { ...inv, status, ...(paidDate ? { paidDate } : {}) };
      setInvoices(prev => prev.map(i => i.id === inv.id ? updated : i));
      if (selected?.id === inv.id) setSelected(updated);
      notify(status === 'Paid' ? `${inv.invoiceNumber} marked paid. Payment recorded.` : `Status updated to ${status}.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  async function handleDelete(inv: InvoiceFull) {
    if (!confirm(`Delete ${inv.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await deleteInvoice(inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      if (selected?.id === inv.id) setSelected(invoices.find(i => i.id !== inv.id) ?? null);
      notify(`${inv.invoiceNumber} deleted.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }


  const filtered = invoices.filter(inv => {
    const matchStatus = filterStatus === 'All' || inv.status === filterStatus;
    const matchSearch = !search || [inv.invoiceNumber, inv.customerName, inv.vehicle]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const invPage = usePagination(filtered, { pageSize: 25 });

  const totals = selected ? calculateTotals(selected) : null;

  // Summary stats
  const totalRevenue = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + calculateTotals(i).total, 0);
  const outstanding = invoices.filter(i => i.status === 'Sent').reduce((s, i) => s + calculateTotals(i).total, 0);
  const draftCount = invoices.filter(i => i.status === 'Draft').length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Invoices</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{invoices.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue (Paid)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#4caf50' }}>{formatMoney(totalRevenue, 'USD')}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outstanding</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2196f3' }}>{formatMoney(outstanding, 'USD')}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Drafts</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{draftCount}</div>
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: Invoice List ── */}
        <Panel title="Invoices" hint="Click an invoice to view details">
          {/* Most Recent banner */}
          {invoices.length > 0 && (
            <div
              onClick={() => { setSelected(invoices[0]); setShowForm(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', marginBottom: 12, cursor: 'pointer' }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Most Recent</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{invoices[0].invoiceNumber} — {invoices[0].customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{invoices[0].vehicle} · {fmt(invoices[0].createdAt)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{formatMoney(calculateTotals(invoices[0]).total, invoices[0].currency || 'USD')}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[invoices[0].status] || '#888' }}>{invoices[0].status}</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="search" style={{ flex: 1, minWidth: 120 }} />
            <button className="btn btn-primary" onClick={openNewForm}>+ New</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FilterPills statuses={['All', 'Draft', 'Sent', 'Paid', 'Void']} active={filterStatus} onChange={setFilterStatus} />
          </div>

          {/* New Invoice Form */}
          {showForm && (
            <form onSubmit={handleSave} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>{editingId ? `✏️ Edit ${form.invoiceNumber}` : 'New Invoice'}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Invoice #</label>
                  <input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} required readOnly={!!editingId} style={editingId ? { opacity: 0.6, background: 'var(--surface-soft)' } : {}} />
                </div>
                <div className="login-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {['Draft', 'Sent', 'Paid', 'Void'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Customer</label>
                  <select value={form.customerId} onChange={async e => {
                    const c = customers.find(c => c.id === e.target.value);
                    setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? '', vehicle: '' }));
                    setCustVehicles([]);
                    if (!e.target.value) return;
                    const shopId = getShopId();
                    const { data } = await supabase
                      .from('vehicles')
                      .select('id, label')
                      .eq('shop_id', shopId)
                      .eq('customer_id', e.target.value)
                      .order('label')
                      .limit(500);
                    setCustVehicles(data ?? []);
                  }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option value="">— select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Vehicle</label>
                  {custVehicles.length > 0 ? (
                    <select value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}
                      style={{ border: `1px solid ${!form.vehicle ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="">— select vehicle —</option>
                      {custVehicles.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                    </select>
                  ) : (
                    <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} placeholder="2022 Ford F-150" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                  )}
                </div>
                <div className="login-field">
                  <label>Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }} />
                </div>
                <div className="login-field">
                  <label>Job Card ID (optional)</label>
                  <input value={form.jobCardId} onChange={e => setForm(f => ({ ...f, jobCardId: e.target.value }))} placeholder="JC-001" />
                </div>
                <div className="login-field">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {CURRENCIES.filter(c => PORTAL_CURRENCIES.includes(c.code)).map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Line Items</label>
                  <button type="button" className="mini-btn primary" onClick={addLine}>+ Add Line</button>
                </div>
                {/* Column headers — separator column between Markup and Currency */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 2fr 0.5fr 0.9fr 0.75fr 10px 0.8fr 1fr auto', gap: 4, marginBottom: 4 }}>
                  {['Note / Ref #', 'Description (EN)', 'ລາຍລະອຽດ (ລາວ)', 'Qty', 'Cost', 'Markup %', '', 'Currency', ratesFetching ? 'Line Total ⟳' : 'Line Total', ''].map((h, idx) => (
                    <div key={idx} style={{ fontSize: 11, fontWeight: 700, color: idx === 8 && ratesFetching ? '#d97706' : 'var(--muted)', padding: '0 4px' }}>{h}</div>
                  ))}
                </div>
                {form.lines.map((line, i) => {
                  const rate = parseFloat(line.rate) || 0;
                  const qty = parseFloat(line.qty) || 0;
                  const lineCur = line.currency || form.currency;
                  const lineTotal = rate * qty;
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 2fr 0.5fr 0.9fr 0.75fr 10px 0.8fr 1fr auto', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                      <input value={line.note} onChange={e => setLine(i, 'note', e.target.value)} placeholder="Note / ref #" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Part / service description" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      <div style={{ display: 'flex', gap: 3 }}>
                        <input value={line.laoDescription} onChange={e => setLine(i, 'laoDescription', e.target.value)} placeholder="ລາຍລະອຽດ..." style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                        <button type="button" title="Auto-translate to Lao"
                          onClick={async () => {
                            if (!line.description) return;
                            const lao = await translateToLao(line.description);
                            setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, laoDescription: lao }) }));
                          }}
                          style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>🌐</button>
                      </div>
                      <input type="text" inputMode="numeric" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="1" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      <input type="text" inputMode="decimal" value={line.cost} onChange={e => setLine(i, 'cost', e.target.value)} placeholder="Cost" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      <input type="text" inputMode="decimal" value={line.markup} onChange={e => setLine(i, 'markup', e.target.value)} placeholder="0" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      {/* Visible divider between Markup and Currency */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div style={{ width: 1, height: 28, background: 'var(--line)' }} />
                      </div>
                      <select value={line.currency} onChange={e => setLine(i, 'currency', e.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 4px', fontSize: 11, background: 'var(--surface)', color: 'var(--text)' }}>
                        <option value="">— same —</option>
                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                      <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface-soft)', color: lineTotal < 0 ? '#22c55e' : lineCur !== form.currency ? '#d97706' : 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        {lineTotal !== 0 ? formatMoney(lineTotal, lineCur) : '—'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button type="button" title="Move up" disabled={i === 0}
                          onClick={() => setForm(f => { const ls = [...f.lines]; [ls[i-1], ls[i]] = [ls[i], ls[i-1]]; return { ...f, lines: ls }; })}
                          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 4, color: i === 0 ? 'var(--line)' : 'var(--muted)', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, padding: '1px 5px', lineHeight: 1 }}>▲</button>
                        <button type="button" title="Move down" disabled={i === form.lines.length - 1}
                          onClick={() => setForm(f => { const ls = [...f.lines]; [ls[i], ls[i+1]] = [ls[i+1], ls[i]]; return { ...f, lines: ls }; })}
                          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 4, color: i === form.lines.length - 1 ? 'var(--line)' : 'var(--muted)', cursor: i === form.lines.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: '1px 5px', lineHeight: 1 }}>▼</button>
                        <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Line items subtotal */}
              {(() => {
                const totalsMap: Record<string, number> = {};
                form.lines.forEach(l => {
                  const cur = l.currency || form.currency;
                  const val = (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0);
                  totalsMap[cur] = (totalsMap[cur] || 0) + val;
                });
                const entries = Object.entries(totalsMap).filter(([, v]) => v !== 0);
                if (entries.length === 0) return null;
                return (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, padding: '10px 4px', borderTop: '2px solid var(--line)', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items Total</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      {entries.map(([cur, total]) => (
                        <span key={cur} style={{ fontSize: 15, fontWeight: 700, color: total < 0 ? '#22c55e' : cur !== form.currency ? '#d97706' : 'var(--text)' }}>
                          {formatMoney(total, cur)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Adjustments */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Discount ($)</label>
                  <input type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} min="0" step="0.01" />
                </div>
                <div className="login-field">
                  <label>Shop Supplies ($)</label>
                  <input type="number" value={form.shopSupplies} onChange={e => setForm(f => ({ ...f, shopSupplies: Number(e.target.value) }))} min="0" step="0.01" />
                </div>
              </div>

              <div className="login-field" style={{ marginBottom: 12 }}>
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Payment terms, warranty info…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Invoice'}
                </button>
              </div>
            </form>
          )}

          {loading && <p style={{ color: 'var(--muted)' }}>Loading invoices…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {invoices.length === 0 ? 'No invoices yet. Create your first one.' : 'No invoices match your filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invPage.pageItems.map((inv, idx) => {
              const t = calculateTotals(inv);
              const isSelected = selected?.id === inv.id;
              const isLatest = inv.id === invoices[0]?.id;
              return (
                <div
                  key={inv.id}
                  onClick={() => { setSelected(inv); setShowForm(false); }}
                  style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                    background: isSelected ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{inv.invoiceNumber}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: STATUS_COLORS[inv.status] || '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{inv.status}</span>
                      {isLatest && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'rgba(204,0,0,0.1)', padding: '1px 6px', borderRadius: 10 }}>LATEST</span>}
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{inv.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.vehicle}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(t.total, inv.currency || 'USD')}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(inv.createdAt)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            page={invPage.page} totalPages={invPage.totalPages} totalItems={invPage.totalItems}
            startIndex={invPage.startIndex} endIndex={invPage.endIndex}
            hasPrev={invPage.hasPrev} hasNext={invPage.hasNext}
            onPrev={invPage.prevPage} onNext={invPage.nextPage}
            onFirst={invPage.goToFirst} onLast={invPage.goToLast} onPage={invPage.setPage}
          />
        </Panel>

        {/* ── Right: Invoice Detail ── */}
        {selected && !showForm && totals && (
          <div>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <select
                value={selected.status}
                onChange={e => handleStatusChange(selected, e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontWeight: 600 }}
              >
                {['Draft', 'Sent', 'Paid', 'Void'].map(s => <option key={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary" onClick={() => openEditForm(selected)}>✏️ Edit</button>
              <button className="btn" onClick={() => setShowPreview(true)}>👁 Preview</button>
              {selected.status !== 'Paid' && (
                <button className="btn" style={{ background: 'rgba(76,175,80,0.12)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleMarkPaid(selected)}>✓ Mark Paid</button>
              )}
              {selected.status !== 'Paid' && (
                <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', fontWeight: 600 }}
                  onClick={() => {
                    dispatch({ type: 'SET_PREFILL', prefill: { customerName: selected.customerName, customerId: selected.customerId } });
                    dispatch({ type: 'SET_MODULE', module: 'payments' });
                  }}>💳 Record Payment →</button>
              )}
              <button className="btn" onClick={() => setShowPreview(true)}>🖨 Print / Preview</button>
              <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
            </div>

            {/* Print-ready invoice */}
            <div ref={printRef} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 28 }} className="invoice-print">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {shopSettings?.logoUrl && (
                    <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 52, maxWidth: 120, objectFit: 'contain', borderRadius: 6 }} />
                  )}
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.5px' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                    {shopSettings?.tagline && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{shopSettings.tagline}</div>}
                    {shopSettings?.address && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                    {shopSettings?.phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📞 {shopSettings.phone}</div>}
                    {shopSettings?.email && <div style={{ fontSize: 12, color: 'var(--muted)' }}>✉️ {shopSettings.email}</div>}
                    {shopSettings?.website && <div style={{ fontSize: 12, color: 'var(--muted)' }}>🌐 {shopSettings.website}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selected.invoiceNumber}</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: STATUS_COLORS[selected.status] + '22', color: STATUS_COLORS[selected.status] }}>
                      {selected.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    Date: {fmt(selected.createdAt)}<br />
                    {selected.dueDate && <>Due: {fmt(selected.dueDate)}<br /></>}
                    {selected.paidDate && <span style={{ color: '#4caf50' }}>Paid: {fmt(selected.paidDate)}</span>}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Bill To
                  </div>
                  <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                  {selected.vehicle && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.vehicle}</div>}
                </div>
                {selected.jobCardId && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Reference
                    </div>
                    <div style={{ fontSize: 13 }}>Job Card: <strong>{selected.jobCardId}</strong></div>
                  </div>
                )}
              </div>

              {/* Line items table */}
              <table style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: 110 }}>Note / Ref</th>
                    <th style={{ textAlign: 'left' }}>Description</th>
                    <th style={{ textAlign: 'right', width: 70 }}>Qty</th>
                    <th style={{ textAlign: 'right', width: 100 }}>Rate</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>No line items</td></tr>
                  )}
                  {selected.lines.map((line, i) => {
                    const lc = line.currency || selected.currency;
                    return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fffde7' : 'transparent' }}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{line.note || '—'}</td>
                      <td>
                        <div>{line.description}</div>
                        {line.laoDescription && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{line.laoDescription}</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>{line.qty}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(line.rate, lc)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: lc !== selected.currency ? '#d97706' : undefined }}>{formatMoney(line.qty * line.rate, lc)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <div style={{ width: 280 }}>
                  {[
                    ['Subtotal', formatMoney(totals.subtotal, selected.currency)],
                    totals.discount > 0 ? ['Discount', `-${formatMoney(totals.discount, selected.currency)}`] : null,
                    totals.shopSupplies > 0 ? ['Shop Supplies', formatMoney(totals.shopSupplies, selected.currency)] : null,
                  ].filter((r): r is [string, string] => r !== null).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>{label}</span>
                      <span>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 17 }}>
                    <span>Total ({selected.currency})</span>
                    <span style={{ color: 'var(--accent)' }}>{formatMoney(totals.total, selected.currency)}</span>
                  </div>
                  {invoicePayments.length > 0 && (() => {
                    const received = invoicePayments.reduce((s, p) => s + p.amount, 0);
                    const balance = totals.total - received;
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--line)' }}>
                          <span style={{ color: '#4caf50', fontWeight: 600 }}>Amount Received</span>
                          <span style={{ color: '#4caf50', fontWeight: 600 }}>-{formatMoney(received, selected.currency)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', fontWeight: 700, fontSize: 15 }}>
                          <span style={{ color: balance <= 0 ? '#4caf50' : 'var(--accent)' }}>Balance Due</span>
                          <span style={{ color: balance <= 0 ? '#4caf50' : 'var(--accent)' }}>{balance <= 0 ? 'PAID IN FULL' : formatMoney(balance, selected.currency)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Notes
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!selected && !showForm && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)', fontSize: 14 }}>
            Select an invoice to view details
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && selected && totals && (
        <div className="print-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div className="print-content" style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 720, padding: 48, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            {/* Close / Print — hidden on print */}
            <div className="no-print">
              <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 16, right: 16, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, color: '#333' }}>✕ Close</button>
              <button onClick={() => window.print()} style={{ position: 'absolute', top: 16, right: 100, background: '#cc0000', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>🖨 Print</button>
            </div>

            {/* Shop Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {shopSettings?.logoUrl && (
                  <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 60, maxWidth: 140, objectFit: 'contain', borderRadius: 6 }} />
                )}
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#cc0000', letterSpacing: '-0.5px' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                  {shopSettings?.tagline && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{shopSettings.tagline}</div>}
                  {shopSettings?.address && <div style={{ fontSize: 12, color: '#555', marginTop: 6, whiteSpace: 'pre-line', lineHeight: 1.5 }}>{shopSettings.address}</div>}
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {shopSettings?.phone && <span>📞 {shopSettings.phone}</span>}
                    {shopSettings?.email && <span>✉️ {shopSettings.email}</span>}
                    {shopSettings?.website && <span>🌐 {shopSettings.website}</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  Invoice
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#111', marginTop: 4 }}>{selected.invoiceNumber}</div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>
                    {selected.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.7 }}>
                  Date: {fmt(selected.createdAt)}<br />
                  {selected.dueDate && <>Due: {fmt(selected.dueDate)}<br /></>}
                  {selected.paidDate && <span style={{ color: '#4caf50', fontWeight: 600 }}>Paid: {fmt(selected.paidDate)}</span>}
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
              <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  Bill To
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.customerName}</div>
                {selected.vehicle && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{selected.vehicle}</div>}
              </div>
              {selected.jobCardId && (
                <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    Reference
                  </div>
                  <div style={{ fontSize: 13 }}>Job Card: <strong>{selected.jobCardId}</strong></div>
                </div>
              )}
            </div>

            {/* Line Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0, color: '#111' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700, width: 100 }}>
                    Note / Ref
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700 }}>
                    Description
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700, width: 60 }}>
                    Qty
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700, width: 90 }}>
                    Rate
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700, width: 100 }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>No line items</td></tr>
                )}
                {selected.lines.map((line, i) => {
                  const lc = line.currency || selected.currency;
                  return (
                  <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fffde7' : '#fff' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>{line.note || ''}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 14 }}>{line.description}</div>
                      {line.laoDescription && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{line.laoDescription}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{line.qty}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{formatMoney(line.rate, lc)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 14, color: lc !== selected.currency ? '#d97706' : undefined }}>{formatMoney(line.qty * line.rate, lc)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div style={{ width: 280 }}>
                {[
                  ['Subtotal', formatMoney(totals.subtotal, selected.currency)],
                  totals.discount > 0 ? ['Discount', `-${formatMoney(totals.discount, selected.currency)}`] : null,
                  totals.shopSupplies > 0 ? ['Shop Supplies', formatMoney(totals.shopSupplies, selected.currency)] : null,
                ].filter((r): r is [string, string] => r !== null).map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                    <span>{label}</span>
                    <span>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontWeight: 800, fontSize: 20, color: '#111', borderTop: '2px solid #cc0000', marginTop: 4 }}>
                  <span>Total ({selected.currency})</span>
                  <span style={{ color: '#cc0000' }}>{formatMoney(totals.total, selected.currency)}</span>
                </div>
                {invoicePayments.length > 0 && (() => {
                  const received = invoicePayments.reduce((s, p) => s + p.amount, 0);
                  const balance = totals.total - received;
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#444', borderBottom: '1px solid #eee' }}>
                        <span style={{ color: '#4caf50', fontWeight: 600 }}>Amount Received</span>
                        <span style={{ color: '#4caf50', fontWeight: 600 }}>-{formatMoney(received, selected.currency)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 16 }}>
                        <span style={{ color: balance <= 0 ? '#4caf50' : '#cc0000' }}>Balance Due</span>
                        <span style={{ color: balance <= 0 ? '#4caf50' : '#cc0000' }}>{balance <= 0 ? 'PAID IN FULL' : formatMoney(balance, selected.currency)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Notes */}
            {selected.notes && (
              <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #eee' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Notes
                </div>
                <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.6 }}>{selected.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #eee', textAlign: 'center', fontSize: 11, color: '#aaa' }}>
              <div>Thank you for your business — {shopSettings?.companyName || 'Redlined1'}</div>
              {(shopSettings?.phone || shopSettings?.email) && (
                <div style={{ marginTop: 4 }}>
                  {shopSettings?.phone && shopSettings.phone}
                  {shopSettings?.phone && shopSettings?.email && ' · '}
                  {shopSettings?.email && shopSettings.email}
                </div>
              )}
            </div>

            {/* Free plan watermark */}
            {needsWatermark(planStatus) && (
              <div style={{ marginTop: 18, padding: '10px 16px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, textAlign: 'center', fontSize: 12, color: '#856404', fontWeight: 600 }}>
                Generated with <span style={{ color: '#cc0000' }}>Redlined1</span> · Free Plan — <a href="/signup" style={{ color: '#cc0000' }}>Upgrade to remove this</a>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
