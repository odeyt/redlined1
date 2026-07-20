'use client';

import { useEffect, useRef, useState } from 'react';
import { authedFetch, AuthSessionError } from '@/lib/apiClient';
import { useAppDispatch, useAppState } from '@/lib/store';
import { FilterPills } from '@/components/FilterPills';
import { Panel } from '@/components/Panel';
import {
  fetchEstimates, createEstimate, updateEstimate, approveEstimate,
  deleteEstimate, nextEstimateNumber, calculateEstimateTotals, cloneEstimate,
  type EstimateFull, type EstimateLine,
} from '@/services/estimateService';
import { createInvoice, nextInvoiceNumber } from '@/services/invoiceService';
import { fetchCustomerNames, fetchVehicles } from '@/services/vehicleService';
import { fetchJobCards, type JobCardFull } from '@/services/jobCardService';
import type { Vehicle } from '@/lib/types';
import { fetchShopSettings, type ShopSettings } from '@/services/shopSettingsService';
import { CURRENCIES, formatMoney } from '@/services/invoiceService';
import { fetchCustomers } from '@/services/customerService';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { usePlan } from '@/lib/usePlan';
import { needsWatermark } from '@/lib/planGate';

const fmt = (d: string) => d ? new Date(d).toLocaleDateString() : '—';

const STATUS_COLORS: Record<string, string> = {
  Draft: '#888', Sent: '#2196f3', Approved: '#4caf50',
  Declined: '#f44336', Converted: '#9c27b0',
};

// Form uses strings so the user can type freely (decimals, clearing)
type FormLine = { description: string; laoDescription: string; qty: string; cost: string; markup: string; rate: string; currency: string };
const EMPTY_LINE: FormLine = { description: '', laoDescription: '', qty: '1', cost: '', markup: '', rate: '0', currency: '' };

