'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { StorageLink } from '@/components/StorageLink';
import { useShop } from '@/lib/useShop';
import { vehicleOptionValue, vehicleOptionLabel } from '@/lib/vehicleOption';
import { getExchangeRate, convertAmount } from '@/lib/fx';
import { StorageImage } from '@/components/StorageImage';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { useAppDispatch } from '@/lib/store';
import {
  fetchPartsEstimates, createPartsEstimate, updatePartsEstimate, deletePartsEstimate,
  PartsEstimate, EstimateLineItem,
  ESTIMATE_STATUSES, PART_CONDITIONS,
} from '@/services/partsEstimateService';
import {
  fetchVendors, fetchVendorsAll, createVendor, updateVendor, deleteVendor, PartsVendor,
  createPartsOrder,
} from '@/services/partsOrderService';
import { fetchCustomers, saveCustomer } from '@/services/customerService';
import { fetchVehiclesAll } from '@/services/vehicleService';
import { createEstimate, nextEstimateNumber } from '@/services/estimateService';
import { fetchInvoices } from '@/services/invoiceService';
import { FilterPills } from '@/components/FilterPills';
import {
  fetchEntityImages, uploadEntityImage, deleteEntityImage, saveEntityImageOrder,
  updateEntityImageLabel, EntityImage,
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
  'Converted':        '#9c27b0',
};

function extractLinkedEstimate(notes: string): string | null {
  const m = notes?.match(/\[Estimate:\s*(EST-\d+)\]/);
  return m ? m[1] : null;
}

// currency is intentionally absent: a line item inherits the quote's currency.
//
// This carried currency: 'USD'. addLineItem overrides it with the form's
// currency, but the FIRST line item of every quote was created as a raw copy —
// so it was stored as USD no matter what the user selected, while the cell
// rendered `item.currency || form.currency` and showed the right one. Display
// and data disagreed, silently.
//
// The consequence is monetary, not cosmetic: converting a quote to an order
// runs fxRate(itemCurrency, mainCurrency), so a ฿3,000 part recorded as USD
// becomes roughly ฿108,000.
const EMPTY_LINE: Omit<EstimateLineItem, 'currency'> = { partName: '', partNumber: '', condition: 'New', quantity: 1, unitCost: 0, vendorName: '' };

/** A blank line for a quote in the given currency. Never defaults the currency. */
const emptyLine = (currency: string): EstimateLineItem => ({ ...EMPTY_LINE, currency });
const EMPTY_VENDOR = { name: '', phone: '', email: '', website: '', notes: '' };

type FormState = {
  lineItems: EstimateLineItem[];
  vendorName: string; vendorPhone: string; vendorEmail: string;
  coreCharge: number;
  totalCost: number;
  /**
   * Amount already paid up front. Balance is always derived from it rather
   * than stored, so the two cannot disagree — the same rule parts orders
   * already follow (see calcTotals in PartsOrdersView).
   */
  deposit: number;
  /**
   * Currency the deposit was actually handed over in — often not the quote's.
   * Stored alongside the amount so the figure is never ambiguous; conversion
   * happens for display and on convert-to-order, never to the stored value.
   */
  depositCurrency: string;
  status: string;
  quoteDate: string; validUntil: string;
  jobCardNumber: string; repairOrderNumber: string;
  vehicle: string; customerName: string;
  notes: string;
  currency: string;
};

const DEFAULT_CURRENCY = 'USD';

const EMPTY_ESTIMATE: FormState = {
  // Built from the same currency as the form below it, so the first line can
  // never disagree with the quote it belongs to.
  lineItems: [emptyLine(DEFAULT_CURRENCY)],
  vendorName: '', vendorPhone: '', vendorEmail: '',
  coreCharge: 0,
  totalCost: 0,
  deposit: 0,
  depositCurrency: DEFAULT_CURRENCY,
  status: 'Draft',
  quoteDate: today(), validUntil: '',
  jobCardNumber: '', repairOrderNumber: '',
  vehicle: '', customerName: '',
  notes: '',
  currency: DEFAULT_CURRENCY,
};

function calcTotalByCurrency(items: EstimateLineItem[], coreCharge: number, mainCurrency = 'USD'): Record<string, number> {
  const map: Record<string, number> = {};
  for (const i of items) {
    const c = i.currency || mainCurrency;
    map[c] = (map[c] || 0) + i.unitCost * i.quantity;
  }
  map[mainCurrency] = (map[mainCurrency] || 0) + coreCharge;
  return map;
}

function calcTotal(items: EstimateLineItem[], coreCharge: number, mainCurrency = 'USD') {
  const map = calcTotalByCurrency(items, coreCharge, mainCurrency);
  // Use dominant currency (highest value) as main total if mainCurrency has no items
  const mainTotal = map[mainCurrency] ?? 0;
  if (mainTotal > coreCharge || Object.keys(map).length === 1) {
    return { totalCost: mainTotal };
  }
  // All items are in foreign currencies — pick the one with highest value as totalCost
  const dominant = Object.entries(map).sort(([, a], [, b]) => b - a)[0];
  return { totalCost: dominant ? dominant[1] : coreCharge };
}

