'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import {
  fetchPartsEstimates, createPartsEstimate, updatePartsEstimate, deletePartsEstimate,
  PartsEstimate, EstimateLineItem,
  ESTIMATE_STATUSES, PART_CONDITIONS,
} from '@/services/partsEstimateService';
import {
  fetchVendors, createVendor, updateVendor, deleteVendor, PartsVendor,
  createPartsOrder,
} from '@/services/partsOrderService';
import { fetchCustomers } from '@/services/customerService';
import { fetchVehicles } from '@/services/vehicleService';
import { FilterPills } from '@/components/FilterPills';
import {
  fetchEntityImages, uploadEntityImage, deleteEntityImage, saveEntityImageOrder,
  EntityImage,
} from '@/services/entityImageService';
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
  { code: 'THB', symbol: '฿',   label: 'THB — Thai Baht' },
  { code: 'MYR', symbol: 'RM',  label: 'MYR — Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp',  label: 'IDR — Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱',   label: 'PHP — Philippine Peso' },
  { code: 'VND', symbol: '₫',   label: 'VND — Vietnamese Dong' },
  { code: 'LAK', symbol: '₭',   label: 'LAK — Lao Kip' },
  { code: 'KHR', symbol: '៛',   label: 'KHR — Cambodian Riel' },
  { code: 'TWD', symbol: 'NT$', label: 'TWD — Taiwan Dollar' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN — Mexican Peso' },
  { code: 'BRL', symbol: 'R$',  label: 'BRL — Brazilian Real' },
  { code: 'INR', symbol: '₹',   label: 'INR — Indian Rupee' },
  { code: 'KRW', symbol: '₩',   label: 'KRW — South Korean Won' },
  { code: 'ZAR', symbol: 'R',   label: 'ZAR — South African Rand' },
  { code: 'AED', symbol: 'د.إ', label: 'AED — UAE Dirham' },
  { code: 'SAR', symbol: '﷼',   label: 'SAR — Saudi Riyal' },
  { code: 'TRY', symbol: '₺',   label: 'TRY — Turkish Lira' },
  { code: 'PLN', symbol: 'zł',  label: 'PLN — Polish Złoty' },
  { code: 'SEK', symbol: 'kr',  label: 'SEK — Swedish Krona' },
  { code: 'NOK', symbol: 'kr',  label: 'NOK — Norwegian Krone' },
  { code: 'DKK', symbol: 'kr',  label: 'DKK — Danish Krone' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD — New Zealand Dollar' },
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
  'Draft':            '#6b7280',
  'Quoted':           '#3b82f6',
  'Pending Customer': '#ec4899',
  'Approved':         '#22c55e',
  'Declined':         '#ef4444',
  'Expired':          '#f97316',
};

const EMPTY_LINE: EstimateLineItem = { partName: '', partNumber: '', condition: 'New', quantity: 1, unitCost: 0, vendorName: '', currency: 'USD' };
const EMPTY_VENDOR = { name: '', phone: '', email: '', website: '', notes: '' };

type FormState = {
  lineItems: EstimateLineItem[];
  vendorName: string; vendorPhone: string; vendorEmail: string;
  coreCharge: number;
  totalCost: number;
  status: string;
  quoteDate: string; validUntil: string;
  jobCardNumber: string; repairOrderNumber: string;
  vehicle: string; customerName: string;
  notes: string;
  currency: string;
};

const EMPTY_ESTIMATE: FormState = {
  lineItems: [{ ...EMPTY_LINE }],
  vendorName: '', vendorPhone: '', vendorEmail: '',
  coreCharge: 0,
  totalCost: 0,
  status: 'Draft',
  quoteDate: today(), validUntil: '',
  jobCardNumber: '', repairOrderNumber: '',
  vehicle: '', customerName: '',
  notes: '',
  currency: 'USD',
};

function calcTotal(items: EstimateLineItem[], coreCharge: number, mainCurrency = 'USD') {
  // Only sum items whose currency matches the estimate currency; mixed-currency
  // items cannot be added without an exchange rate so they're excluded from the total.
  const parts = items
    .filter(i => (i.currency || mainCurrency) === mainCurrency)
    .reduce((s, i) => s + i.unitCost * i.quantity, 0);
  return { totalCost: parts + coreCharge };
}

export function PartsEstimatesView() {
  const { shopId } = useShop();
  const dispatch = useAppDispatch();

  const [estimates, setEstimates] = useState<PartsEstimate[]>([]);
  const [vendors, setVendors]     = useState<PartsVendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles]   = useState<Array<{ id: string; customerId: string; label: string }>>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState('');
  const [error, setError]         = useState('');

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_ESTIMATE);
  const [saving, setSaving]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorForm, setVendorForm]           = useState(EMPTY_VENDOR);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [savingVendor, setSavingVendor]       = useState(false);
  const [vendorTab, setVendorTab]             = useState<'list' | 'add'>('list');

  const [filterStatus, setFilterStatus] = useState('All');
  const [filterVendor, setFilterVendor] = useState('All');
  const [search, setSearch]             = useState('');

  const [selected, setSelected]   = useState<PartsEstimate | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [images, setImages]             = useState<EntityImage[]>([]);
  const [imagesLoading, setImgLoading]  = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgLabel, setImgLabel]         = useState<'Photo' | 'Invoice'>('Photo');
  const [lightbox, setLightbox]         = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx]   = useState<number | null>(null);
  const dragSrcIdx = useRef(-1);

  const activeEstimateId = editingId ?? selected?.id ?? null;

  const loadImages = useCallback(async (id: string) => {
    setImgLoading(true);
    try {
      const imgs = await fetchEntityImages('parts_estimate', id);
      setImages(imgs);
    } catch { /* non-fatal */ }
    finally { setImgLoading(false); }
  }, []);

  useEffect(() => {
    if (activeEstimateId) loadImages(activeEstimateId);
    else setImages([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEstimateId, loadImages]);

  async function handleImageUpload(files: FileList | null, targetId?: string | null) {
    const id = targetId ?? activeEstimateId;
    if (!files || files.length === 0 || !id) return;
    setUploadingImg(true);
    setFormError('');
    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        const img = await uploadEntityImage('parts_estimate', id, file, imgLabel);
        setImages(prev => [...prev, img]);
        uploaded++;
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setFormError(`Upload failed: ${msg}`);
        notify(`⚠ Upload failed: ${msg}`);
      }
    }
    if (uploaded > 0) notify(`✓ ${uploaded} file${uploaded > 1 ? 's' : ''} uploaded.`);
    setUploadingImg(false);
  }

  async function handleDeleteImage(img: EntityImage) {
    if (!confirm('Remove this image?')) return;
    try {
      await deleteEntityImage(img.id, img.url);
      setImages(prev => prev.filter(i => i.id !== img.id));
    } catch { notify('Delete failed.'); }
  }

  async function handleReorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || !activeEstimateId) return;
    const next = [...images];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setImages(next);
    try {
      await saveEntityImageOrder('parts_estimate', activeEstimateId, next.map(i => i.id));
    } catch { notify('Could not save image order.'); }
  }

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    const [estimatesR, vendorsR, customersR, vehiclesR] = await Promise.allSettled([
      fetchPartsEstimates(), fetchVendors(), fetchCustomers(), fetchVehicles(),
    ]);
    if (estimatesR.status === 'fulfilled') {
      setEstimates(estimatesR.value);
    } else {
      const msg = (estimatesR.reason as { message?: string })?.message ?? String(estimatesR.reason);
      if (msg.includes('parts_estimates') && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('not found'))) {
        setError('__NEEDS_MIGRATION__');
      } else {
        setError(`Could not load parts quotations: ${msg}`);
      }
    }
    if (vendorsR.status === 'fulfilled')   setVendors(vendorsR.value);
    if (customersR.status === 'fulfilled') setCustomers(customersR.value);
    if (vehiclesR.status === 'fulfilled')  setVehicles(vehiclesR.value);
    setLoading(false);
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const customerVehicles = form.customerName
    ? vehicles.filter(v => {
        const c = customers.find(c => c.name === form.customerName);
        return c ? v.customerId === c.id : true;
      })
    : vehicles;

  function setF(patch: Partial<FormState>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      return { ...next, ...calcTotal(next.lineItems, next.coreCharge, next.currency) };
    });
  }

  function updateLineItem(idx: number, field: keyof EstimateLineItem, value: string | number) {
    setForm(prev => {
      const lineItems = prev.lineItems.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      );
      return { ...prev, lineItems, ...calcTotal(lineItems, prev.coreCharge, prev.currency) };
    });
  }

  function addLineItem() {
    setForm(prev => {
      const lineItems = [...prev.lineItems, { ...EMPTY_LINE, vendorName: prev.vendorName, currency: prev.currency }];
      return { ...prev, lineItems };
    });
  }

  function removeLineItem(idx: number) {
    setForm(prev => {
      const lineItems = prev.lineItems.filter((_, i) => i !== idx);
      return { ...prev, lineItems, ...calcTotal(lineItems, prev.coreCharge, prev.currency) };
    });
  }

  function openNew() { setEditingId(null); setForm(EMPTY_ESTIMATE); setShowForm(true); }

  function openEdit(e: PartsEstimate) {
    setEditingId(e.id);
    const lineItems = e.lineItems && e.lineItems.length > 0 ? e.lineItems : [{
      partName: e.partName, partNumber: e.partNumber,
      condition: e.condition, quantity: e.quantity, unitCost: e.unitCost,
    }];
    setForm({
      lineItems,
      vendorName: e.vendorName, vendorPhone: e.vendorPhone, vendorEmail: e.vendorEmail,
      coreCharge: e.coreCharge,
      ...calcTotal(lineItems, e.coreCharge, e.currency || 'USD'),
      status: e.status,
      quoteDate: e.quoteDate, validUntil: e.validUntil,
      jobCardNumber: e.jobCardNumber, repairOrderNumber: e.repairOrderNumber,
      vehicle: e.vehicle, customerName: e.customerName,
      notes: e.notes,
      currency: e.currency || 'USD',
    });
    setSelected(null); setShowForm(true);
  }

  function handleFormSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const hasItem = form.lineItems.some(i => i.partName.trim());
    if (!hasItem) return;
    setShowConfirm(true);
  }

  async function handleConfirmedSave() {
    setShowConfirm(false);
    setSaving(true);
    setFormError('');
    const payload: Omit<PartsEstimate, 'id' | 'createdAt'> = {
      lineItems: form.lineItems,
      partName:  form.lineItems[0]?.partName || '',
      partNumber: form.lineItems[0]?.partNumber || '',
      condition: form.lineItems[0]?.condition || 'New',
      quantity:  form.lineItems.reduce((s, i) => s + i.quantity, 0),
      unitCost:  form.lineItems.length === 1 ? form.lineItems[0].unitCost : 0,
      vendorName: form.vendorName, vendorPhone: form.vendorPhone, vendorEmail: form.vendorEmail,
      coreCharge: form.coreCharge,
      totalCost: form.totalCost,
      status: form.status,
      quoteDate: form.quoteDate, validUntil: form.validUntil,
      jobCardNumber: form.jobCardNumber, repairOrderNumber: form.repairOrderNumber,
      vehicle: form.vehicle, customerName: form.customerName,
      notes: form.notes,
      currency: form.currency,
    };
    try {
      if (editingId) {
        const updated = await updatePartsEstimate(editingId, payload);
        setEstimates(prev => prev.map(e => e.id === editingId ? updated : e));
        notify(`✓ Estimate updated.`);
      } else {
        const created = await createPartsEstimate(payload);
        setEstimates(prev => [created, ...prev]);
        notify(`✓ Estimate saved.`);
      }
      setShowForm(false); setEditingId(null); setForm(EMPTY_ESTIMATE);
    } catch (e: unknown) {
      const msg = (e as Record<string, unknown>)?.message as string || 'Save failed — please try again.';
      setFormError(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove quotation for "${name}"?`)) return;
    try {
      await deletePartsEstimate(id);
      setEstimates(prev => prev.filter(e => e.id !== id));
      setSelected(null);
      notify(`"${name}" quotation removed.`);
    } catch { notify('Delete failed.'); }
  }

  async function handleConvertToOrder(e: PartsEstimate) {
    if (!confirm(`Convert "${e.partName || 'this quotation'}" to a Parts Order?`)) return;
    try {
      await createPartsOrder({
        lineItems: e.lineItems?.length ? e.lineItems : [{ partName: e.partName, partNumber: e.partNumber, condition: e.condition, quantity: e.quantity, unitCost: e.unitCost }],
        partName: e.partName, partNumber: e.partNumber, condition: e.condition,
        quantity: e.quantity, unitCost: e.unitCost,
        vendorName: e.vendorName, vendorPhone: e.vendorPhone, vendorEmail: e.vendorEmail,
        coreCharge: e.coreCharge, totalCost: e.totalCost,
        depositPaid: 0, balanceDue: e.totalCost + e.coreCharge,
        status: 'Pending', paymentStatus: 'Unpaid',
        orderDate: new Date().toISOString().split('T')[0],
        etr: '', receivedDate: '',
        jobCardNumber: e.jobCardNumber, repairOrderNumber: e.repairOrderNumber,
        estimateNumber: '', invoiceNumber: '',
        vehicle: e.vehicle, customerName: e.customerName,
        warranty: '',
        notes: e.notes ? `Converted from Parts Quotation. ${e.notes}` : 'Converted from Parts Quotation.',
        currency: e.currency,
      });
      await deletePartsEstimate(e.id);
      setEstimates(prev => prev.filter(x => x.id !== e.id));
      setSelected(null);
      notify('✓ Converted to Parts Order — quotation removed');
      setTimeout(() => { dispatch({ type: 'SET_MODULE', module: 'parts-orders' }); }, 600);
    } catch (err: unknown) {
      notify('Failed to convert — ' + ((err as { message?: string })?.message ?? 'unknown error'));
    }
  }

  async function handleSaveVendor(ev: React.FormEvent) {
    ev.preventDefault();
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
    if (!confirm(`Remove vendor "${name}"?`)) return;
    try {
      await deleteVendor(id);
      setVendors(prev => prev.filter(v => v.id !== id));
      notify(`Vendor "${name}" removed.`);
    } catch { notify('Failed to remove vendor.'); }
  }

  function handleVendorSelect(name: string) {
    const v = vendors.find(v => v.name === name);
    setForm(prev => ({
      ...prev,
      vendorName: name,
      vendorPhone: v?.phone ?? '',
      vendorEmail: v?.email ?? '',
      lineItems: prev.lineItems.map(li => (!li.vendorName ? { ...li, vendorName: name } : li)),
    }));
  }

  function navigateToLinkedRecord(module: string, eventName: string, detail: Record<string, string>) {
    setSelected(null);
    dispatch({ type: 'SET_MODULE', module });
    setTimeout(() => window.dispatchEvent(new CustomEvent(eventName, { detail })), 80);
  }

  /* filters */
  const PENDING_STATUSES = ['Draft', 'Quoted', 'Pending Customer'];
  const visible = estimates.filter(e => {
    if (filterStatus !== 'All' && e.status !== filterStatus) return false;
    if (filterVendor !== 'All' && e.vendorName !== filterVendor) return false;
    if (search) {
      const q = search.toLowerCase();
      return [e.partName, e.partNumber, e.vendorName, e.customerName, e.vehicle,
              e.jobCardNumber, e.repairOrderNumber].some(f => f?.toLowerCase().includes(q));
    }
    return true;
  });

  const totalPending        = estimates.filter(e => PENDING_STATUSES.includes(e.status)).length;
  const totalPendingCustomer = estimates.filter(e => e.status === 'Pending Customer').length;
  const totalApproved       = estimates.filter(e => e.status === 'Approved').length;
  const uniqueVendorNames   = [...new Set(estimates.map(e => e.vendorName).filter(Boolean))];

  const totalByCurrency = estimates.reduce<Record<string, number>>((acc, e) => {
    const cur = e.currency || 'USD';
    acc[cur] = (acc[cur] || 0) + e.totalCost;
    return acc;
  }, {});

  const money = (v: number) => fmt(v, form.currency || 'USD');
  const moneyE = (v: number, e?: PartsEstimate) => fmt(v, e?.currency || 'USD');

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

  const field = (label: string, children: React.ReactNode, full?: boolean) => (
    <div className="login-field" style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label>{label}</label>
      {children}
    </div>
  );
  const inp = (type: string, val: string | number, cb: (v: string) => void, ph?: string) => (
    <input type={type} value={val} onChange={e => cb(e.target.value)} placeholder={ph} />
  );

  const confirmSummary = () => {
    const cur = form.currency;
    const rows: { label: string; value: string; highlight?: boolean }[] = [];
    form.lineItems.forEach((item, idx) => {
      rows.push({ label: `Part ${form.lineItems.length > 1 ? idx + 1 : ''}`.trim(), value: `${item.partName}${item.partNumber ? ` (${item.partNumber})` : ''}` });
      rows.push({ label: '  Qty / Condition', value: `${item.quantity} × ${item.condition}` });
      const iCur = item.currency || cur;
      rows.push({ label: '  Unit / Line Total', value: `${fmt(item.unitCost, iCur)} → ${fmt(item.unitCost * item.quantity, iCur)}` });
      if (item.vendorName) rows.push({ label: '  Vendor', value: item.vendorName });
    });
    rows.push(
      { label: 'Vendor',      value: form.vendorName || '—' },
      { label: 'Customer',    value: form.customerName || '—' },
      { label: 'Vehicle',     value: form.vehicle || '—' },
      { label: 'Parts Total', value: fmt(form.totalCost - form.coreCharge, cur) },
      { label: 'Core Charge', value: fmt(form.coreCharge, cur) },
      { label: 'Total Quoted',value: fmt(form.totalCost, cur), highlight: false },
      { label: 'Currency',    value: cur },
      { label: 'Status',      value: form.status },
      { label: 'Valid Until', value: form.validUntil ? new Date(form.validUntil).toLocaleDateString() : '—' },
    );
    return rows;
  };

  return (
    <div style={{ padding: '20px 24px' }}>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, background: '#111', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      {error === '__NEEDS_MIGRATION__' && (
        <div style={{ marginBottom: 20, padding: '20px 24px', background: 'rgba(245,158,11,0.08)', border: '2px solid #f59e0b', borderRadius: 12, fontSize: 13 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#b45309', marginBottom: 8 }}>⚙ One-time database setup required</div>
          <p style={{ margin: '0 0 12px', color: '#92400e', lineHeight: 1.6 }}>
            The <strong>parts_estimates</strong> table doesn't exist yet in Supabase. Run this SQL once in your Supabase dashboard to create it:
          </p>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20, color: '#92400e', lineHeight: 2 }}>
            <li>Go to <strong>supabase.com/dashboard</strong> → your project → <strong>SQL Editor</strong></li>
            <li>Click <strong>New query</strong></li>
            <li>Paste the SQL below and click <strong>Run</strong></li>
            <li>Refresh this page</li>
          </ol>
          <pre style={{ background: '#1e1b18', color: '#fef3c7', borderRadius: 8, padding: '14px 16px', fontSize: 11, overflowX: 'auto', lineHeight: 1.6, margin: 0 }}>{`CREATE TABLE IF NOT EXISTS parts_estimates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  part_name           TEXT NOT NULL DEFAULT '',
  part_number         TEXT NOT NULL DEFAULT '',
  quantity            INTEGER NOT NULL DEFAULT 1,
  condition           TEXT NOT NULL DEFAULT 'New',
  line_items          JSONB NOT NULL DEFAULT '[]',
  vendor_name         TEXT NOT NULL DEFAULT '',
  vendor_phone        TEXT NOT NULL DEFAULT '',
  vendor_email        TEXT NOT NULL DEFAULT '',
  unit_cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  core_charge         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'Draft',
  quote_date          DATE,
  valid_until         DATE,
  job_card_number     TEXT NOT NULL DEFAULT '',
  repair_order_number TEXT NOT NULL DEFAULT '',
  vehicle             TEXT NOT NULL DEFAULT '',
  customer_name       TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  currency            TEXT NOT NULL DEFAULT 'USD',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parts_estimates_shop_id ON parts_estimates(shop_id);
ALTER TABLE parts_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shop members can manage their parts estimates"
  ON parts_estimates FOR ALL
  USING (shop_id = ANY(public.my_shop_ids()));`}</pre>
        </div>
      )}
      {error && error !== '__NEEDS_MIGRATION__' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,.1)', color: '#ef4444', borderRadius: 8, fontSize: 13 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <div onClick={() => setFilterStatus(filterStatus === 'Pending Customer' ? 'All' : 'Pending Customer')}
          style={{ background: filterStatus === 'Pending Customer' ? 'rgba(236,72,153,0.08)' : 'var(--card)', border: filterStatus === 'Pending Customer' ? '2px solid #ec4899' : '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Pending Customer</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ec4899' }}>{totalPendingCustomer}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>awaiting customer response</div>
        </div>
        <div onClick={() => setFilterStatus('All')}
          style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#3b82f6' }}>{totalPending}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>draft / quoted / pending</div>
        </div>
        <div onClick={() => setFilterStatus(filterStatus === 'Approved' ? 'All' : 'Approved')}
          style={{ background: filterStatus === 'Approved' ? 'rgba(34,197,94,0.08)' : 'var(--card)', border: filterStatus === 'Approved' ? '2px solid #22c55e' : '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Approved</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#22c55e' }}>{totalApproved}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>customer confirmed</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Total Quoted</div>
          {Object.entries(totalByCurrency).filter(([, v]) => v > 0).length === 0 ? (
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--muted)' }}>—</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {Object.entries(totalByCurrency).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b)).map(([cur, amt]) => (
                <div key={cur} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{fmt(amt, cur)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{cur}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>across all estimates</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search part, vendor, job card, vehicle…"
          style={{ flex: 1, minWidth: 220, padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: 'var(--surface-soft)' }} />
        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-soft)', fontSize: 13 }}>
          <option value="All">All Vendors</option>
          {uniqueVendorNames.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="btn btn-primary" onClick={openNew}>+ New Parts Quotation</button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FilterPills statuses={['All', ...ESTIMATE_STATUSES]} active={filterStatus} onChange={s => setFilterStatus(s)} />
      </div>

      {/* Table */}
      {loading
        ? <p style={{ color: 'var(--muted)', padding: 16 }}>Loading…</p>
        : visible.length === 0
          ? <p style={{ color: 'var(--muted)', padding: 16 }}>No parts quotations yet. Click "+ New Parts Quotation" to start tracking.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Customer / Vehicle</th><th>Parts</th><th>Vendor</th>
                    <th>Total Quoted</th><th>Status</th><th>Quote Date</th><th>Valid Until</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(e => {
                    const ec = e.currency || 'USD';
                    const items = e.lineItems && e.lineItems.length > 0 ? e.lineItems : [{ partName: e.partName, partNumber: e.partNumber, condition: e.condition, quantity: e.quantity, unitCost: e.unitCost }];
                    const firstItem = items[0];
                    return (
                      <tr key={e.id}
                        style={{
                          cursor: 'pointer',
                          background: hoveredId === e.id ? 'rgba(204,0,0,0.06)' : selected?.id === e.id ? 'rgba(204,0,0,0.03)' : 'transparent',
                          transition: 'background 0.12s',
                          outline: hoveredId === e.id ? '1px solid rgba(204,0,0,0.18)' : 'none',
                          outlineOffset: -1,
                        }}
                        onMouseEnter={() => setHoveredId(e.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => setSelected(e)}
                      >
                        <td>
                          {e.customerName && <div style={{ fontSize: 13, fontWeight: 600 }}>{e.customerName}</div>}
                          {e.vehicle && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.vehicle}</div>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{firstItem.partName}</div>
                          {firstItem.partNumber && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{firstItem.partNumber}</div>}
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{firstItem.condition} · qty {items.reduce((s, i) => s + i.quantity, 0)}</div>
                          {items.length > 1 && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>+{items.length - 1} more part{items.length > 2 ? 's' : ''}</div>}
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>{e.vendorName || '—'}</div>
                          {e.vendorPhone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.vendorPhone}</div>}
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmt(e.totalCost, ec)}</td>
                        <td onClick={ev => ev.stopPropagation()}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[e.status] || '#888') + '22', color: STATUS_COLOR[e.status] || '#888', whiteSpace: 'nowrap' }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{e.quoteDate ? new Date(e.quoteDate).toLocaleDateString() : '—'}</td>
                        <td style={{ fontSize: 12, color: e.validUntil && new Date(e.validUntil) < new Date() ? '#ef4444' : undefined }}>
                          {e.validUntil ? new Date(e.validUntil).toLocaleDateString() : '—'}
                        </td>
                        <td onClick={ev => ev.stopPropagation()}>
                          <div className="row-actions">
                            <button className="mini-btn" onClick={() => openEdit(e)}>Edit</button>
                            <button className="mini-btn" style={{ color: '#7c3aed' }} onClick={() => handleConvertToOrder(e)}>→ Order</button>
                            <button className="mini-btn" style={{ color: 'var(--red,#cc0000)' }} onClick={() => handleDelete(e.id, e.partName)}>Remove</button>
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
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
          <img src={lightbox} alt="" onClick={ev => ev.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw', background: 'var(--bg)', borderLeft: '1px solid var(--line)', zIndex: 301, overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface-soft)' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.partName || selected.lineItems?.[0]?.partName || 'Parts Quotation'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[selected.status] || '#888') + '22', color: STATUS_COLOR[selected.status] || '#888' }}>{selected.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => openEdit(selected)} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✏ Edit</button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>✕</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px', flex: 1 }}>
              <SectionLabel label={`Parts (${(selected.lineItems?.length ?? 1)} item${(selected.lineItems?.length ?? 1) !== 1 ? 's' : ''})`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {(selected.lineItems && selected.lineItems.length > 0 ? selected.lineItems : [{
                  partName: selected.partName, partNumber: selected.partNumber,
                  condition: selected.condition, quantity: selected.quantity, unitCost: selected.unitCost,
                }]).map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{item.partName}</div>
                      {item.vendorName && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.1)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.25)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                          🏭 {item.vendorName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 12 }}>
                      {item.partNumber && <span>#{item.partNumber}</span>}
                      <span>{item.condition}</span>
                      <span>Qty: {item.quantity}</span>
                      <span>{moneyE(item.unitCost, selected)} each</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--accent)' }}>
                      Line total: {moneyE(item.unitCost * item.quantity, selected)}
                    </div>
                  </div>
                ))}
              </div>

              <SectionLabel label="Quote Summary" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <InfoBox label="Parts Total" value={moneyE(selected.totalCost - selected.coreCharge, selected)} />
                <InfoBox label="Core Charge" value={moneyE(selected.coreCharge, selected)} />
                <InfoBox label="Total Quoted" value={moneyE(selected.totalCost, selected)} color="var(--accent)" />
                <InfoBox label="Currency"    value={selected.currency || 'USD'} />
              </div>

              {(selected.customerName || selected.vehicle) && (
                <>
                  <SectionLabel label="Customer & Vehicle" />
                  <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.customerName && <div style={{ fontSize: 13 }}>👤 <strong>{selected.customerName}</strong></div>}
                    {selected.vehicle && <div style={{ fontSize: 13 }}>🚗 {selected.vehicle}</div>}
                  </div>
                </>
              )}

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

              {/* Photos */}
              <SectionLabel label="Photos & Attachments" />
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={imgLabel} onChange={e => setImgLabel(e.target.value as 'Photo' | 'Invoice')}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', fontSize: 13 }}>
                    <option value="Photo">📷 Photo</option>
                    <option value="Invoice">🧾 Quote Doc</option>
                  </select>
                  <label style={{ flex: 1, minWidth: 140, padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'center', display: 'block' }}>
                    {uploadingImg ? 'Uploading…' : '+ Add Files'}
                    <input type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} disabled={uploadingImg}
                      onChange={e => handleImageUpload(e.target.files)} />
                  </label>
                </div>
                {imagesLoading && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>}
                {images.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {images.map((img, idx) => (
                      <div key={img.id} draggable
                        onDragStart={() => { dragSrcIdx.current = idx; }}
                        onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                        onDrop={() => { handleReorder(dragSrcIdx.current, idx); setDragOverIdx(null); }}
                        onDragEnd={() => setDragOverIdx(null)}
                        style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', border: dragOverIdx === idx ? '2px solid var(--accent)' : '1px solid var(--line)', cursor: 'grab', background: 'var(--surface-soft)' }}>
                        <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onClick={() => setLightbox(img.url)} />
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 6px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: img.label === 'Invoice' ? 'rgba(139,92,246,0.85)' : 'rgba(34,197,94,0.85)', color: '#fff' }}>
                            {img.label === 'Invoice' ? '🧾' : '📷'}
                          </span>
                          <button onClick={ev => { ev.stopPropagation(); handleDeleteImage(img); }}
                            style={{ background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 13, padding: '1px 5px', lineHeight: 1 }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!imagesLoading && images.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No photos or docs yet.</p>}
              </div>

              <SectionLabel label="Dates" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <InfoBox label="Quote Date"  value={selected.quoteDate  ? new Date(selected.quoteDate).toLocaleDateString()  : '—'} />
                <InfoBox label="Valid Until" value={selected.validUntil ? new Date(selected.validUntil).toLocaleDateString() : '—'}
                         color={selected.validUntil && new Date(selected.validUntil) < new Date() ? '#ef4444' : undefined} />
              </div>

              {(selected.jobCardNumber || selected.repairOrderNumber) && (
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
                  </div>
                </>
              )}

              {selected.notes && (
                <><SectionLabel label="Notes" /><div style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>{selected.notes}</div></>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openEdit(selected)}>✏ Edit Quotation</button>
              <button onClick={() => handleConvertToOrder(selected)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #8b5cf6', background: 'rgba(139,92,246,0.08)', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⇄ To Order
              </button>
              <button className="btn" style={{ color: '#ef4444' }} onClick={() => handleDelete(selected.id, selected.partName)}>Remove</button>
              <button className="btn" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </>
      )}

      {/* ── Add/Edit Form Modal ── */}
      {showForm && (
        <div
          onClick={() => { setShowForm(false); setEditingId(null); }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
          <div onClick={ev => ev.stopPropagation()} onDragOver={e => e.stopPropagation()} onDrop={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 800, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{editingId ? '✏ Edit Parts Quotation' : '+ New Parts Quotation'}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#cc0000', color: '#fff' }}>v1</span>
              </div>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_ESTIMATE); setFormError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)', lineHeight: 1 }}>✕</button>
            </div>

            {formError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.1)', color: '#dc2626', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠ {formError}</span>
                <button onClick={() => setFormError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
              </div>
            )}

            {/* Photos section */}
            <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(239,68,68,0.06)', border: '2px solid #cc0000', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>📎 Photos &amp; Quote Docs</span>
                {activeEstimateId ? (
                  <>
                    <select value={imgLabel} onChange={e => setImgLabel(e.target.value as 'Photo' | 'Invoice')}
                      style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 13 }}>
                      <option value="Photo">📷 Photo</option>
                      <option value="Invoice">🧾 Quote Doc</option>
                    </select>
                    <label style={{ padding: '7px 16px', borderRadius: 7, background: '#cc0000', color: '#fff', fontWeight: 700, fontSize: 13, cursor: uploadingImg ? 'not-allowed' : 'pointer', opacity: uploadingImg ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {uploadingImg ? 'Uploading…' : '+ Add Files'}
                      <input type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx" style={{ display: 'none' }} disabled={uploadingImg}
                        onChange={e => handleImageUpload(e.target.files)} />
                    </label>
                    {imagesLoading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</span>}
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Save this estimate first to enable file uploads</span>
                )}
              </div>
              {activeEstimateId && (
                <>
                  <div
                    style={{ display: 'block', marginTop: 10, border: '2px dashed #cc000066', borderRadius: 8, padding: '16px 10px', textAlign: 'center', cursor: uploadingImg ? 'wait' : 'copy', background: 'var(--card)', fontSize: 13, color: 'var(--muted)', transition: 'border-color .15s, background .15s', userSelect: 'none' }}
                    onDragEnter={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = '#cc0000'; (e.currentTarget as HTMLElement).style.background = 'rgba(204,0,0,0.05)'; }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = '#cc0000'; (e.currentTarget as HTMLElement).style.background = 'rgba(204,0,0,0.05)'; }}
                    onDragLeave={e => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = ''; (e.currentTarget as HTMLElement).style.background = ''; }}
                    onDrop={async e => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).style.borderColor = '';
                      (e.currentTarget as HTMLElement).style.background = '';
                      const capturedId = editingId ?? selected?.id ?? null;
                      if (!capturedId) { notify('Save the quotation first before uploading files.'); return; }
                      const files = e.dataTransfer.files;
                      if (!files || files.length === 0) return;
                      await handleImageUpload(files, capturedId);
                    }}>
                    {uploadingImg ? '⏳ Uploading…' : '📎 Drag & drop photos or quote documents here'}
                  </div>
                  {images.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 10 }}>
                      {images.map((img, idx) => {
                        const isPdf = img.url.toLowerCase().includes('.pdf');
                        return (
                          <div key={img.id} draggable
                            onDragStart={e => { e.stopPropagation(); dragSrcIdx.current = idx; }}
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(idx); }}
                            onDrop={e => { e.preventDefault(); e.stopPropagation(); handleReorder(dragSrcIdx.current, idx); setDragOverIdx(null); }}
                            onDragEnd={() => setDragOverIdx(null)}
                            style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', border: dragOverIdx === idx ? '2px solid #cc0000' : '1px solid var(--line)', cursor: 'grab', background: 'var(--surface-soft)' }}>
                            {isPdf ? (
                              <a href={img.url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', textDecoration: 'none', color: 'var(--text)' }}>
                                <span style={{ fontSize: 32 }}>📄</span>
                                <span style={{ fontSize: 9, marginTop: 4, fontWeight: 600, textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>PDF</span>
                              </a>
                            ) : (
                              <img src={img.url} alt={img.label} draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                                onClick={() => setLightbox(img.url)} />
                            )}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '3px 4px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: img.label === 'Invoice' ? 'rgba(139,92,246,0.85)' : 'rgba(34,197,94,0.85)', color: '#fff' }}>
                                {img.label === 'Invoice' ? '🧾' : '📷'} {img.label}
                              </span>
                              <button type="button" onClick={() => handleDeleteImage(img)}
                                style={{ background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12, padding: '1px 5px' }}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!imagesLoading && images.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '8px 0 0' }}>No files attached yet.</p>}
                </>
              )}
            </div>

            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
                <div>
                  {editingId && (() => {
                    const est = estimates.find(e => e.id === editingId);
                    return est ? (
                      <button type="button"
                        onClick={() => { setShowForm(false); setEditingId(null); handleConvertToOrder(est); }}
                        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #8b5cf6', background: 'rgba(139,92,246,0.08)', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ⇄ Convert to Order
                      </button>
                    ) : null;
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_ESTIMATE); setFormError(''); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {editingId ? 'Review & Update' : 'Review & Save'}
                  </button>
                </div>
              </div>

              {/* Parts table */}
              <FormSection label="Quoted Parts" />
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Part Name *</th>
                      <th style={thStyle}>Part # / SKU</th>
                      <th style={thStyle}>Vendor</th>
                      <th style={thStyle}>Condition</th>
                      <th style={{ ...thStyle, width: 70 }}>Qty</th>
                      <th style={{ ...thStyle, width: 90 }}>Currency</th>
                      <th style={{ ...thStyle, width: 110 }}>Unit Cost</th>
                      <th style={{ ...thStyle, width: 100 }}>Line Total</th>
                      <th style={{ ...thStyle, width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}><input value={item.partName} onChange={e => updateLineItem(idx, 'partName', e.target.value)} placeholder="e.g. Brake Rotor" style={cellInput} /></td>
                        <td style={tdStyle}><input value={item.partNumber} onChange={e => updateLineItem(idx, 'partNumber', e.target.value)} placeholder="SKU" style={cellInput} /></td>
                        <td style={tdStyle}>
                          <select value={item.vendorName || ''} onChange={e => updateLineItem(idx, 'vendorName', e.target.value)} style={{ ...cellInput, paddingRight: 6, minWidth: 130 }}>
                            <option value="">— Vendor —</option>
                            {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                            {item.vendorName && !vendors.find(v => v.name === item.vendorName) && <option value={item.vendorName}>{item.vendorName}</option>}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select value={item.condition} onChange={e => updateLineItem(idx, 'condition', e.target.value)} style={{ ...cellInput, paddingRight: 6 }}>
                            {PART_CONDITIONS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}><input type="number" min={1} value={item.quantity} onFocus={e => e.target.select()} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value) || 1)} style={{ ...cellInput, textAlign: 'center' }} /></td>
                        <td style={tdStyle}>
                          <select value={item.currency || form.currency} onChange={e => updateLineItem(idx, 'currency', e.target.value)} style={{ ...cellInput, paddingRight: 4, minWidth: 80, fontSize: 12 }}>
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}><input type="number" min={0} step="0.01" value={item.unitCost || ''} placeholder="0.00" onFocus={e => e.target.select()} onChange={e => updateLineItem(idx, 'unitCost', Number(e.target.value) || 0)} style={cellInput} /></td>
                        <td style={{ ...tdStyle, fontWeight: 700, fontSize: 13, paddingLeft: 8, whiteSpace: 'nowrap', color: 'var(--accent)' }}>{fmt(item.unitCost * item.quantity, item.currency || form.currency)}</td>
                        <td style={tdStyle}>
                          {form.lineItems.length > 1 && <button type="button" onClick={() => removeLineItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, padding: '4px 6px', lineHeight: 1 }}>✕</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addLineItem} style={{ padding: '7px 16px', borderRadius: 8, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 24 }}>
                + Add Part
              </button>

              {/* Customer & Vehicle */}
              <FormSection label="Customer & Vehicle" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Customer', (
                  <select value={form.customerName} onChange={e => setF({ customerName: e.target.value, vehicle: '' })} style={selStyle}>
                    <option value="">— Select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    {form.customerName && !customers.find(c => c.name === form.customerName) && <option value={form.customerName}>{form.customerName}</option>}
                  </select>
                ))}
                {field('Vehicle', (
                  <select value={form.vehicle} onChange={e => setF({ vehicle: e.target.value })} style={selStyle}>
                    <option value="">— Select vehicle —</option>
                    {customerVehicles.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                    {form.vehicle && !customerVehicles.find(v => v.label === form.vehicle) && <option value={form.vehicle}>{form.vehicle}</option>}
                  </select>
                ))}
              </div>

              {/* Vendor */}
              <FormSection label="Default Vendor (auto-fills new rows)" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="login-field">
                  <label>Vendor Name</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={form.vendorName} onChange={e => handleVendorSelect(e.target.value)} style={{ ...selStyle, flex: 1 }}>
                      <option value="">— Select vendor —</option>
                      {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                      {form.vendorName && !vendors.find(v => v.name === form.vendorName) && <option value={form.vendorName}>{form.vendorName}</option>}
                    </select>
                    <button type="button" onClick={() => { setVendorTab('add'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); setShowVendorModal(true); }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add</button>
                    <button type="button" onClick={() => { setVendorTab('list'); setShowVendorModal(true); }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>⚙ Manage</button>
                  </div>
                </div>
                {field('Vendor Phone', inp('tel',   form.vendorPhone, v => setF({ vendorPhone: v }), '555-000-0000'))}
                {field('Vendor Email', inp('email', form.vendorEmail, v => setF({ vendorEmail: v }), 'parts@vendor.com'))}
              </div>

              {/* Pricing */}
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
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <CalcBox label="Parts Total" value={(() => {
                  const map: Record<string, number> = {};
                  for (const item of form.lineItems) {
                    const c = item.currency || form.currency;
                    map[c] = (map[c] || 0) + item.unitCost * item.quantity;
                  }
                  const entries = Object.entries(map);
                  if (entries.length === 1) return fmt(entries[0][1], entries[0][0]);
                  return entries.map(([c, v]) => fmt(v, c)).join(' + ');
                })()} />
                <CalcBox label="Core Charge" value={money(form.coreCharge)} />
                <CalcBox label="Total Quoted" value={(() => {
                  // Main-currency items + core charge
                  const mainTotal = money(form.totalCost);
                  // Foreign-currency subtotals (excluded from numeric total)
                  const foreign: string[] = [];
                  const fMap: Record<string, number> = {};
                  for (const item of form.lineItems) {
                    const c = item.currency || form.currency;
                    if (c !== form.currency) fMap[c] = (fMap[c] || 0) + item.unitCost * item.quantity;
                  }
                  for (const [c, v] of Object.entries(fMap)) foreign.push(fmt(v, c));
                  return foreign.length ? `${mainTotal} + ${foreign.join(' + ')}` : mainTotal;
                })()} color="var(--accent)" />
              </div>

              {/* Status & Dates */}
              <FormSection label="Status & Dates" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Estimate Status', <select value={form.status} onChange={e => setF({ status: e.target.value })} style={selStyle}>{ESTIMATE_STATUSES.map(s => <option key={s}>{s}</option>)}</select>)}
                {field('Quote Date',   inp('date', form.quoteDate,   v => setF({ quoteDate: v })))}
                {field('Valid Until',  inp('date', form.validUntil,  v => setF({ validUntil: v })))}
              </div>

              {/* Linked Records */}
              <FormSection label="Linked Records" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Job Card #',      inp('text', form.jobCardNumber,      v => setF({ jobCardNumber: v }),      'e.g. JC-1042'))}
                {field('Repair Order #',  inp('text', form.repairOrderNumber,  v => setF({ repairOrderNumber: v }),  'e.g. RO-00012'))}
              </div>

              {/* Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 24 }}>
                {field('Notes', <textarea value={form.notes} onChange={e => setF({ notes: e.target.value })} rows={2} placeholder="Customer preferences, part specifications, sourcing notes…" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 13, resize: 'vertical', width: '100%' }} />, true)}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Save */}
      {showConfirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{editingId ? 'Confirm Update' : 'Confirm Estimate'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Review the details below before saving.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {confirmSummary().map(({ label, value, highlight }, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: label.startsWith('  ') ? 'transparent' : 'var(--surface-soft)', borderRadius: 7, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', minWidth: 140 }}>{label.trim()}</span>
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

      {/* Vendor Manager */}
      {showVendorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowVendorModal(false); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); setVendorTab('list'); } }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Vendor Manager</div>
              <button onClick={() => { setShowVendorModal(false); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); setVendorTab('list'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>✕</button>
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
                {vendors.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No vendors yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {vendors.map(v => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                          {v.phone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.phone}</div>}
                          {v.email && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.email}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => { setEditingVendorId(v.id); setVendorForm({ name: v.name, phone: v.phone, email: v.email, website: v.website, notes: v.notes }); setVendorTab('add'); }}
                            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏ Edit</button>
                          <button onClick={() => handleDeleteVendor(v.id, v.name)}
                            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff0f0', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗑 Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setVendorTab('add'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }} className="btn btn-primary" style={{ marginTop: 16, width: '100%' }}>+ Add New Vendor</button>
              </div>
            )}
            {vendorTab === 'add' && (
              <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="login-field"><label>Vendor Name *</label><input required value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AutoZone Pro" /></div>
                <div className="login-field"><label>Phone</label><input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="555-000-0000" /></div>
                <div className="login-field"><label>Email</label><input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="parts@vendor.com" /></div>
                <div className="login-field"><label>Website</label><input value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))} placeholder="www.vendor.com" /></div>
                <div className="login-field"><label>Account # / Notes</label><input value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} placeholder="Account #, terms, net-30, etc." /></div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => { setVendorTab('list'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}>← Back</button>
                  <button type="submit" className="btn btn-primary" disabled={savingVendor}>{savingVendor ? 'Saving…' : editingVendorId ? '✓ Save Changes' : '+ Add Vendor'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