async function translateToLao(text: string): Promise<string> {
  if (!text.trim()) return '';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|lo`);
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch { return text; }
}

const LAO: Record<string, string> = {
  'Estimate': 'ໃບປະເມີນລາຄາ',
  'Draft': 'ຮ່າງ', 'Sent': 'ສົ່ງແລ້ວ', 'Approved': 'ອະນຸມັດ', 'Declined': 'ປະຕິເສດ', 'Converted': 'ປ່ຽນແລ້ວ',
  'Prepared For': 'ກຽມໃຫ້',
  'Reference': 'ອ້າງອີງ',
  'Description / ລາຍລະອຽດ': 'Description / ລາຍລະອຽດ',
  'Qty': 'ຈຳນວນ',
  'Rate': 'ລາຄາ',
  'Amount': 'ຈຳນວນເງິນ',
  'Subtotal': 'ລວມຍ່ອຍ',
  'Discount': 'ສ່ວນຫຼຸດ',
  'Shop Supplies': 'ອຸປະກອນຮ້ານ',
  'Tax': 'ພາສີ',
  'Total': 'ລວມທັງໝົດ',
  'Notes': 'ໝາຍເຫດ',
  'Items': 'ລາຍການ',
  'Date': 'ວັນທີ',
};

function makeLabelFn(lang: 'en' | 'lo' | 'both') {
  return function t(en: string, lao?: string): string {
    const l = lao ?? LAO[en] ?? en;
    if (lang === 'en') return en;
    if (lang === 'lo') return l;
    return l !== en ? `${en} / ${l}` : en;
  };
}

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
  taxRate: 0,
  notes: '',
  validUntil: '',
  approvedDate: null as string | null,
  currency: 'USD',
};

function LakConversionBox({ lakRate, updateLakRate, totalThb }: { lakRate: number; updateLakRate: (v: number) => void; totalThb: number }) {
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>LAK Rate (1 THB =)</span>
        <input
          type="number"
          min={0}
          value={lakRate || ''}
          onChange={e => updateLakRate(Number(e.target.value))}
          placeholder="e.g. 410"
          style={{ width: 90, padding: '3px 7px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>LAK</span>
      </div>
      {lakRate > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: '#ffc107', fontWeight: 600 }}>≈ LAK Equivalent</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#ffc107' }}>
            {new Intl.NumberFormat('lo-LA').format(Math.round(totalThb * lakRate))} LAK
          </span>
        </div>
      )}
    </div>
  );
}

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
  const [allVehicles, setAllVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [custQuery, setCustQuery] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [vehQuery, setVehQuery] = useState('');
  const [vehOpen, setVehOpen] = useState(false);
  const [allJobCards, setAllJobCards] = useState<JobCardFull[]>([]);
  const [jcQuery, setJcQuery] = useState('');
  const [jcOpen, setJcOpen] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);
  const vehRef = useRef<HTMLDivElement>(null);
  const jcRef = useRef<HTMLDivElement>(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  // Exchange rates keyed by base currency, e.g. ratesCache['THB']['USD'] = 0.028
  const ratesCache = useRef<Record<string, Record<string, number>>>({});
  const convertingToInvoice = useRef<Set<string>>(new Set());
  const [ratesFetching, setRatesFetching] = useState(false);
  const [printLang, setPrintLang] = useState<'en' | 'lo' | 'both'>('both');
  const { status: planStatus } = usePlan();
  const [fullCustomers, setFullCustomers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [emailModal, setEmailModal] = useState<{ estimate: EstimateFull; email: string; originalEmail: string; customerId: string; saveEmail: boolean; sending: boolean; channel: 'email' | 'sms' | 'whatsapp' | 'line' | 'telegram' } | null>(null);
  const [lakRate, setLakRate] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('d1_lak_thb_rate') ?? 0) || 0;
  });
  const D1_SHOP_IDS = new Set(['38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606']);
  const isD1Shop = D1_SHOP_IDS.has(getShopId());
  function updateLakRate(v: number) {
    setLakRate(v);
    if (typeof window !== 'undefined') localStorage.setItem('d1_lak_thb_rate', String(v));
  }

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchVehicles().then(vs => setAllVehicles(vs as (Vehicle & { id: string })[])).catch(() => {});
    fetchJobCards().then(setAllJobCards).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
    fetchCustomers().then(list => setFullCustomers(list.map(c => ({ id: c.id, name: c.name, email: c.email })))).catch(() => {});

    function handleClick(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false);
      if (vehRef.current && !vehRef.current.contains(e.target as Node)) setVehOpen(false);
      if (jcRef.current && !jcRef.current.contains(e.target as Node)) setJcOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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

  async function getRate(from: string, to: string): Promise<number> {
    if (!from || !to || from === to) return 1;
    if (ratesCache.current[from]?.[to] != null) return ratesCache.current[from][to];
    try {
      setRatesFetching(true);
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`
      );
      const data = await res.json();
      const rates: Record<string, number> = data[from.toLowerCase()] ?? {};
      ratesCache.current[from] = rates;
      return rates[to.toLowerCase()] ?? 1;
    } catch {
      return 1;
    } finally {
      setRatesFetching(false);
    }
  }

  const LABOR_LINE: FormLine = { description: 'Labor', laoDescription: 'ແຮງງານ', qty: '1', cost: '', markup: '', rate: '0', currency: '' };

  async function openNewForm() {
    const num = await nextEstimateNumber();
    const defaultCurrency = isD1Shop ? 'THB' : 'USD';
    setForm({ ...EMPTY_FORM, estimateNumber: num, lines: [{ ...EMPTY_LINE }, { ...LABOR_LINE }], currency: defaultCurrency });
    setEditingId(null);
    setCustQuery('');
    setVehQuery('');
    setJcQuery('');
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
      lines: est.lines.length > 0 ? est.lines.map(l => ({ description: l.description, laoDescription: l.laoDescription || '', qty: String(l.qty), cost: l.cost != null ? String(l.cost) : '', markup: l.markup != null ? String(l.markup) : '', rate: String(l.rate), currency: l.currency || '' })) : [{ ...EMPTY_LINE }],
      discount: est.discount ?? 0,
      shopSupplies: 0,
      taxRate: est.taxRate ?? 0,
      notes: est.notes,
      validUntil: est.validUntil || '',
      approvedDate: est.approvedDate,
      currency: est.currency || 'USD',
    });
    setEditingId(est.id);
    setCustQuery(est.customerName);
    setVehQuery(est.vehicle);
    setJcQuery(est.jobCardId);
    setShowForm(true);
  }

  async function setLine(i: number, field: keyof FormLine, value: string) {
    const line = form.lines[i];
    if (!line) return;

    // Immediate UI update so the field reflects the keystroke right away
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, [field]: value }),
    }));

    if (field === 'cost' || field === 'markup' || field === 'currency') {
      const costRaw = field === 'cost' ? value : line.cost;
      const cost    = parseFloat(costRaw) || 0;
      const markup  = parseFloat(field === 'markup' ? value : line.markup);
      const pct     = isNaN(markup) ? 0 : markup;

      // When cost is zero/empty, zero out the rate immediately and stop
      if (cost === 0) {
        setForm(f => ({
          ...f,
          lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, [field]: value, rate: '0' }),
        }));
        return;
      }

      // Cost is always in the estimate's MAIN currency (form.currency).
      // The line Currency = customer billing currency.
      // Rate = cost × fx(main → billing) × (1 + markup%).
      const billingCur = field === 'currency' ? (value || form.currency) : (line.currency || form.currency);

      // Same-currency path: compute synchronously in one setForm to avoid intermediate stale rate
      if (!form.currency || !billingCur || form.currency === billingCur) {
        const rate = +(cost * (1 + pct / 100)).toFixed(2);
        setForm(f => ({
          ...f,
          lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, [field]: value, rate: String(rate) }),
        }));
        return;
      }

      // Cross-currency: need async FX fetch
      const fx   = await getRate(form.currency, billingCur);
      const rate = +(cost * fx * (1 + pct / 100)).toFixed(2);
      setForm(f => ({
        ...f,
        lines: f.lines.map((l, idx) =>
          idx !== i ? l : { ...l, [field]: value, rate: String(rate) }
        ),
      }));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName) return setError('Customer name is required.');
    if (!form.estimateNumber) return setError('Estimate number is required.');
    setSaving(true); setError('');
    const parsedLines: EstimateLine[] = form.lines.map(l => {
      const cost = parseFloat(l.cost);
      const markup = parseFloat(l.markup);
      return {
        note: '', description: l.description,
        ...(l.laoDescription ? { laoDescription: l.laoDescription } : {}),
        qty: parseFloat(l.qty) || 0, rate: parseFloat(l.rate) || 0,
        ...(isNaN(cost) ? {} : { cost }),
        ...(isNaN(markup) ? {} : { markup }),
        ...(l.currency ? { currency: l.currency } : {}),
      };
    });
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
    // Guard: already converted
    if (est.status === 'Converted') {
      setError(`${est.estimateNumber} has already been converted to an invoice.`);
      return;
    }
    // Guard: in-flight duplicate prevention
    if (convertingToInvoice.current.has(est.id)) return;
    if (!confirm(`Convert ${est.estimateNumber} to an invoice?`)) return;

    convertingToInvoice.current.add(est.id);
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
    } catch (e: unknown) {
      setError('Convert failed: ' + (e instanceof Error ? e.message : ''));
    } finally {
      convertingToInvoice.current.delete(est.id);
    }
  }

  function openEmailModal(est: EstimateFull) {
    const match = fullCustomers.find(c =>
      (est.customerId && c.id === est.customerId) ||
      c.name.toLowerCase() === est.customerName?.toLowerCase()
    );
    const existingEmail = match?.email ?? '';
    setEmailModal({ estimate: est, email: existingEmail, originalEmail: existingEmail, customerId: match?.id ?? est.customerId ?? '', saveEmail: false, sending: false, channel: 'email' });
  }

  async function handleSendEmail() {
    if (!emailModal) return;
    setEmailModal(m => m ? { ...m, sending: true } : null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const shopId = getShopId();
      const isNewEmail = emailModal.email !== emailModal.originalEmail;
      const res = await fetch('/api/send-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'estimate',
          documentId: emailModal.estimate.id,
          shopId,
          email: emailModal.email,
          isWatermarked: needsWatermark(planStatus),
          saveEmail: emailModal.saveEmail && isNewEmail && !!emailModal.customerId,
          customerId: emailModal.customerId,
        }),
      });
      const json = await res.json() as { sentTo?: string; emailSaved?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error);
      const wantSave = emailModal.saveEmail && isNewEmail && !!emailModal.customerId;
      let emailSaved = json.emailSaved ?? false;
      // Client-side fallback: if API save failed (service role key issue), try direct update
      if (wantSave && !emailSaved && emailModal.customerId) {
        try {
          const { error: saveErr } = await supabase
            .from('customers')
            .update({ email: emailModal.email })
            .eq('id', emailModal.customerId);
          if (!saveErr) emailSaved = true;
        } catch { /* ignore */ }
      }
      notify(`Estimate emailed to ${json.sentTo}${emailSaved ? ' · email saved to customer record' : ''}`);
      if (emailSaved && emailModal.customerId) {
        setFullCustomers(prev => prev.map(c => c.id === emailModal.customerId ? { ...c, email: emailModal.email } : c));
      }
      setEmailModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send email');
      setEmailModal(m => m ? { ...m, sending: false } : null);
    }
  }

  async function handleSendMessage() {
    if (!emailModal || emailModal.channel === 'email') return;
    setEmailModal(m => m ? { ...m, sending: true } : null);
    try {
      const shopId = getShopId();
      const est = emailModal.estimate;
      const t = calculateEstimateTotals(est);
      const res = await authedFetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: emailModal.channel,
          shopId,
          // The recipient is resolved server-side from this resource — the
          // API no longer accepts a caller-supplied destination at all.
          resourceType: 'estimate',
          resourceId: est.id,
          doc: {
            type: 'estimate',
            number: est.estimateNumber,
            customerName: est.customerName,
            vehicle: est.vehicle,
            total: `${est.currency || 'USD'} ${t.total.toFixed(2)}`,
            status: est.status,
            shopName: shopSettings?.companyName ?? 'D1 Imports',
            shopPhone: shopSettings?.phone,
          },
        }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      notify(`Estimate sent via ${emailModal.channel.toUpperCase()}`);
      setEmailModal(null);
    } catch (e: unknown) {
      setError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Failed to send message');
      setEmailModal(m => m ? { ...m, sending: false } : null);
    }
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

  async function handleCloneEstimate(est: EstimateFull) {
    try {
      const cloned = await cloneEstimate(est);
      setEstimates(prev => [cloned, ...prev]);
      setSelected(cloned);
      notify(`Cloned → ${cloned.estimateNumber} (Draft)`);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : 'Clone failed')); }
  }

  const filtered = estimates.filter(est => {
    const matchStatus = filterStatus === 'All' || est.status === filterStatus;
    const matchSearch = !search || [est.estimateNumber, est.customerName, est.vehicle]
      .some(v => v.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const totals = selected ? calculateEstimateTotals(selected) : null;
  const pendingCount = estimates.filter(e => e.status === 'Sent').length;
  const approvedCount = estimates.filter(e => e.status === 'Approved').length;
  const convertedCount = estimates.filter(e => e.status === 'Converted').length;

  return (
    <>
      <style>{`@keyframes clonePulse{0%,100%{box-shadow:0 2px 8px rgba(255,107,0,0.45)}50%{box-shadow:0 4px 20px rgba(255,107,0,0.75),0 0 0 4px rgba(255,107,0,0.15)}}`}</style>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card card-hero" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Estimates</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{estimates.length}</div>
        </div>
        <div className="card card-hero" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending Approval</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2196f3' }}>{pendingCount}</div>
        </div>
        <div className="card card-hero" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approved</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{approvedCount}</div>
        </div>
        <div className="card card-hero" style={{ padding: 16 }}>
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
                <span className="section-label" style={{ display: 'inline-block' }}>⚡ Most Recent</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{estimates[0].estimateNumber} — {estimates[0].customerName}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{estimates[0].vehicle} · {fmt(estimates[0].createdAt)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{formatMoney(calculateEstimateTotals(estimates[0]).total, estimates[0].currency || 'USD')}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[estimates[0].status] || '#888' }}>{estimates[0].status}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="search" style={{ flex: 1, minWidth: 120 }} />
            <button className="btn btn-primary" onClick={openNewForm}>+ New</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FilterPills statuses={['All', 'Draft', 'Sent', 'Approved', 'Declined', 'Converted']} active={filterStatus} onChange={setFilterStatus} />
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
                {/* Customer autocomplete */}
                <div className="login-field" style={{ gridColumn: '1 / -1', position: 'relative' }} ref={custRef}>
                  <label>Customer</label>
                  <input
                    value={custQuery}
                    onChange={e => {
                      setCustQuery(e.target.value);
                      setForm(f => ({ ...f, customerName: e.target.value, customerId: '' }));
                      setCustOpen(true);
                    }}
                    onFocus={() => setCustOpen(true)}
                    placeholder="Type to search customers…"
                    required
                    autoComplete="off"
                    style={{ border: `1px solid ${custOpen ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
                  />
                  {form.customerId && <div style={{ fontSize: 11, color: '#4caf50', marginTop: 3 }}>✓ Matched: {form.customerName}</div>}
                  {custOpen && custQuery.length > 0 && (() => {
                    const q = custQuery.toLowerCase();
                    const matches = customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                        {matches.map(c => (
                          <div key={c.id}
                            onMouseDown={() => {
                              setForm(f => ({ ...f, customerId: c.id, customerName: c.name }));
                              setCustQuery(c.name);
                              setCustOpen(false);
                              // Auto-load this customer's vehicles
                              const cvs = allVehicles.filter(v => v.customerId === c.id);
                              if (cvs.length === 1) { setForm(f => ({ ...f, vehicle: cvs[0].label })); setVehQuery(cvs[0].label); }
                            }}
                            style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--line)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {c.name}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Vehicle autocomplete — search by label, VIN, plate */}
                <div className="login-field" style={{ gridColumn: '1 / -1', position: 'relative' }} ref={vehRef}>
                  <label>Vehicle <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>— search by year, make, model, VIN, or plate</span></label>
                  <input
                    value={vehQuery}
                    onChange={e => {
                      setVehQuery(e.target.value);
                      setForm(f => ({ ...f, vehicle: e.target.value }));
                      setVehOpen(true);
                    }}
                    onFocus={() => setVehOpen(true)}
                    placeholder="e.g. 2022 Ford F-150, KNHMF37AB…, ABC-1234"
                    autoComplete="off"
                    style={{ border: `1px solid ${vehOpen ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
                  />
                  {vehOpen && vehQuery.length > 0 && (() => {
                    const q = vehQuery.toLowerCase();
                    const matches = allVehicles.filter(v => {
                      const label = (v.label ?? '').toLowerCase();
                      const vin   = (v.vin ?? '').toLowerCase();
                      const plate = (v.plate ?? '').toLowerCase();
                      return label.includes(q) || vin.includes(q) || plate.includes(q);
                    }).slice(0, 10);
                    if (matches.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.14)', maxHeight: 260, overflowY: 'auto', marginTop: 2 }}>
                        {matches.map(v => {
                          const owner = customers.find(c => c.id === v.customerId);
                          return (
                            <div key={v.id}
                              onMouseDown={() => {
                                setForm(f => ({ ...f, vehicle: v.label }));
                                setVehQuery(v.label);
                                setVehOpen(false);
                                // Auto-fill customer if not already set
                                if (!form.customerId && owner) {
                                  setForm(f => ({ ...f, vehicle: v.label, customerId: owner.id, customerName: owner.name }));
                                  setCustQuery(owner.name);
                                }
                              }}
                              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--line)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ fontWeight: 600 }}>{v.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                                {owner ? `${owner.name} · ` : ''}{v.vin ? `VIN: ${v.vin}` : ''}{v.plate ? ` · ${v.plate}` : ''}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
                {/* Job Card autocomplete */}
                <div className="login-field" style={{ position: 'relative' }} ref={jcRef}>
                  <label>Job Card ID (optional)</label>
                  <input
                    value={jcQuery}
                    onChange={e => {
                      setJcQuery(e.target.value);
                      setForm(f => ({ ...f, jobCardId: e.target.value }));
                      setJcOpen(true);
                    }}
                    onFocus={() => setJcOpen(true)}
                    placeholder="Search JC number or customer…"
                    autoComplete="off"
                    style={{ border: `1px solid ${jcOpen ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
                  />
                  {jcOpen && jcQuery.length > 0 && (() => {
                    const q = jcQuery.toLowerCase();
                    const matches = allJobCards.filter(jc =>
                      jc.id.toLowerCase().includes(q) ||
                      jc.customer.toLowerCase().includes(q) ||
                      (jc.vehicle ?? '').toLowerCase().includes(q)
                    ).slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto', marginTop: 2 }}>
                        {matches.map(jc => (
                          <div key={jc.id}
                            onMouseDown={() => {
                              setForm(f => ({
                                ...f,
                                jobCardId: jc.id,
                                customerName: f.customerName || jc.customer,
                                customerId: f.customerId || '',
                                vehicle: f.vehicle || jc.vehicle || '',
                              }));
                              setJcQuery(jc.id);
                              if (!form.customerName) setCustQuery(jc.customer);
                              if (!form.vehicle) setVehQuery(jc.vehicle || '');
                              setJcOpen(false);
                            }}
                            style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--line)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ fontWeight: 600 }}>{jc.id}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                              {jc.customer}{jc.vehicle ? ` · ${jc.vehicle}` : ''} · <span style={{ color: '#888' }}>{jc.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Line Items */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="section-label" style={{ marginBottom: 0 }}>Line Items</label>
                  <button type="button" className="mini-btn primary" onClick={() => setForm(f => {
                    const ls = [...f.lines];
                    const lastIsLabor = ls.length > 0 && ls[ls.length - 1].description === 'Labor';
                    if (lastIsLabor) ls.splice(ls.length - 1, 0, { ...EMPTY_LINE });
                    else ls.push({ ...EMPTY_LINE });
                    return { ...f, lines: ls };
                  })}>+ Add Line</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 0.5fr 0.9fr 0.75fr 0.8fr 1fr auto', gap: 4, marginBottom: 4 }}>
                  {['Description (EN)', 'ລາຍລະອຽດ (ລາວ)', 'Qty', 'Cost', 'Markup %', '', ratesFetching ? 'Line Total ⟳' : 'Line Total', ''].map((h, idx) => (
                    <div key={idx} style={{ fontSize: 11, fontWeight: 600, color: idx === 6 && ratesFetching ? '#d97706' : 'var(--muted)', padding: '0 4px' }}>{h}</div>
                  ))}
                </div>
                {form.lines.map((line, i) => {
                  const rate = parseFloat(line.rate) || 0;
                  const qty  = parseFloat(line.qty)  || 0;
                  const lineCur = line.currency || form.currency;
                  const lineTotal = rate * qty;
                  return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 0.5fr 0.9fr 0.75fr 0.8fr 1fr auto', gap: 4, marginBottom: 6 }}>
                    <input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Part / service description" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <div style={{ display: 'flex', gap: 3 }}>
                      <input value={line.laoDescription} onChange={e => setLine(i, 'laoDescription', e.target.value)} placeholder="ລາຍລະອຽດ..." style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                      <button type="button" title="Auto-translate to Lao"
                        onClick={async () => {
                          if (!line.description) return;
                          const lao = await translateToLao(line.description);
                          setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx !== i ? l : { ...l, laoDescription: lao }) }));
                        }}
                        style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        🌐
                      </button>
                    </div>
                    <input type="text" inputMode="numeric" value={line.qty} onChange={e => setLine(i, 'qty', e.target.value)} placeholder="1" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <input type="text" inputMode="decimal" value={line.cost} onChange={e => setLine(i, 'cost', e.target.value)} placeholder="Cost" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <input type="text" inputMode="decimal" value={line.markup} onChange={e => setLine(i, 'markup', e.target.value)} placeholder="0" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }} />
                    <select value={line.currency} onChange={e => setLine(i, 'currency', e.target.value)}
                      style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 4px', fontSize: 11, background: 'var(--surface)', color: 'var(--text)' }}>
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
                      <button type="button" title="Remove line" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                  );
                })}

              </div>

              {/* Line items subtotal — outside the scrollable lines container */}
              {(() => {
                const totals: Record<string, number> = {};
                form.lines.forEach(l => {
                  const cur = l.currency || form.currency;
                  const val = (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0);
                  totals[cur] = (totals[cur] || 0) + val;
                });
                const entries = Object.entries(totals).filter(([, v]) => v !== 0);
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="login-field">
                  <label>Discount ($)</label>
                  <input type="text" inputMode="decimal" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
                </div>
                <div className="login-field">
                  <label>Tax Rate (%)</label>
                  <input type="text" inputMode="decimal" value={(form.taxRate * 100).toFixed(1)} onChange={e => setForm(f => ({ ...f, taxRate: (parseFloat(e.target.value) || 0) / 100 }))} placeholder="8.0" />
                </div>
              </div>

              {/* Live running total — updates instantly as form changes */}
              {(() => {
                const lineSubtotal = form.lines
                  .filter(l => !l.currency || l.currency === form.currency)
                  .reduce((s, l) => s + (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0), 0);
                if (lineSubtotal === 0) return null;
                const disc = form.discount || 0;
                const afterDisc = Math.max(lineSubtotal - disc, 0);
                const taxAmt = afterDisc * (form.taxRate || 0);
                const total = afterDisc + taxAmt;
                return (
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: 4 }}>
                      <span>Subtotal</span><span>{formatMoney(lineSubtotal, form.currency)}</span>
                    </div>
                    {disc > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4caf50', marginBottom: 4 }}>
                        <span>Discount</span><span>-{formatMoney(disc, form.currency)}</span>
                      </div>
                    )}
                    {taxAmt > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f59e0b', marginBottom: 4 }}>
                        <span>Tax ({(form.taxRate * 100).toFixed(1)}%)</span><span>+{formatMoney(taxAmt, form.currency)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15, borderTop: '2px solid var(--line)', paddingTop: 8, marginTop: 4, color: 'var(--accent)' }}>
                      <span>TOTAL</span><span>{formatMoney(total, form.currency)}</span>
                    </div>
                  </div>
                );
              })()}

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
        {selected && totals && (
          <div>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => openEditForm(selected)}>✏️ Edit</button>
              <button
                onClick={() => handleCloneEstimate(selected)}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #ff6b00, #ff9500)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ff6b00'; }}
                style={{
                  padding: '8px 16px', borderRadius: 999, border: '2px solid #ff6b00', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, letterSpacing: 0.3,
                  background: 'transparent',
                  color: '#ff6b00', boxShadow: '0 2px 8px rgba(255,107,0,0.45)',
                  animation: 'clonePulse 2s ease-in-out infinite',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                ⚡ Clone
              </button>
              <button className="btn" onClick={() => setShowPreview(true)}>👁 Preview</button>
              {selected.status !== 'Approved' && selected.status !== 'Converted' && selected.status !== 'Declined' && (
                <button className="btn" style={{ background: 'rgba(76,175,80,0.12)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleApprove(selected)}>✓ Approve</button>
              )}
              {selected.status !== 'Declined' && selected.status !== 'Converted' && (
                <button className="btn" style={{ background: 'rgba(244,67,54,0.08)', color: '#f44336', border: '1px solid #f4433633' }} onClick={() => handleDecline(selected)}>✕ Decline</button>
              )}
              {(selected.status === 'Approved') && (() => {
                const busy = convertingToInvoice.current.has(selected.id);
                return (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => handleConvertToInvoice(selected)}
                    style={{ background: busy ? 'rgba(156,163,175,0.1)' : 'rgba(156,39,176,0.1)', color: busy ? '#9ca3af' : '#9c27b0', border: `1px solid ${busy ? '#d1d5db' : '#9c27b033'}`, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                    {busy ? '⟳ Converting…' : '⚡ Convert to Invoice'}
                  </button>
                );
              })()}
              <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344' }} onClick={() => openEmailModal(selected)}>✉️ Email Customer</button>
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
                  <div className="section-label" style={{ marginBottom: 6 }}>Prepared For</div>
                  <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                  {selected.vehicle && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.vehicle}</div>}
                </div>
                {selected.jobCardId && (
                  <div>
                    <div className="section-label" style={{ marginBottom: 6 }}>Reference</div>
                    <div style={{ fontSize: 13 }}>Job Card: <strong>{selected.jobCardId}</strong></div>
                  </div>
                )}
              </div>

              {/* Lines */}
              <table style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Description / ລາຍລະອຽດ</th>
                    <th style={{ textAlign: 'right', width: 60 }}>Qty</th>
                    <th style={{ textAlign: 'right', width: 90 }}>Rate</th>
                    <th style={{ textAlign: 'right', width: 100 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>No line items</td></tr>}
                  {selected.lines.map((line, i) => {
                    const lc = line.currency || selected.currency;
                    return (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{line.description}</div>
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

              {/* Totals — grouped by billing currency */}
              {(() => {
                const perCur: Record<string, number> = {};
                for (const l of selected.lines) {
                  const cur = l.currency || selected.currency;
                  perCur[cur] = (perCur[cur] || 0) + l.qty * l.rate;
                }
                const entries = Object.entries(perCur).filter(([, v]) => v > 0);
                return (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <div style={{ width: 300 }}>
                      {entries.map(([cur, sub]) => {
                        const isMain = cur === selected.currency;
                        const disc = isMain ? totals.discount : 0;
                        const tax = isMain ? totals.tax : 0;
                        const grandTotal = isMain ? totals.total : sub;
                        return (
                          <div key={cur}>
                            {entries.length > 1 && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: isMain ? 'var(--muted)' : '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 0 2px' }}>{cur} Items</div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                              <span style={{ color: 'var(--muted)' }}>Subtotal</span><span>{formatMoney(sub, cur)}</span>
                            </div>
                            {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Discount</span><span>-{formatMoney(disc, cur)}</span></div>}
                            {isMain && selected.taxRate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Tax ({(selected.taxRate * 100).toFixed(1)}%)</span><span>{formatMoney(tax, cur)}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 17 }}>
                              <span>Total ({cur})</span>
                              <span style={{ color: 'var(--accent)' }}>{formatMoney(grandTotal, cur)}</span>
                            </div>
                            {/* LAK conversion — D1 shops only, THB currency only */}
                            {isD1Shop && cur === 'THB' && isMain && (
                              <LakConversionBox lakRate={lakRate} updateLakRate={updateLakRate} totalThb={grandTotal} />
                            )}
                          </div>
                        );
                      })}
                      {entries.length === 0 && (() => {
                        const cur = selected.currency;
                        const disc = totals?.discount ?? 0;
                        const tax = totals?.tax ?? 0;
                        const grand = totals?.total ?? 0;
                        return (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                              <span style={{ color: 'var(--muted)' }}>Subtotal</span><span>{formatMoney(0, cur)}</span>
                            </div>
                            {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Discount</span><span>-{formatMoney(disc, cur)}</span></div>}
                            {selected.taxRate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Tax ({(selected.taxRate * 100).toFixed(1)}%)</span><span>{formatMoney(tax, cur)}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px', fontWeight: 800, fontSize: 17 }}>
                              <span>Total ({cur})</span>
                              <span style={{ color: 'var(--accent)' }}>{formatMoney(grand, cur)}</span>
                            </div>
                            {isD1Shop && cur === 'THB' && (
                              <LakConversionBox lakRate={lakRate} updateLakRate={updateLakRate} totalThb={grand} />
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {selected.notes && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div className="section-label" style={{ marginBottom: 6 }}>Notes</div>
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
        <div className="print-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div className="print-content" style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 720, padding: 48, position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            {/* UI controls — hidden on print via globals.css .no-print */}
            <div className="no-print">
              <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 16, right: 16, background: '#f0f0f0', border: 'none', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontSize: 15, color: '#333' }}>✕ Close</button>
              <button onClick={() => window.print()}
                onMouseEnter={e => { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; }}
                style={{ position: 'absolute', top: 16, right: 100, background: 'transparent', border: '2px solid #cc0000', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#cc0000', fontWeight: 600, boxShadow: '0 3px 10px rgba(204,0,0,0.35)', transition: 'background 0.15s, color 0.15s' }}>🖨 Print</button>
              {/* Language toggle */}
              <div style={{ position: 'absolute', top: 56, right: 16, display: 'flex', gap: 4 }}>
                {(['en', 'both', 'lo'] as const).map(lang => (
                  <button key={lang} onClick={() => setPrintLang(lang)}
                    style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #ddd', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: printLang === lang ? '#cc0000' : '#f5f5f5', color: printLang === lang ? '#fff' : '#555' }}>
                    {lang === 'en' ? 'EN' : lang === 'lo' ? 'ລາວ' : 'EN+ລາວ'}
                  </button>
                ))}
              </div>
            </div>

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
              {(() => {
                const t = makeLabelFn(printLang);
                return (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{t('Estimate', 'ໃບປະເມີນລາຄາ')}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#111', marginTop: 4 }}>{selected.estimateNumber}</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: (STATUS_COLORS[selected.status] || '#888') + '22', color: STATUS_COLORS[selected.status] || '#888' }}>{t(selected.status, LAO[selected.status]).toUpperCase()}</span>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 8, lineHeight: 1.7 }}>
                      {t('Date', 'ວັນທີ')}: {fmt(selected.createdAt)}<br />
                      {selected.validUntil && <>{t('Valid until', 'ໃຊ້ໄດ້ຮອດ')}: {fmt(selected.validUntil)}<br /></>}
                      {selected.approvedDate && <span style={{ color: '#4caf50', fontWeight: 600 }}>{t('Approved', 'ອະນຸມັດ')}: {fmt(selected.approvedDate)}</span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const t = makeLabelFn(printLang);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                  <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{t('Prepared For', 'ກຽມໃຫ້')}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.customerName}</div>
                    {selected.vehicle && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{selected.vehicle}</div>}
                  </div>
                  {selected.jobCardId && (
                    <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '14px 18px' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{t('Reference', 'ອ້າງອີງ')}</div>
                      <div>Job Card: <strong>{selected.jobCardId}</strong></div>
                    </div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const t = makeLabelFn(printLang);
              const descHeader = printLang === 'en' ? 'Description' : printLang === 'lo' ? 'ລາຍລະອຽດ' : 'Description / ລາຍລະອຽດ';
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#111' }}>
                  <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                      {[descHeader, t('Qty', 'ຈຳນວນ'), t('Rate', 'ລາຄາ'), t('Amount', 'ຈຳນວນເງິນ')].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 1 ? 'right' : 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line, i) => {
                      const lc = line.currency || selected.currency;
                      const showEn = printLang !== 'lo';
                      const showLao = printLang !== 'en';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '10px 12px' }}>
                            {showEn && <div style={{ fontSize: 14, fontWeight: 500 }}>{line.description}</div>}
                            {showLao && line.laoDescription && <div style={{ fontSize: printLang === 'lo' ? 14 : 12, fontWeight: printLang === 'lo' ? 500 : 400, color: printLang === 'lo' ? '#111' : '#888', marginTop: showEn ? 2 : 0 }}>{line.laoDescription}</div>}
                            {showLao && !line.laoDescription && printLang === 'lo' && <div style={{ fontSize: 14 }}>{line.description}</div>}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{line.qty}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>{formatMoney(line.rate, lc)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(line.qty * line.rate, lc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}

            {/* Print totals — grouped by billing currency */}
            {(() => {
              const t = makeLabelFn(printLang);
              const perCur: Record<string, number> = {};
              for (const l of selected.lines) {
                const cur = l.currency || selected.currency;
                perCur[cur] = (perCur[cur] || 0) + l.qty * l.rate;
              }
              const entries = Object.entries(perCur).filter(([, v]) => v > 0);
              return (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <div style={{ width: 300 }}>
                    {entries.map(([cur, sub]) => {
                      const isMain = cur === selected.currency;
                      const disc = isMain ? totals.discount : 0;
                      const tax = isMain ? totals.tax : 0;
                      const grandTotal = isMain ? totals.total : sub;
                      return (
                        <div key={cur} style={{ marginBottom: entries.length > 1 ? 12 : 0 }}>
                          {entries.length > 1 && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: isMain ? '#666' : '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0 2px' }}>{cur} {t('Items', 'ລາຍການ')}</div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                            <span>{t('Subtotal', 'ລວມຍ່ອຍ')}</span><span>{formatMoney(sub, cur)}</span>
                          </div>
                          {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}><span>{t('Discount', 'ສ່ວນຫຼຸດ')}</span><span>-{formatMoney(disc, cur)}</span></div>}
                          {isMain && selected.taxRate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                            <span>{t('Tax', 'ພາສີ')} ({(selected.taxRate * 100).toFixed(1)}%)</span><span>{formatMoney(tax, cur)}</span>
                          </div>}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontWeight: 800, fontSize: 20, borderTop: '2px solid #cc0000', marginTop: 4 }}>
                            <span>{t('Total', 'ລວມທັງໝົດ')} ({cur})</span>
                            <span style={{ color: '#cc0000' }}>{formatMoney(grandTotal, cur)}</span>
                          </div>
                          {isD1Shop && cur === 'THB' && isMain && lakRate > 0 && (
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>≈ LAK (1 THB = {lakRate} LAK)</span>
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{new Intl.NumberFormat('lo-LA').format(Math.round(grandTotal * lakRate))} LAK</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {entries.length === 0 && (() => {
                      const cur = selected.currency;
                      const disc = totals?.discount ?? 0;
                      const tax = totals?.tax ?? 0;
                      const grand = totals?.total ?? 0;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                            <span>{t('Subtotal', 'ລວມຍ່ອຍ')}</span><span>{formatMoney(0, cur)}</span>
                          </div>
                          {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}><span>{t('Discount', 'ສ່ວນຫຼຸດ')}</span><span>-{formatMoney(disc, cur)}</span></div>}
                          {selected.taxRate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13, color: '#444' }}>
                            <span>{t('Tax', 'ພາສີ')} ({(selected.taxRate * 100).toFixed(1)}%)</span><span>{formatMoney(tax, cur)}</span>
                          </div>}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontWeight: 800, fontSize: 20, borderTop: '2px solid #cc0000', marginTop: 4 }}>
                            <span>{t('Total', 'ລວມທັງໝົດ')} ({cur})</span>
                            <span style={{ color: '#cc0000' }}>{formatMoney(grand, cur)}</span>
                          </div>
                          {isD1Shop && cur === 'THB' && lakRate > 0 && (
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>≈ LAK (1 THB = {lakRate} LAK)</span>
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{new Intl.NumberFormat('lo-LA').format(Math.round(grand * lakRate))} LAK</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Notes are internal only — not shown to customers on the estimate print */}

            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #eee', textAlign: 'center', fontSize: 11, color: '#aaa' }}>
              {makeLabelFn(printLang)('This estimate is valid until', 'ໃບປະເມີນນີ້ໃຊ້ໄດ້ຮອດ')} {selected.validUntil ? fmt(selected.validUntil) : makeLabelFn(printLang)('further notice', 'ແຈ້ງເຕືອນຕໍ່ໄປ')} — {shopSettings?.companyName || 'Redlined1'}
              {shopSettings?.phone && ` · ${shopSettings.phone}`}
            </div>

            {/* Watermark overlay for trial plan */}
            {needsWatermark(planStatus) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
                <div style={{ transform: 'rotate(-45deg)', fontSize: 72, fontWeight: 900, color: 'rgba(204,0,0,0.07)', fontFamily: 'system-ui,sans-serif', whiteSpace: 'nowrap', letterSpacing: -2, userSelect: 'none' }}>REDLINED1</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Modal — Email / SMS / WhatsApp / LINE / Telegram */}
      {emailModal && (() => {
        const msg = shopSettings?.messaging;
        // LINE/Telegram removed from the picker entirely — the API now
        // refuses both unconditionally (no per-customer contact mapping
        // exists to resolve a trusted recipient from; see
        // docs/SEND_MESSAGE_RECIPIENT_RESOLUTION.md). Offering them here
        // would just produce a guaranteed-failing send.
        const channels: Array<{ id: 'email'|'sms'|'whatsapp'; icon: string; label: string; enabled: boolean }> = (
          [
            { id: 'email'    as const, icon: '✉️',  label: 'Email',     enabled: true },
            { id: 'sms'      as const, icon: '📱',  label: 'SMS',       enabled: !!(msg?.smsEnabled) },
            { id: 'whatsapp' as const, icon: '💬',  label: 'WhatsApp',  enabled: !!(msg?.whatsappEnabled) },
          ] as const
        ).filter(c => c.enabled) as Array<{ id: 'email'|'sms'|'whatsapp'; icon: string; label: string; enabled: boolean }>;
        const ch = emailModal.channel;
        const isEmail = ch === 'email';
        const sendLabel: Record<string, string> = { email: '✉️ Send PDF', sms: '📱 Send SMS', whatsapp: '💬 Send WhatsApp', line: '🟢 Send LINE', telegram: '✈️ Send Telegram' };
        const canSend = isEmail ? !!emailModal.email : true;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 22 }}>📤</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>Send Estimate to Customer</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{emailModal.estimate.estimateNumber} · {emailModal.estimate.customerName}</div>
                </div>
              </div>

              {/* Channel tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                {channels.map(c => (
                  <button key={c.id} onClick={() => setEmailModal(m => m ? { ...m, channel: c.id } : null)}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${ch === c.id ? 'var(--accent)' : 'var(--line)'}`, background: ch === c.id ? 'rgba(204,0,0,0.08)' : 'transparent', color: ch === c.id ? 'var(--accent)' : 'var(--text)', fontWeight: ch === c.id ? 700 : 500, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>

              {/* Email channel */}
              {isEmail && <>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                  A PDF copy will be emailed with the estimate attached.
                  {needsWatermark(planStatus) && <span style={{ display: 'block', marginTop: 4, color: '#d97706' }}>⚠️ Trial mode — PDF will include watermark.</span>}
                </div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Customer Email</label>
                <input type="email" value={emailModal.email} onChange={e => setEmailModal(m => m ? { ...m, email: e.target.value } : null)}
                  placeholder="customer@email.com" autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${emailModal.email ? 'var(--line)' : '#ef4444'}`, background: 'var(--surface)', color: 'var(--fg)', fontSize: 14, boxSizing: 'border-box' }} />
                {!emailModal.originalEmail && emailModal.email && emailModal.customerId && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={emailModal.saveEmail} onChange={e => setEmailModal(m => m ? { ...m, saveEmail: e.target.checked } : null)} style={{ width: 15, height: 15 }} />
                    <span>Save this email to the customer record</span>
                  </label>
                )}
                {!emailModal.email && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>⚠️ Enter an email address to send.</div>}
              </>}

              {/* Messaging channels */}
              {!isEmail && <>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                  A text summary of the estimate details will be sent to the phone number on file for this
                  customer. Configure channel credentials in <strong>Settings → Messaging</strong>. If no
                  phone number is on file, add one to the customer record first.
                </div>
              </>}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
                <button onClick={() => setEmailModal(null)}
                  style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Cancel
                </button>
                <button disabled={!canSend || emailModal.sending}
                  onClick={isEmail ? handleSendEmail : handleSendMessage}
                  onMouseEnter={e => { if (canSend && !emailModal.sending) { e.currentTarget.style.background = 'linear-gradient(135deg,#1e88e5,#1565c0)'; e.currentTarget.style.color = '#fff'; } }}
                  onMouseLeave={e => { if (canSend && !emailModal.sending) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1565c0'; } }}
                  style={{ padding: '9px 22px', borderRadius: 999, border: canSend && !emailModal.sending ? '2px solid #1565c0' : 'none', background: canSend && !emailModal.sending ? 'transparent' : '#9ca3af', color: canSend && !emailModal.sending ? '#1565c0' : '#fff', cursor: canSend && !emailModal.sending ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, transition: 'all 0.15s' }}>
                  {emailModal.sending ? '⟳ Sending…' : (sendLabel[ch] ?? 'Send')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
