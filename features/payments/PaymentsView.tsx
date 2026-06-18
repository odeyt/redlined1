'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchPayments, createPayment, updatePayment, deletePayment,
  PAYMENT_METHODS, type Payment,
} from '@/services/paymentService';
import { fetchInvoices, formatMoney, CURRENCIES } from '@/services/invoiceService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { fetchShopSettings, DEFAULT_PAYMENT_METHODS } from '@/services/shopSettingsService';

const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';
const fmtTime = (d: string) => d ? new Date(d).toLocaleString() : '—';
// Returns "YYYY-MM-DDTHH:mm" in local time for datetime-local inputs
function localDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const STATUS_COLORS: Record<string, string> = {
  Recorded: '#2196f3', Verified: '#4caf50', Refunded: '#f44336', Void: '#888',
};

const EMPTY_FORM = {
  invoiceNumber: '',
  customerName: '',
  customerId: '',
  amount: 0,
  method: 'Cash',
  methodDetail: '',
  status: 'Recorded',
  notes: '',
  currency: 'USD',
  referenceNumber: '',
  paymentDate: '',
};

// Build grouped method list filtered to shop-enabled methods (populated after settings load)
function buildGroups(enabled: string[]) {
  const methods = enabled.length > 0
    ? PAYMENT_METHODS.filter(m => enabled.includes(m.value))
    : PAYMENT_METHODS;
  return Array.from(new Set(methods.map(m => m.group))).map(g => ({
    group: g,
    methods: methods.filter(m => m.group === g),
  }));
}

