'use client';

import { useEffect, useRef, useState } from 'react';
import { usePagination } from '@/lib/usePagination';
import { Pagination } from '@/components/Pagination';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchInvoices, createInvoice, updateInvoice, markInvoicePaid,
  deleteInvoice, nextInvoiceNumber, calculateTotals, getEffectiveTotal, formatMoney, CURRENCIES,
  type InvoiceFull, type InvoiceLine,
} from '@/services/invoiceService';
import { createPayment, fetchPayments, type Payment } from '@/services/paymentService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { fetchCustomers } from '@/services/customerService';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { fetchPartsEstimates, deletePartsEstimate } from '@/services/partsEstimateService';
import { fetchPartsOrders, deletePartsOrder } from '@/services/partsOrderService';
import { fetchRepairOrders, deleteRepairOrder } from '@/services/repairOrderService';
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
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<Payment[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const ratesCache = useRef<Record<string, Record<string, number>>>({});
  const [ratesFetching, setRatesFetching] = useState(false);
  const [fullCustomers, setFullCustomers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [emailModal, setEmailModal] = useState<{ invoice: InvoiceFull; email: string; sending: boolean } | null>(null);
  const [payModal, setPayModal] = useState<{
    inv: InvoiceFull;
    total: number;
    currency: string;
    mode: 'Cash' | 'QR Code' | 'Split';
    cashAmt: string;
    qrAmt: string;
    ref: string;
    saving: boolean;
  } | null>(null);

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
    fetchCustomers().then(list => setFullCustomers(list.map(c => ({ id: c.id, name: c.name, email: c.email })))).catch(() => {});
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

  function printInvoice(inv: InvoiceFull, t: ReturnType<typeof calculateTotals>, payments: Payment[]) {
    const fmt2 = (d: string) => d ? new Date(d).toLocaleDateString() : '—';
    const lines = inv.lines.map((line, i) => {
      const lc = line.currency || inv.currency;
      return `<tr style="background:${i % 2 === 0 ? '#fffde7' : '#fff'};border-bottom:1px solid #eee">
        <td style="padding:8px 10px;font-size:12px;color:#888">${line.note || ''}</td>
        <td style="padding:8px 10px">
          <div style="font-size:13px">${line.description}</div>
          ${line.laoDescription ? `<div style="font-size:11px;color:#888">${line.laoDescription}</div>` : ''}
        </td>
        <td style="padding:8px 10px;text-align:right;font-size:13px">${line.qty}</td>
        <td style="padding:8px 10px;text-align:right;font-size:13px">${formatMoney(line.rate, lc)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;font-size:13px;color:${lc !== inv.currency ? '#d97706' : '#111'}">${formatMoney(line.qty * line.rate, lc)}</td>
      </tr>`;
    }).join('');
    const foreignCursPrint = Object.keys(t.byCurrency).filter(c => c !== inv.currency);
    const allForeignPrint = t.subtotal === 0 && foreignCursPrint.length === 1;
    const effectiveCurPrint = allForeignPrint ? foreignCursPrint[0] : inv.currency;
    const effectiveTotalPrint = allForeignPrint
      ? (t.byCurrency[foreignCursPrint[0]] - t.discount)
      : t.total;
    const payByCurPrint: Record<string, number> = {};
    for (const p of payments) { payByCurPrint[p.currency] = (payByCurPrint[p.currency] ?? 0) + p.amount; }
    const receivedInEffectivePrint = payByCurPrint[effectiveCurPrint] ?? 0;
    const balance = effectiveTotalPrint - receivedInEffectivePrint;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${inv.invoiceNumber}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:system-ui,sans-serif;color:#111;background:#fff;padding:28px 36px}
        table{width:100%;border-collapse:collapse}
        th{background:#f0f0f0;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#555;font-weight:700;text-align:left}
        th:last-child,th:nth-child(3),th:nth-child(4){text-align:right}
        @media print{body{padding:14px 18px}@page{size:A4 portrait;margin:8mm 12mm}}
      </style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #cc0000">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${shopSettings?.logoUrl ? `<img src="${shopSettings.logoUrl}" style="height:48px;max-width:110px;object-fit:contain;border-radius:4px">` : ''}
          <div>
            <div style="font-size:22px;font-weight:900;color:#cc0000">${shopSettings?.companyName || 'Redlined1'}</div>
            ${shopSettings?.tagline ? `<div style="font-size:11px;color:#666;margin-top:2px">${shopSettings.tagline}</div>` : ''}
            ${shopSettings?.address ? `<div style="font-size:11px;color:#555;margin-top:4px;white-space:pre-line">${shopSettings.address}</div>` : ''}
            ${shopSettings?.phone ? `<div style="font-size:11px;color:#555">📞 ${shopSettings.phone}</div>` : ''}
            ${shopSettings?.email ? `<div style="font-size:11px;color:#555">✉️ ${shopSettings.email}</div>` : ''}
            ${shopSettings?.website ? `<div style="font-size:11px;color:#555">🌐 ${shopSettings.website}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;font-weight:700">Invoice</div>
          <div style="font-size:26px;font-weight:800;color:#111;margin-top:2px">${inv.invoiceNumber}</div>
          <div style="margin-top:6px"><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${(STATUS_COLORS[inv.status]||'#888')}22;color:${STATUS_COLORS[inv.status]||'#888'}">${inv.status.toUpperCase()}</span></div>
          <div style="font-size:11px;color:#666;margin-top:6px;line-height:1.7">
            Date: ${fmt2(inv.createdAt)}<br>
            ${inv.dueDate ? `Due: ${fmt2(inv.dueDate)}<br>` : ''}
            ${inv.paidDate ? `<span style="color:#4caf50;font-weight:600">Paid: ${fmt2(inv.paidDate)}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div style="background:#f8f8f8;border-radius:8px;padding:12px 16px">
          <div style="font-size:10px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Bill To</div>
          <div style="font-weight:700;font-size:14px">${inv.customerName}</div>
          ${inv.vehicle ? `<div style="font-size:12px;color:#666;margin-top:3px">${inv.vehicle}</div>` : ''}
        </div>
        ${inv.jobCardId ? `<div style="background:#f8f8f8;border-radius:8px;padding:12px 16px">
          <div style="font-size:10px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Reference</div>
          <div style="font-size:13px">Job Card: <strong>${inv.jobCardId}</strong></div>
        </div>` : ''}
      </div>
      <table>
        <thead><tr><th>Note / Ref</th><th>Description</th><th style="text-align:right;width:60px">Qty</th><th style="text-align:right;width:90px">Rate</th><th style="text-align:right;width:100px">Amount</th></tr></thead>
        <tbody>${inv.lines.length === 0 ? '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;font-style:italic">No line items</td></tr>' : lines}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <div style="width:260px">
          ${Object.entries(t.byCurrency).filter(([cur]) => cur !== inv.currency).map(([cur, amt]) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;color:#d97706"><span>Subtotal (${cur})</span><span style="font-weight:600">${formatMoney(amt, cur)}</span></div>`
          ).join('')}
          ${t.subtotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;color:#444"><span>Subtotal (${inv.currency})</span><span>${formatMoney(t.subtotal, inv.currency)}</span></div>` : ''}
          ${t.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;color:#444"><span>Discount</span><span>-${formatMoney(t.discount, inv.currency)}</span></div>` : ''}
          ${t.shopSupplies > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;color:#444"><span>Shop Supplies</span><span>${formatMoney(t.shopSupplies, inv.currency)}</span></div>` : ''}
          ${(() => {
            const foreignCurs = Object.keys(t.byCurrency).filter(c => c !== inv.currency);
            const allForeign = t.subtotal === 0 && foreignCurs.length === 1;
            const displayCur = allForeign ? foreignCurs[0] : inv.currency;
            const displayAmt = allForeign ? (t.byCurrency[foreignCurs[0]] - t.discount) : t.total;
            return `<div style="display:flex;justify-content:space-between;padding:10px 0 4px;font-weight:800;font-size:18px;border-top:2px solid #cc0000;margin-top:4px"><span>Total (${displayCur})</span><span style="color:#cc0000">${formatMoney(displayAmt, displayCur)}</span></div>`;
          })()}
          ${Object.keys(payByCurPrint).length > 0 ? `
          ${Object.entries(payByCurPrint).map(([cur, amt]) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #eee"><span style="color:#4caf50;font-weight:600">Amount Received${cur !== effectiveCurPrint ? ` (${cur})` : ''}</span><span style="color:#4caf50;font-weight:600">-${formatMoney(amt, cur)}</span></div>`
          ).join('')}
          <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-weight:700;font-size:15px"><span style="color:${balance<=0?'#4caf50':'#cc0000'}">Balance Due</span><span style="color:${balance<=0?'#4caf50':'#cc0000'}">${balance<=0?'PAID IN FULL':formatMoney(balance,effectiveCurPrint)}</span></div>
          ` : ''}
        </div>
      </div>
      ${inv.notes ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee"><div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Notes</div><p style="font-size:13px;color:#555;line-height:1.6">${inv.notes}</p></div>` : ''}
      <div style="margin-top:32px;padding-top:14px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa">
        Thank you for your business — ${shopSettings?.companyName || 'Redlined1'}<br>
        ${[shopSettings?.phone, shopSettings?.email].filter(Boolean).join(' · ')}
      </div>
      ${needsWatermark(planStatus) ? `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999"><div style="transform:rotate(-45deg);font-size:72px;font-weight:900;color:rgba(204,0,0,0.07);font-family:system-ui,sans-serif;white-space:nowrap;letter-spacing:-2px">REDLINED1</div></div>` : ''}
    </body></html>`;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  }

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

  async function triggerPaidCleanup(inv: InvoiceFull) {
    try {
      const [allOrders, allQuotations, allROs] = await Promise.all([
        fetchPartsOrders(),
        fetchPartsEstimates(),
        fetchRepairOrders(),
      ]);
      const cn = inv.customerName?.toLowerCase() ?? '';
      const vh = inv.vehicle?.toLowerCase() ?? '';
      const matchOrders = allOrders.filter(o =>
        o.customerName?.toLowerCase() === cn && (!vh || o.vehicle?.toLowerCase() === vh)
      );
      const matchQuotations = allQuotations.filter(q =>
        q.customerName?.toLowerCase() === cn && (!vh || q.vehicle?.toLowerCase() === vh)
      );
      const linkedROs = allROs.filter(ro =>
        (ro.invoiceNumber === inv.invoiceNumber) ||
        (ro.customerName?.toLowerCase() === cn && (!vh || ro.vehicle?.toLowerCase() === vh) && ro.status !== 'Void')
      );
      await Promise.all([
        ...matchOrders.map(o => deletePartsOrder(o.id)),
        ...matchQuotations.map(q => deletePartsEstimate(q.id)),
        ...linkedROs.map(ro => deleteRepairOrder(ro.id)),
      ]);
      const partsCount = matchOrders.length + matchQuotations.length;
      const roCount = linkedROs.length;
      const parts = partsCount > 0 ? `${partsCount} parts record${partsCount !== 1 ? 's' : ''}` : '';
      const ros = roCount > 0 ? `${roCount} repair order${roCount !== 1 ? 's' : ''}` : '';
      if (parts || ros) notify(`Auto-cleaned: ${[parts, ros].filter(Boolean).join(', ')} removed — ${inv.invoiceNumber} paid.`);
    } catch { /* silent — cleanup is best-effort */ }
  }

  function openPayModal(inv: InvoiceFull) {
    const { amount, currency } = getEffectiveTotal(inv);
    setPayModal({ inv, total: amount, currency, mode: 'Cash', cashAmt: String(amount), qrAmt: '0', ref: '', saving: false });
  }

  async function handlePayConfirm() {
    if (!payModal) return;
    const { inv, total, currency, mode, cashAmt, qrAmt, ref } = payModal;
    const cash = Number(cashAmt) || 0;
    const qr = Number(qrAmt) || 0;
    if (mode === 'Split' && Math.abs(cash + qr - total) > 1) {
      setPayModal(m => m ? { ...m, saving: false } : null);
      setError(`Split amounts (${formatMoney(cash, currency)} + ${formatMoney(qr, currency)}) must equal ${formatMoney(total, currency)}`);
      return;
    }
    setPayModal(m => m ? { ...m, saving: true } : null);
    try {
      const paidDate = new Date().toISOString();
      await markInvoicePaid(inv.id);
      const base = { invoiceNumber: inv.invoiceNumber, customerName: inv.customerName, customerId: inv.customerId, status: 'Recorded' as const, currency, referenceNumber: ref, paymentDate: paidDate };
      if (mode === 'Cash') {
        await createPayment({ ...base, amount: total, method: 'Cash', methodDetail: '', notes: `Cash payment — ${inv.invoiceNumber}` });
      } else if (mode === 'QR Code') {
        await createPayment({ ...base, amount: total, method: 'Bank Transfer', methodDetail: 'QR Code', notes: `QR Code transfer — ${inv.invoiceNumber}${ref ? ` Ref: ${ref}` : ''}` });
      } else {
        // Split — two payment records
        await Promise.all([
          createPayment({ ...base, amount: cash, method: 'Cash', methodDetail: '', notes: `Split cash portion — ${inv.invoiceNumber}` }),
          createPayment({ ...base, amount: qr, method: 'Bank Transfer', methodDetail: 'QR Code', notes: `Split QR portion — ${inv.invoiceNumber}${ref ? ` Ref: ${ref}` : ''}` }),
        ]);
      }
      const updated = { ...inv, status: 'Paid', paidDate };
      setInvoices(prev => prev.map(i => i.id === inv.id ? updated : i));
      setSelected(updated);
      const label = mode === 'Split' ? `Cash ${formatMoney(cash, currency)} + QR ${formatMoney(qr, currency)}` : `${mode} ${formatMoney(total, currency)}`;
      notify(`${inv.invoiceNumber} paid — ${label}`);
      setPayModal(null);
      triggerPaidCleanup(inv);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment failed');
      setPayModal(m => m ? { ...m, saving: false } : null);
    }
  }

  async function handleMarkPaid(inv: InvoiceFull) {
    openPayModal(inv);
  }

  async function handleStatusChange(inv: InvoiceFull, status: string) {
    try {
      const paidDate = status === 'Paid' ? new Date().toISOString() : undefined;
      await updateInvoice(inv.id, { status, ...(paidDate ? { paidDate } : {}) });
      if (status === 'Paid' && inv.status !== 'Paid') {
        const { amount: total, currency: payCurrency } = getEffectiveTotal(inv);
        await createPayment({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          customerId: inv.customerId,
          amount: total,
          method: 'Invoice (Status Change)',
          methodDetail: '',
          status: 'Recorded',
          notes: `Auto-recorded when ${inv.invoiceNumber} set to Paid`,
          currency: payCurrency,
          referenceNumber: '',
          paymentDate: paidDate!,
        });
        triggerPaidCleanup(inv);
      }
      const updated = { ...inv, status, ...(paidDate ? { paidDate } : {}) };
      setInvoices(prev => prev.map(i => i.id === inv.id ? updated : i));
      if (selected?.id === inv.id) setSelected(updated);
      notify(status === 'Paid' ? `${inv.invoiceNumber} marked paid. Payment recorded.` : `Status updated to ${status}.`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : '')); }
  }

  function openEmailModal(inv: InvoiceFull) {
    const match = fullCustomers.find(c => c.name.toLowerCase() === inv.customerName?.toLowerCase());
    setEmailModal({ invoice: inv, email: match?.email ?? '', sending: false });
  }

  async function handleSendEmail() {
    if (!emailModal) return;
    setEmailModal(m => m ? { ...m, sending: true } : null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const shopId = getShopId();
      const res = await fetch('/api/send-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'invoice',
          documentId: emailModal.invoice.id,
          shopId,
          email: emailModal.email,
          isWatermarked: needsWatermark(planStatus),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      notify(`Invoice emailed to ${json.sentTo}`);
      setEmailModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send email');
      setEmailModal(m => m ? { ...m, sending: false } : null);
    }
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

  // Summary stats — grouped by effective currency (handles all-foreign-currency invoices)
  const revenueByCurrency = invoices
    .filter(i => i.status === 'Paid')
    .reduce<Record<string, number>>((acc, i) => {
      const { amount, currency } = getEffectiveTotal(i);
      acc[currency] = (acc[currency] ?? 0) + amount;
      return acc;
    }, {});
  // Outstanding = all unpaid, non-void invoices (Draft + Sent)
  const outstandingByCurrency = invoices
    .filter(i => i.status !== 'Paid' && i.status !== 'Void')
    .reduce<Record<string, number>>((acc, i) => {
      const { amount, currency } = getEffectiveTotal(i);
      acc[currency] = (acc[currency] ?? 0) + amount;
      return acc;
    }, {});
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
          {Object.keys(revenueByCurrency).length === 0
            ? <div style={{ fontSize: 22, fontWeight: 700, color: '#4caf50' }}>$0</div>
            : Object.entries(revenueByCurrency).map(([cur, amt]) => (
                <div key={cur} style={{ fontSize: 22, fontWeight: 700, color: '#4caf50', lineHeight: 1.3 }}>{formatMoney(amt, cur)}</div>
              ))
          }
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outstanding</div>
          {Object.keys(outstandingByCurrency).length === 0
            ? <div style={{ fontSize: 22, fontWeight: 700, color: '#2196f3' }}>$0</div>
            : Object.entries(outstandingByCurrency).map(([cur, amt]) => (
                <div key={cur} style={{ fontSize: 22, fontWeight: 700, color: '#2196f3', lineHeight: 1.3 }}>{formatMoney(amt, cur)}</div>
              ))
          }
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
                <div style={{ fontWeight: 700 }}>{(() => { const e = getEffectiveTotal(invoices[0]); return formatMoney(e.amount, e.currency); })()}</div>
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

          {loading && <p style={{ color: 'var(--muted)' }}>Loading invoices…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              {invoices.length === 0 ? 'No invoices yet. Create your first one.' : 'No invoices match your filter.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invPage.pageItems.map((inv, idx) => {
              const t = calculateTotals(inv);
              const eff = getEffectiveTotal(inv);
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
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(eff.amount, eff.currency)}</div>
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

        {/* ── Right: Edit/New Form OR Invoice Detail ── */}
        {showForm ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
            <form onSubmit={handleSave}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{editingId ? `✏️ Edit ${form.invoiceNumber}` : 'New Invoice'}</h3>

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
                  <label style={{ fontWeight: 600, fontSize: 13 }}>LINE ITEMS</label>
                  <button type="button" className="mini-btn primary" onClick={addLine}>+ Add Line</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr 0.5fr 0.9fr 0.75fr 0.8fr 1fr auto', gap: 6, marginBottom: 4, padding: '0 0 6px', borderBottom: '1px solid var(--line)' }}>
                  {['NOTE / REF #', 'DESCRIPTION (EN)', 'ລາຍລະອຽດ (ລາວ)', 'QTY', 'COST', 'MARKUP %', 'CURRENCY', ratesFetching ? 'LINE TOTAL ⟳' : 'LINE TOTAL', ''].map((h, idx) => (
                    <div key={idx} style={{ fontSize: 10, fontWeight: 700, color: idx === 7 && ratesFetching ? '#d97706' : 'var(--muted)', letterSpacing: '0.05em', padding: '0 4px' }}>{h}</div>
                  ))}
                </div>
                {form.lines.map((line, i) => {
                  const rate = parseFloat(line.rate) || 0;
                  const qty = parseFloat(line.qty) || 0;
                  const lineCur = line.currency || form.currency;
                  const lineTotal = rate * qty;
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr 0.5fr 0.9fr 0.75fr 0.8fr 1fr auto', gap: 6, marginBottom: 6 }}>
                      <input value={line.note} onChange={e => setLine(i, 'note', e.target.value)} placeholder="Note / ref #"
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Part / service description"
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 3 }}>
                        <input value={line.laoDescription} onChange={e => setLine(i, 'laoDescription', e.target.value)} placeholder="ລາຍລະອຽດ..."
                          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', minWidth: 0 }} />
                        <button type="button" title="Auto-translate to Lao"
                          onClick={async () => {
                            if (!line.description) return;
                            const lao = await translateToLao(line.description);
                            setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, laoDescription: lao }) }));
                          }}
                          style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', color: 'var(--muted)' }}>🌐</button>
                      </div>
                      <input type="text" inputMode="numeric" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="1"
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      <input type="text" inputMode="decimal" value={line.cost} onChange={e => setLine(i, 'cost', e.target.value)} placeholder="Cost"
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      <input type="text" inputMode="decimal" value={line.markup} onChange={e => setLine(i, 'markup', e.target.value)} placeholder="0"
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      <select value={line.currency} onChange={e => setLine(i, 'currency', e.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 4px', fontSize: 11, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}>
                        <option value="">— same —</option>
                        {[...CURRENCIES].sort((a, b) => {
                          const order = ['USD', 'THB', 'LAK'];
                          const ai = order.indexOf(a.code); const bi = order.indexOf(b.code);
                          if (ai !== -1 && bi !== -1) return ai - bi;
                          if (ai !== -1) return -1; if (bi !== -1) return 1;
                          return 0;
                        }).map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                      <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface-soft)', color: lineTotal < 0 ? '#22c55e' : lineCur !== form.currency ? '#d97706' : 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {lineTotal !== 0 ? formatMoney(lineTotal, lineCur) : '—'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button type="button" title="Move up" disabled={i === 0}
                          onClick={() => setForm(f => { const ls = [...f.lines]; [ls[i-1], ls[i]] = [ls[i], ls[i-1]]; return { ...f, lines: ls }; })}
                          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 4, color: i === 0 ? 'var(--line)' : 'var(--muted)', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, padding: '1px 5px', lineHeight: 1 }}>▲</button>
                        <button type="button" title="Move down" disabled={i === form.lines.length - 1}
                          onClick={() => setForm(f => { const ls = [...f.lines]; [ls[i], ls[i+1]] = [ls[i+1], ls[i]]; return { ...f, lines: ls }; })}
                          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 4, color: i === form.lines.length - 1 ? 'var(--line)' : 'var(--muted)', cursor: i === form.lines.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: '1px 5px', lineHeight: 1 }}>▼</button>
                        <button type="button" title="Remove line" onClick={() => removeLine(i)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>✕</button>
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
          </div>
        ) : selected && totals && (
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
              <button className="btn" onClick={() => printInvoice(selected, totals, invoicePayments)}>👁 Preview / Print</button>
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
              <button className="btn" onClick={() => printInvoice(selected, totals, invoicePayments)}>🖨 Print / PDF</button>
              <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344' }} onClick={() => openEmailModal(selected)}>✉️ Email Customer</button>
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
                  {/* Per-currency subtotals for any foreign-currency lines */}
                  {Object.entries(totals.byCurrency).filter(([cur]) => cur !== selected.currency).map(([cur, amt]) => (
                    <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: '#d97706' }}>Subtotal ({cur})</span>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>{formatMoney(amt, cur)}</span>
                    </div>
                  ))}
                  {totals.subtotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>Subtotal ({selected.currency})</span>
                      <span>{formatMoney(totals.subtotal, selected.currency)}</span>
                    </div>
                  )}
                  {totals.discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>Discount</span>
                      <span>-{formatMoney(totals.discount, selected.currency)}</span>
                    </div>
                  )}
                  {totals.shopSupplies > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>Shop Supplies</span>
                      <span>{formatMoney(totals.shopSupplies, selected.currency)}</span>
                    </div>
                  )}
                  {/* Show total per currency when all lines share one non-base currency */}
                  {(() => {
                    const foreignCurs = Object.keys(totals.byCurrency).filter(c => c !== selected.currency);
                    const allForeign = totals.subtotal === 0 && foreignCurs.length === 1;
                    const displayCur = allForeign ? foreignCurs[0] : selected.currency;
                    const displayAmt = allForeign ? (totals.byCurrency[foreignCurs[0]] - totals.discount) : totals.total;
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 17, borderTop: '2px solid var(--accent)', marginTop: 4 }}>
                        <span>Total ({displayCur})</span>
                        <span style={{ color: 'var(--accent)' }}>{formatMoney(displayAmt, displayCur)}</span>
                      </div>
                    );
                  })()}
                  {invoicePayments.length > 0 && (() => {
                    // Mirror the effective-total logic from the Total row above
                    const foreignCurs = Object.keys(totals.byCurrency).filter(c => c !== selected.currency);
                    const allForeign = totals.subtotal === 0 && foreignCurs.length === 1;
                    const effectiveCur = allForeign ? foreignCurs[0] : selected.currency;
                    const effectiveTotal = allForeign
                      ? (totals.byCurrency[foreignCurs[0]] - totals.discount)
                      : totals.total;
                    // Group payments by their own currency (payments may differ from invoice base currency)
                    const payByCur: Record<string, number> = {};
                    for (const p of invoicePayments) {
                      payByCur[p.currency] = (payByCur[p.currency] ?? 0) + p.amount;
                    }
                    const receivedInEffective = payByCur[effectiveCur] ?? 0;
                    const balance = effectiveTotal - receivedInEffective;
                    return (
                      <>
                        {Object.entries(payByCur).map(([cur, amt]) => (
                          <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--line)' }}>
                            <span style={{ color: '#4caf50', fontWeight: 600 }}>Amount Received{cur !== effectiveCur ? ` (${cur})` : ''}</span>
                            <span style={{ color: '#4caf50', fontWeight: 600 }}>-{formatMoney(amt, cur)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', fontWeight: 700, fontSize: 15 }}>
                          <span style={{ color: balance <= 0 ? '#4caf50' : 'var(--accent)' }}>Balance Due</span>
                          <span style={{ color: balance <= 0 ? '#4caf50' : 'var(--accent)' }}>{balance <= 0 ? 'PAID IN FULL' : formatMoney(balance, effectiveCur)}</span>
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

      {/* Email Modal */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Email Invoice to Customer</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              A PDF of <strong>{emailModal.invoice.invoiceNumber}</strong> will be attached.
              {needsWatermark(planStatus) && <span style={{ display: 'block', marginTop: 6, color: '#d97706', fontSize: 12 }}>⚠️ Trial mode — PDF will include "Redlined1" watermark. Upgrade to remove it.</span>}
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>CUSTOMER EMAIL</label>
            <input
              type="email"
              value={emailModal.email}
              onChange={e => setEmailModal(m => m ? { ...m, email: e.target.value } : null)}
              placeholder="Enter customer email address"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box' }}
            />
            {!emailModal.email && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>No email on file for this customer — please enter one above.</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailModal(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button
                disabled={!emailModal.email || emailModal.sending}
                onClick={handleSendEmail}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2196f3', color: '#fff', cursor: emailModal.email ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: !emailModal.email || emailModal.sending ? 0.6 : 1 }}
              >
                {emailModal.sending ? 'Sending…' : '✉️ Send PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Method Modal ── */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 16px 60px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'var(--accent)', padding: '18px 24px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Record Payment — {payModal.inv.invoiceNumber}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{payModal.inv.customerName} · {payModal.inv.vehicle}</div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {/* Total due */}
              <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 16px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Amount Due</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{formatMoney(payModal.total, payModal.currency)}</span>
              </div>

              {/* Mode selector */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Payment Method</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                {(['Cash', 'QR Code', 'Split'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => setPayModal(pm => pm ? { ...pm, mode: m, cashAmt: m === 'QR Code' ? '0' : String(pm.total), qrAmt: m === 'Cash' ? '0' : m === 'QR Code' ? String(pm.total) : '0' } : null)}
                    style={{ padding: '10px 6px', borderRadius: 9, border: payModal.mode === m ? '2px solid var(--accent)' : '2px solid var(--line)', background: payModal.mode === m ? 'rgba(204,0,0,0.07)' : 'var(--surface)', color: payModal.mode === m ? 'var(--accent)' : 'var(--text)', fontWeight: payModal.mode === m ? 800 : 600, fontSize: 13, cursor: 'pointer' }}>
                    {m === 'Cash' ? '💵 Cash' : m === 'QR Code' ? '📱 QR Code' : '⚡ Split'}
                  </button>
                ))}
              </div>

              {/* Split amounts */}
              {payModal.mode === 'Split' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>💵 Cash Amount</label>
                    <input type="text" inputMode="decimal" value={payModal.cashAmt}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, '');
                        const remaining = Math.max(0, payModal.total - (Number(v) || 0));
                        setPayModal(pm => pm ? { ...pm, cashAmt: v, qrAmt: String(Math.round(remaining)) } : null);
                      }}
                      style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>📱 QR Amount</label>
                    <input type="text" inputMode="decimal" value={payModal.qrAmt}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, '');
                        const remaining = Math.max(0, payModal.total - (Number(v) || 0));
                        setPayModal(pm => pm ? { ...pm, qrAmt: v, cashAmt: String(Math.round(remaining)) } : null);
                      }}
                      style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1/-1', fontSize: 12, color: Math.abs((Number(payModal.cashAmt)||0) + (Number(payModal.qrAmt)||0) - payModal.total) > 1 ? '#ef4444' : '#4caf50', fontWeight: 600 }}>
                    Total: {formatMoney((Number(payModal.cashAmt)||0) + (Number(payModal.qrAmt)||0), payModal.currency)} {Math.abs((Number(payModal.cashAmt)||0) + (Number(payModal.qrAmt)||0) - payModal.total) <= 1 ? '✓ Balanced' : `(need ${formatMoney(payModal.total, payModal.currency)})`}
                  </div>
                </div>
              )}

              {/* QR ref */}
              {(payModal.mode === 'QR Code' || payModal.mode === 'Split') && (
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>QR Reference / Transaction ID (optional)</label>
                  <input value={payModal.ref} onChange={e => setPayModal(pm => pm ? { ...pm, ref: e.target.value } : null)}
                    placeholder="e.g. TXN-123456…"
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              )}

              {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <button type="button" onClick={() => { setPayModal(null); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={handlePayConfirm} disabled={payModal.saving}
                  style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: payModal.saving ? 'not-allowed' : 'pointer', opacity: payModal.saving ? 0.7 : 1 }}>
                  {payModal.saving ? 'Recording…' : `✓ Confirm ${payModal.mode} Payment`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