function fmtMultiCurrency(lineItems: EstimateLineItem[], coreCharge: number, mainCurrency: string): string {
  const map = calcTotalByCurrency(lineItems, coreCharge, mainCurrency);
  const entries = Object.entries(map).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return fmt(0, mainCurrency);
  return entries.map(([c, v]) => fmt(v, c)).join(' + ');
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

  // The shop's default currency, from Settings. Held in state rather than read
  // inline so a new quote opens in the right currency without the user having
  // to change it — forgetting to was how lines ended up stored as USD under a
  // THB quote.
  const [shopCurrency, setShopCurrency] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    let cancelled = false;
    fetchShopSettings()
      .then(s => { if (!cancelled && s.defaultCurrency) setShopCurrency(s.defaultCurrency); })
      .catch(() => { /* keep DEFAULT_CURRENCY — a settings read failure must not block quoting */ });
    return () => { cancelled = true; };
  }, [shopId]);

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_ESTIMATE);
  /**
   * Rate from the deposit's currency to the currency the quote is actually
   * priced in. null = not available; undefined = still fetching. The three
   * states are distinct on purpose: showing a balance computed at a guessed
   * rate is worse than showing none.
   */
  const [depositFx, setDepositFx] = useState<number | null | undefined>(1);
  const [saving, setSaving]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget]   = useState<PartsEstimate | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);   // true = linked invoice not paid
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteLinkedInfo, setDeleteLinkedInfo] = useState<{ estNum: string; invoiceNum?: string; invoiceStatus?: string } | null>(null);

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorForm, setVendorForm]           = useState(EMPTY_VENDOR);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [savingVendor, setSavingVendor]       = useState(false);
  const [vendorTab, setVendorTab]             = useState<'list' | 'add'>('list');

  const [filterStatus, setFilterStatus] = useState('All');
  const [filterVendor, setFilterVendor] = useState('All');
  // Track IDs currently being converted to prevent double-submission
  const convertingIds = useRef<Set<string>>(new Set());
  const [search, setSearch]             = useState('');

  const [selected, setSelected]   = useState<PartsEstimate | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [images, setImages]             = useState<EntityImage[]>([]);
  const [imagesLoading, setImgLoading]  = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgLabel, setImgLabel]         = useState<'Photo' | 'Invoice'>('Photo');
  const [lightbox, setLightbox]         = useState<EntityImage | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState<string>('Photo');
  const [lightboxSaving, setLightboxSaving] = useState(false);
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
      fetchPartsEstimates(), fetchVendorsAll(), fetchCustomers(), fetchVehiclesAll(),
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

  // Fetch the rate whenever the deposit's currency or the quote's pricing
  // currency changes. Kept out of render because it is async: the balance
  // shows "Converting…" until it resolves rather than a number computed at a
  // guessed rate.
  useEffect(() => {
    const byCur = calcTotalByCurrency(form.lineItems, form.coreCharge, form.currency);
    const priced = Object.entries(byCur).filter(([, v]) => v > 0);
    const quoteCur = priced.length ? priced.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : form.currency;
    const from = form.depositCurrency || quoteCur;

    if (from === quoteCur) { setDepositFx(1); return; }

    let cancelled = false;
    setDepositFx(undefined);
    getExchangeRate(from, quoteCur).then(rate => {
      if (!cancelled) setDepositFx(rate);
    });
    return () => { cancelled = true; };
  }, [form.depositCurrency, form.lineItems, form.coreCharge, form.currency]);

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

  // A new quote opens in the shop's currency, and its first line with it — the
  // two can never disagree at creation.
  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY_ESTIMATE, currency: shopCurrency, lineItems: [emptyLine(shopCurrency)] });
    setShowForm(true);
  }

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
      deposit: e.deposit ?? 0,
      depositCurrency: e.depositCurrency || e.currency || DEFAULT_CURRENCY,
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
      // Clamped on save as well as in the input: the quoted total can change
      // after a deposit is typed, and a deposit above the total would produce
      // a negative balance on the order it converts into.
      deposit: Math.max(form.deposit || 0, 0),
      depositCurrency: form.depositCurrency || form.currency,
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

  async function openDeleteModal(e: PartsEstimate) {
    setDeleteTarget(e);
    setDeleteBlocked(false);
    setDeleteLinkedInfo(null);

    const estNum = extractLinkedEstimate(e.notes);
    if (e.status === 'Converted' && estNum) {
      setDeleteChecking(true);
      try {
        const invoices = await fetchInvoices();
        // Find invoice linked to this customer/vehicle that is not Paid
        const linked = invoices.find(inv =>
          inv.customerName === e.customerName &&
          (inv.vehicle === e.vehicle || !e.vehicle)
        );
        const isPaid = linked?.status === 'Paid';
        setDeleteLinkedInfo({ estNum, invoiceNum: linked?.invoiceNumber, invoiceStatus: linked?.status });
        setDeleteBlocked(!!linked && !isPaid);
      } catch {
        // Can't verify — allow with warning
        setDeleteLinkedInfo({ estNum });
      } finally {
        setDeleteChecking(false);
      }
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, partName } = deleteTarget;
    setDeleteTarget(null);
    setDeleteLinkedInfo(null);
    try {
      await deletePartsEstimate(id);
      setEstimates(prev => prev.filter(e => e.id !== id));
      setSelected(null);
      notify(`"${partName || 'Quotation'}" removed.`);
    } catch { notify('Delete failed.'); }
  }

  async function handleConvertToOrder(e: PartsEstimate) {
    if (!confirm(`Convert "${e.partName || 'this quotation'}" to a Parts Order?`)) return;

    // The order records one deposit figure in its own currency, so a deposit
    // taken in another has to be converted now. If today's rate cannot be
    // fetched, stop rather than guess: carrying 600,000 LAK across as 600,000
    // THB would understate the balance by roughly 25x, and the order is what
    // the customer is eventually billed from.
    const depositCur = e.depositCurrency || e.currency;
    const rawDeposit = e.deposit ?? 0;
    let depositForOrder = rawDeposit;
    if (rawDeposit > 0 && depositCur !== e.currency) {
      const converted = await convertAmount(rawDeposit, depositCur, e.currency);
      if (converted === null) {
        alert(
          `Could not fetch today's ${depositCur}→${e.currency} rate, so the ` +
          `${fmt(rawDeposit, depositCur)} deposit cannot be converted. ` +
          `The order was not created — try again when back online.`,
        );
        return;
      }
      depositForOrder = converted;
    }

    try {
      await createPartsOrder({
        lineItems: e.lineItems?.length ? e.lineItems : [{ partName: e.partName, partNumber: e.partNumber, condition: e.condition, quantity: e.quantity, unitCost: e.unitCost }],
        partName: e.partName, partNumber: e.partNumber, condition: e.condition,
        quantity: e.quantity, unitCost: e.unitCost,
        vendorName: e.vendorName, vendorPhone: e.vendorPhone, vendorEmail: e.vendorEmail,
        coreCharge: e.coreCharge, totalCost: e.totalCost,
        // Carry the deposit across. Hardcoding 0 here meant a customer who
        // had already paid up front on the quote was invoiced for the full
        // amount once it became an order.
        depositPaid: depositForOrder,
        balanceDue: Math.max(0, e.totalCost + e.coreCharge - depositForOrder),
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

  async function handleConvertToEstimate(e: PartsEstimate) {
    // Guard: already converted (status check)
    if (e.status === 'Converted') {
      notify('This quotation has already been converted to an estimate.');
      return;
    }
    // Guard: in-flight duplicate prevention
    if (convertingIds.current.has(e.id)) return;

    const items = e.lineItems?.length
      ? e.lineItems
      : [{ partName: e.partName, partNumber: e.partNumber, condition: e.condition, quantity: e.quantity, unitCost: e.unitCost, vendorName: e.vendorName, currency: e.currency || 'USD' }];

    // Derive main currency from actual item currencies (not e.currency which defaults to USD)
    const currencies = [...new Set(items.map(i => i.currency || e.currency || 'USD'))];
    // If all items share the same currency, use that; otherwise fall back to e.currency
    const mainCur = currencies.length === 1 ? currencies[0] : (e.currency || 'USD');
    const hasMixed = currencies.length > 1;
    const mixedWarning = hasMixed
      ? `\n\n⚠ Mixed currencies detected: ${currencies.join(', ')}.\nForeign-currency items will be converted to ${mainCur} cost using live exchange rates.`
      : '';

    if (!confirm(`Convert "${e.partName || 'this quotation'}" to a Customer Estimate?${mixedWarning}\n\nThe Parts Quotation will be kept with status "Converted" so you can still view the original costs.`)) return;

    // Lock this record for the duration of the conversion
    convertingIds.current.add(e.id);

    // Close edit modal immediately after confirm so navigation feels clean
    setShowForm(false);
    setEditingId(null);

    try {
      const estNum = await nextEstimateNumber();

      // Cost in the estimate is always in mainCur (e.g. THB).
      // For foreign-currency items, fetch FX to convert supplier cost → mainCur,
      // then set the line's billing currency so the customer sees the rate in their currency.
      async function fxRate(from: string, to: string): Promise<number> {
        if (!from || !to || from === to) return 1;
        try {
          const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`);
          const data = await res.json();
          return (data[from.toLowerCase()] ?? {})[to.toLowerCase()] ?? 1;
        } catch { return 1; }
      }

      async function translateToLao(text: string): Promise<string> {
        if (!text.trim()) return '';
        try {
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|lo`);
          const data = await res.json();
          return data.responseData?.translatedText || '';
        } catch { return ''; }
      }

      const lines = await Promise.all(items.map(async item => {
        const itemCur = item.currency || mainCur;
        const isForeign = itemCur !== mainCur;
        const fx_to_main = isForeign ? await fxRate(itemCur, mainCur) : 1;
        const cost = +((item.unitCost ?? 0) * fx_to_main).toFixed(2);
        const markup = 0;
        const fx_to_billing = isForeign ? await fxRate(mainCur, itemCur) : 1;
        const rate = +(cost * fx_to_billing).toFixed(2);
        const description = item.partName || '';
        const laoDescription = await translateToLao(description);
        return {
          note: item.partNumber || '',
          description,
          ...(laoDescription ? { laoDescription } : {}),
          qty: item.quantity ?? 1,
          rate,
          cost,
          markup,
          ...(isForeign ? { currency: itemCur } : {}),
        };
      }));
      await createEstimate({
        estimateNumber: estNum,
        customerName: e.customerName || '',
        customerId: '',
        vehicle: e.vehicle || '',
        jobCardId: e.jobCardNumber || '',
        status: 'Draft',
        lines,
        discount: 0,
        shopSupplies: 0,
        taxRate: 0,
        notes: e.notes ? `From Parts Quotation. ${e.notes}` : 'Converted from Parts Quotation.',
        validUntil: e.validUntil || '',
        approvedDate: null,
        currency: mainCur,
      });

      // Mark quotation as Converted (keep it for reference) and link to the new estimate
      const linkedNote = `[Estimate: ${estNum}]${e.notes ? ' ' + e.notes : ''}`;
      const updated = await updatePartsEstimate(e.id, { status: 'Converted', notes: linkedNote });
      setEstimates(prev => prev.map(x => x.id === e.id ? updated : x));
      setSelected(null);

      notify(`✓ Estimate ${estNum} created — quotation marked Converted`);
      setTimeout(() => { dispatch({ type: 'SET_MODULE', module: 'estimates' }); }, 800);
    } catch (err: unknown) {
      notify('Failed to convert — ' + ((err as { message?: string })?.message ?? 'unknown error'));
    } finally {
      convertingIds.current.delete(e.id);
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
    const map = calcTotalByCurrency(e.lineItems || [], e.coreCharge || 0, e.currency || 'USD');
    for (const [cur, val] of Object.entries(map)) {
      acc[cur] = (acc[cur] || 0) + val;
    }
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
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, background: 'linear-gradient(135deg, #7a1414 0%, #1a0505 100%)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => { setDeleteTarget(null); setDeleteLinkedInfo(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: '#ef4444' }}>
              {deleteBlocked ? '🔒 Cannot Delete — Invoice Active' : '⚠ Confirm Deletion'}
            </div>

            {deleteChecking ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0' }}>Checking invoice status…</div>
            ) : deleteTarget.status === 'Converted' ? (
              deleteBlocked ? (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 16 }}>
                  <p style={{ margin: '0 0 10px' }}>
                    This quotation is linked to estimate <strong>{deleteLinkedInfo?.estNum}</strong> and
                    has an active invoice <strong>{deleteLinkedInfo?.invoiceNum || ''}</strong> with
                    status <strong style={{ color: '#f97316' }}>{deleteLinkedInfo?.invoiceStatus || 'unknown'}</strong>.
                  </p>
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 12 }}>
                    🔒 Deletion is blocked until the invoice is marked <strong>Paid</strong>. This protects your parts cost records while the job is still open.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 16 }}>
                  {deleteLinkedInfo?.invoiceStatus === 'Paid' ? (
                    <p style={{ margin: '0 0 10px' }}>
                      ✅ Invoice <strong>{deleteLinkedInfo?.invoiceNum}</strong> is <strong style={{ color: '#22c55e' }}>Paid</strong>.
                      You may now remove this parts quotation.
                    </p>
                  ) : (
                    <p style={{ margin: '0 0 10px' }}>
                      This quotation was converted to estimate <strong>{deleteLinkedInfo?.estNum}</strong>.
                      No active invoice was found for this customer/vehicle.
                    </p>
                  )}
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
                    ⚠ Deleting this will permanently remove the original parts cost record for <strong>{deleteTarget.partName || 'these parts'}</strong>.
                    This cannot be undone.
                  </div>
                </div>
              )
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px' }}>
                  Remove the parts quotation for <strong>{deleteTarget.partName || 'these parts'}</strong>
                  {deleteTarget.customerName ? <> ({deleteTarget.customerName})</> : ''}?
                </p>
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
                  ⚠ This cannot be undone.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setDeleteTarget(null); setDeleteLinkedInfo(null); }}
                style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid var(--line)', background: 'none', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              {!deleteBlocked && !deleteChecking && (
                <button onClick={confirmDelete}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444'; }}
                  style={{ padding: '9px 20px', borderRadius: 999, border: '2px solid #ef4444', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>
                  Yes, Delete
                </button>
              )}
              {deleteBlocked && (
                <button onClick={() => { setSelected(null); setDeleteTarget(null); dispatch({ type: 'SET_MODULE', module: 'invoices' }); }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f97316'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f97316'; }}
                  style={{ padding: '9px 20px', borderRadius: 999, border: '2px solid #f97316', background: 'transparent', color: '#f97316', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>
                  Go to Invoices →
                </button>
              )}
            </div>
          </div>
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
          className="card-hero"
          style={{ borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s', ...(filterStatus === 'Pending Customer' ? { border: '2px solid #ec4899', boxShadow: '0 0 0 3px rgba(236,72,153,0.2), 0 8px 28px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)' } : {}) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Pending Customer</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ec4899' }}>{totalPendingCustomer}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>awaiting customer response</div>
        </div>
        <div onClick={() => setFilterStatus('All')}
          className="card-hero"
          style={{ borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#3b82f6' }}>{totalPending}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>draft / quoted / pending</div>
        </div>
        <div onClick={() => setFilterStatus(filterStatus === 'Approved' ? 'All' : 'Approved')}
          className="card-hero"
          style={{ borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s', ...(filterStatus === 'Approved' ? { border: '2px solid #22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2), 0 8px 28px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)' } : {}) }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Approved</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#22c55e' }}>{totalApproved}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>customer confirmed</div>
        </div>
        <div className="card-hero" style={{ borderRadius: 12, padding: '16px 20px' }}>
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
                        <td style={{ fontWeight: 700, fontSize: 12 }}>
                          {fmtMultiCurrency(e.lineItems || [], e.coreCharge || 0, e.currency || 'USD')}
                          {(e.deposit ?? 0) > 0 && (() => {
                            // Under the total rather than in a new column: the
                            // table is already wide, and a deposit is only
                            // meaningful next to the figure it reduces.
                            const depCur = e.depositCurrency || e.currency || 'USD';
                            const sameCur = depCur === (e.currency || 'USD');
                            const balance = Math.max((e.totalCost || 0) - e.deposit, 0);
                            return (
                              <div style={{ fontWeight: 600, fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
                                <div style={{ color: '#22c55e' }}>
                                  Deposit {fmt(e.deposit, depCur)}
                                </div>
                                <div style={{ color: 'var(--muted)' }}>
                                  {/* Only when the deposit is in the quote's own
                                      currency. Converting per row would mean an
                                      FX request for every line of the table, and
                                      showing a balance computed at a guessed rate
                                      is worse than not showing one. */}
                                  {sameCur
                                    ? `Balance ${fmt(balance, e.currency || 'USD')}`
                                    : `Paid in ${depCur} — open to see the balance`}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
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
                            {e.status !== 'Converted' && <button className="mini-btn" onClick={() => openEdit(e)}>Edit</button>}
                            {e.status !== 'Converted' && <button className="mini-btn" style={{ color: '#7c3aed' }} onClick={() => handleConvertToOrder(e)}>→ Order</button>}
                            {e.status !== 'Converted' && (() => {
                              const busy = convertingIds.current.has(e.id);
                              return (
                                <button
                                  className="mini-btn"
                                  style={{ color: busy ? '#9ca3af' : '#0284c7', cursor: busy ? 'not-allowed' : 'pointer' }}
                                  disabled={busy}
                                  onClick={() => handleConvertToEstimate(e)}>
                                  {busy ? '⟳ Converting…' : '→ Estimate'}
                                </button>
                              );
                            })()}
                            {(() => {
                              const estNum = extractLinkedEstimate(e.notes);
                              return estNum ? (
                                <button className="mini-btn" style={{ color: '#9c27b0' }}
                                  onClick={() => { dispatch({ type: 'SET_MODULE', module: 'estimates' }); setTimeout(() => window.dispatchEvent(new CustomEvent('open-estimate', { detail: { estimateNumber: estNum } })), 80); }}>
                                  View {estNum} →
                                </button>
                              ) : null;
                            })()}
                            <button className="mini-btn" style={{ color: 'var(--red,#cc0000)' }} onClick={() => openDeleteModal(e)}>Remove</button>
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

      {/* ── Lightbox ── */}
      {lightbox && (() => {
        const photoImages = images.filter(i => !i.url.toLowerCase().includes('.pdf'));
        const lbIdx = photoImages.findIndex(i => i.id === lightbox.id);
        const hasPrev = lbIdx > 0;
        const hasNext = lbIdx < photoImages.length - 1;
        function goPrev() { if (hasPrev) { const img = photoImages[lbIdx - 1]; setLightbox(img); setLightboxLabel(img.label); } }
        function goNext() { if (hasNext) { const img = photoImages[lbIdx + 1]; setLightbox(img); setLightboxLabel(img.label); } }
        return (
          <div
            onClick={() => setLightbox(null)}
            onKeyDown={e => { if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); if (e.key === 'Escape') setLightbox(null); }}
            tabIndex={-1}
            ref={el => el?.focus()}
            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, outline: 'none' }}>
            {/* Close */}
            <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', zIndex: 1 }}>✕</button>
            {/* Counter */}
            {photoImages.length > 1 && (
              <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>
                {lbIdx + 1} / {photoImages.length}
              </div>
            )}
            {/* Prev arrow */}
            {hasPrev && (
              <button onClick={e => { e.stopPropagation(); goPrev(); }}
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 48, height: 48, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ‹
              </button>
            )}
            {/* Next arrow */}
            {hasNext && (
              <button onClick={e => { e.stopPropagation(); goNext(); }}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 48, height: 48, color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ›
              </button>
            )}
            {/* Image */}
            <StorageImage url={lightbox.url} alt={lightbox.label} onClick={ev => ev.stopPropagation()} style={{ maxWidth: '80vw', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 }} />
            {/* Thumbnail strip */}
            {photoImages.length > 1 && (
              <div onClick={ev => ev.stopPropagation()} style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '90vw', padding: '4px 0' }}>
                {photoImages.map((img, i) => (
                  <StorageImage key={img.id} url={img.url} alt={img.label}
                    onClick={() => { setLightbox(img); setLightboxLabel(img.label); }}
                    style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: i === lbIdx ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)', flexShrink: 0, opacity: i === lbIdx ? 1 : 0.6 }} />
                ))}
              </div>
            )}
            {/* Label editor */}
            <div onClick={ev => ev.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 16px' }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Label:</span>
              <select
                value={lightboxLabel}
                onChange={e => setLightboxLabel(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: '#222', color: '#fff', fontSize: 13 }}>
                <option value="Photo">📷 Photo</option>
                <option value="Invoice">🧾 Invoice</option>
              </select>
              <button
                disabled={lightboxSaving || lightboxLabel === lightbox.label}
                onClick={async () => {
                  setLightboxSaving(true);
                  try {
                    await updateEntityImageLabel(lightbox.id, lightboxLabel);
                    setImages(prev => prev.map(i => i.id === lightbox.id ? { ...i, label: lightboxLabel } : i));
                    setLightbox(prev => prev ? { ...prev, label: lightboxLabel } : prev);
                  } catch { /* non-fatal */ }
                  finally { setLightboxSaving(false); }
                }}
                style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: lightboxLabel === lightbox.label ? 'rgba(255,255,255,0.15)' : '#cc0000', color: '#fff', fontWeight: 600, fontSize: 13, cursor: lightboxLabel === lightbox.label ? 'default' : 'pointer' }}>
                {lightboxSaving ? 'Saving…' : 'Save Label'}
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Delete this image?')) return;
                  await handleDeleteImage(lightbox);
                  if (hasNext) { const img = photoImages[lbIdx + 1]; setLightbox(img); setLightboxLabel(img.label); }
                  else if (hasPrev) { const img = photoImages[lbIdx - 1]; setLightbox(img); setLightboxLabel(img.label); }
                  else setLightbox(null);
                }}
                style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(255,100,100,0.5)', background: 'rgba(200,0,0,0.3)', color: '#ff8888', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                🗑 Delete
              </button>
            </div>
          </div>
        );
      })()}

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
                <button onClick={() => openEdit(selected)} style={{ padding: '6px 16px', borderRadius: 999, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✏ Edit</button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>✕</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px', flex: 1 }}>
              {/* Converted/Ordered status banner */}
              {selected.status === 'Converted' && (() => {
                const estNum = extractLinkedEstimate(selected.notes);
                return (
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(156,39,176,0.07)', border: '1px solid rgba(156,39,176,0.3)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#9c27b0', letterSpacing: '0.04em', marginBottom: 4 }}>
                      📦 PARTS ORDERED — QUOTATION PRESERVED FOR REFERENCE
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                      This quotation was converted to a customer estimate{estNum ? <> (<strong>{estNum}</strong>)</> : ''}.
                      The original parts cost is kept here so you can track what was ordered and reconcile against the final invoice.
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>
                      ℹ Deletion is only allowed once the linked invoice has been marked <strong>Paid</strong>.
                    </div>
                  </div>
                );
              })()}
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
                <InfoBox label="Parts Total" value={fmtMultiCurrency(selected.lineItems || [], 0, selected.currency || 'USD')} />
                <InfoBox label="Core Charge" value={moneyE(selected.coreCharge, selected)} />
                <InfoBox label="Total Quoted" value={fmtMultiCurrency(selected.lineItems || [], selected.coreCharge || 0, selected.currency || 'USD')} color="var(--accent)" />
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
                        <StorageImage url={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} onClick={() => { setLightbox(img); setLightboxLabel(img.label); }} />
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
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
                          Open →
                        </button>
                      </div>
                    )}
                    {selected.repairOrderNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>🔧 Repair Order: <strong>{selected.repairOrderNumber}</strong></span>
                        <button onClick={() => navigateToLinkedRecord('repair-orders', 'open-ro', { roNumber: selected.repairOrderNumber })}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
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

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', background: 'var(--surface-soft)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status !== 'Converted' && (
                <>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openEdit(selected)}>✏ Edit Quotation</button>
                  <button onClick={() => handleConvertToOrder(selected)}
                    onMouseEnter={e => { e.currentTarget.style.background = '#8b5cf6'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7c3aed'; }}
                    style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #8b5cf6', background: 'transparent', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}>
                    ⇄ To Order
                  </button>
                  {(() => {
                    const busy = convertingIds.current.has(selected.id);
                    return (
                      <button
                        onClick={() => handleConvertToEstimate(selected)}
                        disabled={busy}
                        onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = '#0ea5e9'; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={e => { if (!busy) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0284c7'; } }}
                        style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #0ea5e9', background: busy ? 'rgba(156,163,175,0.1)' : 'transparent', color: busy ? '#9ca3af' : '#0284c7', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}>
                        {busy ? '⟳ Converting…' : '→ Estimate'}
                      </button>
                    );
                  })()}
                </>
              )}
              {selected.status === 'Converted' && (() => {
                const estNum = extractLinkedEstimate(selected.notes);
                return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Ordered banner */}
                    <div style={{ padding: '10px 14px', background: 'rgba(156,39,176,0.07)', border: '1px solid rgba(156,39,176,0.25)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#9c27b0', marginBottom: 2 }}>✓ Converted to Customer Estimate</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        This quotation has been ordered and converted. Parts cost is preserved here for reference.
                        {estNum && <> Linked to <strong>{estNum}</strong>.</>}
                      </div>
                    </div>
                    {estNum && (
                      <button onClick={() => { setSelected(null); dispatch({ type: 'SET_MODULE', module: 'estimates' }); setTimeout(() => window.dispatchEvent(new CustomEvent('open-estimate', { detail: { estimateNumber: estNum } })), 80); }}
                        style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #9c27b0', background: 'rgba(156,39,176,0.08)', color: '#9c27b0', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📋 View {estNum} in Estimates →
                      </button>
                    )}
                  </div>
                );
              })()}
              <button className="btn" style={{ color: '#ef4444' }} onClick={() => openDeleteModal(selected)}>Remove</button>
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
                            style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', border: dragOverIdx === idx ? '2px solid #cc0000' : '1px solid var(--line)', cursor: 'grab', background: 'var(--surface-soft)' }}
                            onClick={() => { if (!isPdf) { setLightbox(img); setLightboxLabel(img.label); } }}>
                            {isPdf ? (
                              <StorageLink url={img.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', textDecoration: 'none', color: 'var(--text)' }}>
                                <span style={{ fontSize: 32 }}>📄</span>
                                <span style={{ fontSize: 9, marginTop: 4, fontWeight: 600, textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>PDF</span>
                              </StorageLink>
                            ) : (
                              <StorageImage url={img.url} alt={img.label} draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
                            )}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '3px 4px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: img.label === 'Invoice' ? 'rgba(139,92,246,0.85)' : 'rgba(34,197,94,0.85)', color: '#fff' }}>
                                {img.label === 'Invoice' ? '🧾' : '📷'} {img.label}
                              </span>
                              <button type="button" onClick={e => { e.stopPropagation(); handleDeleteImage(img); }}
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
                <div style={{ display: 'flex', gap: 8 }}>
                  {editingId && (() => {
                    const est = estimates.find(e => e.id === editingId);
                    return est ? (
                      <>
                        <button type="button"
                          onClick={() => { setShowForm(false); setEditingId(null); handleConvertToOrder(est); }}
                          style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #8b5cf6', background: 'rgba(139,92,246,0.08)', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ⇄ Convert to Order
                        </button>
                        <button type="button"
                          onClick={() => handleConvertToEstimate(est)}
                          disabled={convertingIds.current.has(est.id) || est.status === 'Converted'}
                          style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #0ea5e9', background: convertingIds.current.has(est.id) ? 'rgba(156,163,175,0.1)' : 'rgba(14,165,233,0.08)', color: convertingIds.current.has(est.id) ? '#9ca3af' : '#0284c7', fontWeight: 700, fontSize: 13, cursor: convertingIds.current.has(est.id) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                          {convertingIds.current.has(est.id) ? '⟳ Converting…' : '→ Estimate'}
                        </button>
                      </>
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
                        <td style={tdStyle}><input type="number" min={1} value={item.quantity || 1} onFocus={e => e.target.select()} onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value) || 1)} style={{ ...cellInput, textAlign: 'center' }} /></td>
                        <td style={tdStyle}>
                          <select value={item.currency || form.currency} onChange={e => updateLineItem(idx, 'currency', e.target.value)} style={{ ...cellInput, paddingRight: 4, minWidth: 80, fontSize: 12 }}>
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        </td>
                        <td style={tdStyle}><input type="number" min={0} step="0.01" value={item.unitCost || ''} placeholder="0.00" onFocus={e => e.target.select()} onChange={e => updateLineItem(idx, 'unitCost', Number(e.target.value) || 0)} style={cellInput} /></td>
                        {/*
                          Shows the multiplication, not just the answer.

                          This column is at the far right of a horizontally
                          scrollable table, so QTY is often off-screen when the
                          total is visible. A quantity of 4 then makes a correct
                          ฿8,000 total look like a miscalculation of a ฿2,000
                          part — reported as a bug on 2026-08-03, when the
                          arithmetic was right and the quantity was simply not
                          on screen.
                        */}
                        <td style={{ ...tdStyle, fontWeight: 700, fontSize: 13, paddingLeft: 8, whiteSpace: 'nowrap', color: 'var(--accent)' }}>
                          {item.quantity > 1 && (
                            <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--muted)', marginRight: 6 }}>
                              {item.quantity} × {fmt(item.unitCost, item.currency || form.currency)} =
                            </span>
                          )}
                          {fmt(item.unitCost * item.quantity, item.currency || form.currency)}
                        </td>
                        <td style={tdStyle}>
                          {form.lineItems.length > 1 && <button type="button" onClick={() => removeLineItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, padding: '4px 6px', lineHeight: 1 }}>✕</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addLineItem} style={{ padding: '7px 16px', borderRadius: 999, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 24 }}>
                + Add Part
              </button>

              {/* Deposit — a customer paying up front on a parts quotation is
                  routine, and until now there was nowhere to record it. The
                  balance is what the shop actually collects on handover, so it
                  is shown next to the deposit rather than left to be worked
                  out on paper. Clamped to the quoted total: a deposit larger
                  than the quote is a data-entry slip, not a refund. */}
              <FormSection label="Deposit" />
              {(() => {
                // The currency the quote is actually priced in, which is not
                // always form.currency: a LAK quote whose only line is priced
                // in THB is quoted in THB. Labelling the total with
                // form.currency regardless is what produced "LAK 1,600" for a
                // THB 1,600 line, and clamped a 600,000 LAK deposit against
                // it.
                const byCur = calcTotalByCurrency(form.lineItems, form.coreCharge, form.currency);
                const priced = Object.entries(byCur).filter(([, v]) => v > 0);
                const [quoteCur, quoted] = priced.length
                  ? priced.reduce((a, b) => (b[1] > a[1] ? b : a))
                  : [form.currency, 0];

                const entered = Math.max(form.deposit || 0, 0);
                const sameCur = form.depositCurrency === quoteCur;
                // In the quote's currency. undefined while the rate loads,
                // null when it could not be fetched.
                const depositInQuoteCur = sameCur
                  ? entered
                  : depositFx == null ? depositFx : entered * depositFx;

                const applied = typeof depositInQuoteCur === 'number'
                  ? Math.min(depositInQuoteCur, quoted)
                  : null;
                const balance = applied === null ? null : Math.max(quoted - applied, 0);

                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                      {field('Deposit paid', (
                        <input
                          type="text" inputMode="decimal"
                          value={form.deposit === 0 || form.deposit === undefined ? '' : String(form.deposit)}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '');
                            setF({ deposit: raw === '' ? 0 : Math.max(0, parseFloat(raw) || 0) });
                          }}
                          onFocus={e => e.target.select()}
                          placeholder="0"
                          style={{ width: '100%' }}
                        />
                      ))}
                      {field('Paid in', (
                        <select
                          value={form.depositCurrency || quoteCur}
                          onChange={e => setF({ depositCurrency: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      ))}
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Quoted total</div>
                        <div style={{ fontWeight: 700 }}>{fmt(quoted, quoteCur)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Balance due</div>
                        <div style={{ fontWeight: 800, color: balance === 0 && entered > 0 ? '#22c55e' : 'var(--text)' }}>
                          {balance === null
                            ? (depositFx === undefined ? 'Converting…' : '—')
                            : fmt(balance, quoteCur)}
                        </div>
                      </div>
                    </div>

                    {!sameCur && entered > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        {depositFx === undefined && (
                          <span style={{ color: 'var(--muted)' }}>Converting at today’s rate…</span>
                        )}
                        {depositFx === null && (
                          // Never fall back to 1:1. Between LAK and THB that
                          // is a ~25x error on the customer's balance.
                          <span style={{ color: 'var(--danger)' }}>
                            Could not fetch today’s {form.depositCurrency}→{quoteCur} rate, so the balance
                            cannot be worked out. Enter the deposit in {quoteCur}, or try again when back online.
                          </span>
                        )}
                        {typeof depositFx === 'number' && typeof depositInQuoteCur === 'number' && (
                          <span style={{ color: 'var(--muted)' }}>
                            {fmt(entered, form.depositCurrency)} ≈ <strong>{fmt(depositInQuoteCur, quoteCur)}</strong>
                            {' '}at today’s rate ({depositFx.toFixed(6)} {quoteCur} per {form.depositCurrency})
                            {depositInQuoteCur > quoted && ' — more than the quoted total, so the balance is nil.'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Customer & Vehicle */}
              <FormSection label="Customer & Vehicle" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {field('Customer', (
                  <CustomerCombobox
                    customers={customers}
                    value={form.customerName}
                    onSelect={name => setF({ customerName: name, vehicle: '' })}
                    onCreate={c => setCustomers(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
                  />
                ))}
                {field('Vehicle', (
                  <select value={form.vehicle} onChange={e => setF({ vehicle: e.target.value })} style={selStyle}>
                    <option value="">— Select vehicle —</option>
                    {customerVehicles.map(v => <option key={v.id} value={vehicleOptionValue(v)}>{vehicleOptionLabel(v)}</option>)}
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
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--text)'; e.currentTarget.style.color = 'var(--surface)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)'; }}
                      style={{ padding: '8px 12px', borderRadius: 999, border: '1.5px solid var(--text)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}>+ Add</button>
                    <button type="button" onClick={() => { setVendorTab('list'); setShowVendorModal(true); }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--text)'; e.currentTarget.style.color = 'var(--surface)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)'; }}
                      style={{ padding: '8px 12px', borderRadius: 999, border: '1.5px solid var(--text)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s' }}>⚙ Manage</button>
                  </div>
                </div>
                {field('Vendor Phone', inp('tel',   form.vendorPhone, v => setF({ vendorPhone: v }), '555-000-0000'))}
                {field('Vendor Email', inp('email', form.vendorEmail, v => setF({ vendorEmail: v }), 'parts@vendor.com'))}
              </div>

              {/* Pricing */}
              <FormSection label="Pricing" />
              <div style={{ marginBottom: 10 }}>
                {field('Currency', (
                  /*
                   * Changing the quote's currency carries its lines with it.
                   *
                   * Without this, the common path still broke: open a quote (USD
                   * by default), switch to THB, type a price. The line kept USD
                   * while the cell displayed THB, because it renders
                   * `item.currency || form.currency`. A line whose currency was
                   * deliberately set to something else is left alone — only
                   * lines still on the quote's previous currency follow it.
                   */
                  <select value={form.currency} onChange={e => {
                    const next = e.target.value;
                    setForm(prev => ({
                      ...prev,
                      currency: next,
                      lineItems: prev.lineItems.map(li =>
                        (li.currency ?? prev.currency) === prev.currency ? { ...li, currency: next } : li),
                    }));
                  }} style={selStyle}>
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
                <CalcBox label="Total Quoted" value={fmtMultiCurrency(form.lineItems, form.coreCharge, form.currency || 'USD')} color="var(--accent)" />
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
                style={{ padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: vendorTab === 'list' ? 700 : 400, background: vendorTab === 'list' ? 'var(--accent)' : 'var(--surface-soft)', color: vendorTab === 'list' ? '#fff' : 'var(--text)', fontSize: 13 }}>
                All Vendors ({vendors.length})
              </button>
              <button onClick={() => { setVendorTab('add'); setEditingVendorId(null); setVendorForm(EMPTY_VENDOR); }}
                style={{ padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: vendorTab === 'add' ? 700 : 400, background: vendorTab === 'add' ? 'var(--accent)' : 'var(--surface-soft)', color: vendorTab === 'add' ? '#fff' : 'var(--text)', fontSize: 13 }}>
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
                            style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏ Edit</button>
                          <button onClick={() => handleDeleteVendor(v.id, v.name)}
                            style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid #fca5a5', background: '#fff0f0', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗑 Remove</button>
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
  return <div className="section-label">{label}</div>;
}
function FormSection({ label }: { label: string }) {
  return <SectionLabel label={label} />;
}

const EMPTY_NEW_CUSTOMER = { name: '', phone: '', email: '', type: 'Retail' };

function CustomerCombobox({
  customers, value, onSelect, onCreate,
}: {
  customers: Customer[];
  value: string;
  onSelect: (name: string) => void;
  onCreate: (customer: Customer) => void;
}) {
  const [query, setQuery]     = useState(value);
  const [open, setOpen]       = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState(EMPTY_NEW_CUSTOMER);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const filtered = query.trim().length === 0
    ? customers.slice(0, 8)
    : customers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.phone ?? '').includes(query)
      ).slice(0, 10);

  const exactMatch = customers.some(c => c.name.toLowerCase() === query.trim().toLowerCase());

  function openNewForm() {
    setShowNew(true);
    setOpen(false);
    setNewCustomer({ ...EMPTY_NEW_CUSTOMER, name: query.trim() });
    setSaveError(null);
  }

  async function handleSave() {
    if (!newCustomer.name.trim()) { setSaveError('Name is required.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const created = await saveCustomer({
        name:     newCustomer.name.trim(),
        type:     newCustomer.type,
        phone:    newCustomer.phone.trim(),
        email:    newCustomer.email.trim(),
        address:  '',
        tags:     [],
        followUp: '',
        portalToken: null,
      });
      onCreate(created);
      onSelect(created.name);
      setQuery(created.name);
      setShowNew(false);
      setNewCustomer(EMPTY_NEW_CUSTOMER);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          placeholder="Search or select customer…"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onSelect('');
          }}
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 32px 10px 12px', background: 'var(--surface-soft)', width: '100%', boxSizing: 'border-box' }}
        />
        {value && (
          <button
            type="button"
            title="Clear customer"
            onClick={() => { onSelect(''); setQuery(''); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}
          >
            ✕
          </button>
        )}
      </div>

      {value && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 12, background: 'rgba(0,180,0,0.1)', color: '#16a34a', border: '1px solid rgba(0,180,0,0.25)', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
            ✓ {value}
          </span>
        </div>
      )}

      {open && !value && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', marginTop: 4,
          maxHeight: 260, overflowY: 'auto',
        }}>
          {filtered.length === 0 && query.trim() === '' && (
            <div style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 13 }}>No customers yet.</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => { onSelect(c.name); setQuery(c.name); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
              {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>}
            </button>
          ))}
          {query.trim().length > 0 && !exactMatch && (
            <button
              type="button"
              onMouseDown={openNewForm}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 16 }}>+</span>
              Add &ldquo;{query.trim()}&rdquo; as new customer
            </button>
          )}
          {query.trim().length === 0 && (
            <button
              type="button"
              onMouseDown={openNewForm}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, fontSize: 13, borderTop: filtered.length > 0 ? '1px solid var(--line)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 16 }}>+</span>
              Add new customer
            </button>
          )}
        </div>
      )}

      {showNew && (
        <div style={{ marginTop: 8, padding: '14px 16px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>👤 New Customer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label>Name *</label>
              <input
                value={newCustomer.name}
                autoFocus
                placeholder="e.g. John Smith"
                onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label>Phone</label>
              <input value={newCustomer.phone} placeholder="555-0100" onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input type="email" value={newCustomer.email} placeholder="john@example.com" onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="login-field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select value={newCustomer.type} onChange={e => setNewCustomer(p => ({ ...p, type: e.target.value }))}>
                <option>Retail</option><option>Fleet</option><option>Dealer</option><option>Enterprise Fleet</option><option>Wholesale</option>
              </select>
            </div>
          </div>
          {saveError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>⚠ {saveError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !newCustomer.name.trim()}
              onMouseEnter={e => { if (!saving && newCustomer.name.trim()) { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; } }}
              onMouseLeave={e => { if (!saving && newCustomer.name.trim()) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent)'; } }}
              style={{
                padding: '7px 16px', borderRadius: 999, fontWeight: 700, fontSize: 13,
                border: (saving || !newCustomer.name.trim()) ? 'none' : '2px solid var(--accent)',
                background: (saving || !newCustomer.name.trim()) ? 'var(--surface-soft)' : 'transparent',
                color:      (saving || !newCustomer.name.trim()) ? 'var(--muted)' : 'var(--accent)',
                cursor:     (saving || !newCustomer.name.trim()) ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {saving ? 'Saving…' : '✓ Save & Select'}
            </button>
            <button
              type="button"
              onClick={() => { setShowNew(false); setNewCustomer(EMPTY_NEW_CUSTOMER); setSaveError(null); }}
              style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