function StatCard({ label, value, valueColor, items, countOnly }: {
  label: string;
  value: string;
  valueColor: string;
  items: Payment[];
  currency: string;
  countOnly?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const fmtAmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDT  = (d: string) => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div
      className="card"
      style={{ padding: 16, position: 'relative', cursor: items.length > 0 ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: countOnly ? 28 : 22, fontWeight: 700, color: valueColor }}>{value}</div>
      {items.length > 0 && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>hover for details</div>}
      {hover && items.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: 'var(--card)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          minWidth: 320, maxWidth: 420, padding: '10px 0', marginTop: 4,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 14px 8px', borderBottom: '1px solid var(--line)' }}>
            {label} — {items.length} record{items.length !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {items.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 14px', borderBottom: '1px solid var(--line)', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.customerName || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {fmtDT(p.paymentDate)}
                    {p.invoiceNumber && <span style={{ marginLeft: 6, color: 'var(--accent)', fontWeight: 600 }}>{p.invoiceNumber}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.method}{p.referenceNumber ? ` · ${p.referenceNumber}` : ''}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: valueColor, whiteSpace: 'nowrap' }}>{fmtAmt(p.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PaymentsView() {
  const { prefill } = useAppState();
  const dispatch = useAppDispatch();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [amountStr, setAmountStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<{ number: string; customerName: string; total: number; currency: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [enabledMethods, setEnabledMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [filterMethod, setFilterMethod] = useState('All');

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchShopSettings().then(s => setEnabledMethods(s.enabledPaymentMethods ?? DEFAULT_PAYMENT_METHODS)).catch(() => {});

    function onSettingsUpdated(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail?.enabledPaymentMethods)) {
        setEnabledMethods(detail.enabledPaymentMethods);
      }
    }
    window.addEventListener('shop-settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('shop-settings-updated', onSettingsUpdated);
    fetchInvoices().then(invs => setInvoices(invs.map(i => ({
      number: i.invoiceNumber,
      customerName: i.customerName,
      total: i.lines.reduce((s, l) => s + l.qty * l.rate, 0),
      currency: i.currency,
    })))).catch(() => {});
  }, []);

  // Open new form pre-filled when navigated from Invoice → Payment
  useEffect(() => {
    if (!prefill?.customerName) return;
    setForm(f => ({ ...f, customerName: prefill.customerName ?? '', customerId: prefill.customerId ?? '' }));
    setEditingId(null);
    setShowForm(true);
    dispatch({ type: 'CLEAR_PREFILL' });
  }, [prefill]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPayments();
      setPayments(data);
    } catch (e: unknown) {
      setError('Load error: ' + (e instanceof Error ? e.message : ''));
    } finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  function openNew() {
    setForm({ ...EMPTY_FORM, paymentDate: localDateTimeValue() });
    setAmountStr('');
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(p: Payment) {
    setForm({
      invoiceNumber: p.invoiceNumber,
      customerName: p.customerName,
      customerId: p.customerId,
      amount: p.amount,
      method: p.method,
      methodDetail: p.methodDetail,
      status: p.status,
      notes: p.notes,
      currency: p.currency,
      referenceNumber: p.referenceNumber,
      paymentDate: p.paymentDate ? localDateTimeValue(new Date(p.paymentDate)) : localDateTimeValue(),
    });
    setAmountStr(p.amount > 0 ? String(p.amount) : '');
    setEditingId(p.id);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    if (form.amount <= 0) return setError('Amount must be greater than 0.');
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updatePayment(editingId, { ...form, paymentDate: new Date(form.paymentDate).toISOString() });
        setPayments(prev => prev.map(p => p.id === editingId ? { ...p, ...form, id: editingId, createdAt: p.createdAt } : p));
        notify('Payment updated.');
      } else {
        const saved = await createPayment({ ...form, paymentDate: new Date(form.paymentDate).toISOString() });
        setPayments(prev => [saved, ...prev]);
        notify(`Payment of ${formatMoney(saved.amount, saved.currency)} recorded.`);
      }
      setShowForm(false); setEditingId(null);
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleDelete(p: Payment) {
    if (!confirm(`Delete this payment of ${formatMoney(p.amount, p.currency)}?`)) return;
    try {
      await deletePayment(p.id);
      setPayments(prev => prev.filter(x => x.id !== p.id));
      notify('Payment deleted.');
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  // When invoice is selected, auto-fill customer and amount
  function handleInvoiceSelect(invNumber: string) {
    const inv = invoices.find(i => i.number === invNumber);
    const newAmount = inv?.total ?? form.amount;
    setForm(f => ({
      ...f,
      invoiceNumber: invNumber,
      customerName: inv?.customerName ?? f.customerName,
      amount: newAmount,
      currency: inv?.currency ?? f.currency,
    }));
    setAmountStr(newAmount > 0 ? String(newAmount) : '');
  }

  const filtered = payments.filter(p => {
    const matchMethod = filterMethod === 'All' || p.method === filterMethod;
    const matchSearch = !search || [p.customerName, p.invoiceNumber, p.referenceNumber, p.method]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchMethod && matchSearch;
  });

  const collectedList = payments.filter(p => p.status !== 'Void' && p.status !== 'Refunded');
  const refundedList  = payments.filter(p => p.status === 'Refunded');
  const voidedList    = payments.filter(p => p.status === 'Void');
  const todayList     = payments.filter(p => new Date(p.paymentDate).toDateString() === new Date().toDateString());
  const totalCollected = collectedList.reduce((s, p) => s + p.amount, 0);
  const totalRefunded  = refundedList.reduce((s, p) => s + p.amount, 0);
  const totalVoided    = voidedList.reduce((s, p) => s + p.amount, 0);
  const todayCount     = todayList.length;

  // Breakdown by method — driven from actual payment data so no method is silently dropped
  const methodTotals = payments
    .filter(p => p.status !== 'Void' && p.status !== 'Refunded')
    .reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {/* Total Collected */}
        <StatCard
          label="Total Collected"
          value={`$${totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valueColor="#4caf50"
          items={collectedList}
          currency="USD"
        />
        {/* Total Payments */}
        <StatCard
          label="Total Payments"
          value={String(payments.length)}
          valueColor="var(--text)"
          items={payments}
          currency="USD"
          countOnly
        />
        {/* Today */}
        <StatCard
          label="Today"
          value={String(todayCount)}
          valueColor="#2196f3"
          items={todayList}
          currency="USD"
          countOnly
        />
        {/* Refunded */}
        <StatCard
          label="Refunded"
          value={`$${totalRefunded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valueColor="#f44336"
          items={refundedList}
          currency="USD"
        />
        {/* Voided */}
        <StatCard
          label="Voided"
          value={`$${totalVoided.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valueColor="#ff9800"
          items={voidedList}
          currency="USD"
        />
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: Record Payment + Method Breakdown ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title={editingId ? 'Edit Payment' : 'Record Payment'} hint="Log a payment against an invoice or customer">
            {!showForm ? (
              <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15 }} onClick={openNew}>
                + Record New Payment
              </button>
            ) : (
              <form onSubmit={handleSave}>
                {/* Invoice picker */}
                <div className="login-field" style={{ marginBottom: 10 }}>
                  <label>Link to Invoice (optional)</label>
                  <select value={form.invoiceNumber} onChange={e => handleInvoiceSelect(e.target.value)}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                    <option value="">— no invoice —</option>
                    {invoices.map(i => <option key={i.number} value={i.number}>{i.number} · {i.customerName}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Customer</label>
                    <select value={form.customerId} onChange={e => {
                      const c = customers.find(c => c.id === e.target.value);
                      setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName }));
                    }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                      <option value="">— select —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Customer Name</label>
                    <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                  </div>
                  <div className="login-field">
                    <label>Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amountStr}
                      placeholder="0.00"
                      onChange={e => {
                        // Allow digits and at most one decimal point only
                        let raw = e.target.value.replace(/[^\d.]/g, '');
                        const dotIdx = raw.indexOf('.');
                        if (dotIdx !== -1) raw = raw.slice(0, dotIdx + 1) + raw.slice(dotIdx + 1).replace(/\./g, '');
                        // Strip leading zeros before a digit (e.g. "05" → "5", but keep "0.5")
                        raw = raw.replace(/^0+(\d)/, '$1');
                        setAmountStr(raw);
                        setForm(f => ({ ...f, amount: parseFloat(raw) || 0 }));
                      }}
                      required
                    />
                  </div>
                </div>

                {/* Payment Method */}
                <div className="login-field" style={{ marginBottom: 10 }}>
                  <label>Payment Method</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                    {buildGroups(enabledMethods).map(({ group, methods }) => (
                      <optgroup key={group} label={group}>
                        {methods.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Card / Crypto detail */}
                {(form.method.includes('Card') || form.method === 'Credit Card' || form.method === 'Debit Card' || form.method.includes('Crypto') || form.method === 'Bitcoin' || form.method === 'Ethereum' || form.method === 'USDC') && (
                  <div className="login-field" style={{ marginBottom: 10 }}>
                    <label>{form.method.includes('Crypto') || form.method === 'Bitcoin' || form.method === 'Ethereum' || form.method === 'USDC' ? 'Wallet / TX Hash' : 'Last 4 digits'}</label>
                    <input value={form.methodDetail} onChange={e => setForm(f => ({ ...f, methodDetail: e.target.value }))}
                      placeholder={form.method.includes('Crypto') || form.method === 'Bitcoin' || form.method === 'Ethereum' ? 'Transaction hash or wallet address' : '•••• 1234'} />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="login-field">
                    <label>Currency</label>
                    <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      {['Recorded', 'Verified', 'Refunded', 'Void'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Reference # (optional)</label>
                    <input value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="Check #, TX ID…" />
                  </div>
                  <div className="login-field">
                    <label>Payment Date & Time</label>
                    <input type="datetime-local" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }} />
                  </div>
                </div>

                <div className="login-field" style={{ marginBottom: 12 }}>
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    placeholder="Any additional details…"
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Record Payment'}</button>
                </div>
              </form>
            )}
          </Panel>

          {/* Method Breakdown */}
          {Object.keys(methodTotals).length > 0 && (
            <Panel title="Collected by Method" hint="Breakdown of all recorded payments">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(methodTotals).sort((a, b) => b[1] - a[1]).map(([method, total]) => {
                  const methodInfo = PAYMENT_METHODS.find(m => m.value === method);
                  const pct = totalCollected > 0 ? (total / totalCollected) * 100 : 0;
                  return (
                    <div key={method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span>{methodInfo?.label || method}</span>
                        <span style={{ fontWeight: 600 }}>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        {/* ── Right: Payment Register ── */}
        <Panel title="Payment Register" hint="All recorded payments — click Edit to modify">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, invoice, ref…" className="search" style={{ flex: 1, minWidth: 150 }} />
            <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
              <option value="All">All Methods</option>
              {buildGroups(enabledMethods).map(({ group, methods }) => (
                <optgroup key={group} label={group}>
                  {methods.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {loading && <p style={{ color: 'var(--muted)' }}>Loading payments…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {payments.length === 0 ? 'No payments recorded yet.' : 'No payments match your search.'}
            </p>
          )}

          {filtered.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const methodInfo = PAYMENT_METHODS.find(m => m.value === p.method);
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.customerName}</strong>
                        {p.referenceNumber && <div className="meta">Ref: {p.referenceNumber}</div>}
                        {p.methodDetail && <div className="meta">{p.methodDetail}</div>}
                      </td>
                      <td>{p.invoiceNumber ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{p.invoiceNumber}</span> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}</td>
                      <td style={{ fontSize: 13 }}>{methodInfo?.label || p.method}</td>
                      <td style={{ fontWeight: 700, color: p.status === 'Refunded' ? '#f44336' : '#4caf50' }}>
                        {formatMoney(p.amount, p.currency)}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (STATUS_COLORS[p.status] || '#888') + '22', color: STATUS_COLORS[p.status] || '#888' }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(p.paymentDate)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="mini-btn" onClick={() => openEdit(p)}>Edit</button>
                          <button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Daily total footer */}
          {filtered.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>Showing {filtered.length} payment{filtered.length !== 1 ? 's' : ''}</span>
              {(() => {
                const gross = filtered.reduce((s, p) => s + p.amount, 0);
                const excluded = filtered.filter(p => p.status === 'Void' || p.status === 'Refunded').reduce((s, p) => s + p.amount, 0);
                const net = gross - excluded;
                return (
                  <>
                    <span style={{ color: 'var(--muted)' }}>
                      Gross: ${gross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {excluded > 0 && (
                      <span style={{ color: 'var(--danger, #e53e3e)' }}>
                        Void/Refunded: −${excluded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    <span style={{ fontWeight: 700 }}>
                      Net Collected: ${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </>
                );
              })()}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
