'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePagination } from '@/lib/usePagination';
import { Pagination } from '@/components/Pagination';
import { useShop } from '@/lib/useShop';
import {
  fetchParts, createPart, updatePart, deletePart,
  reservePart, uploadPartPhoto, deletePartPhoto,
  Part, PART_CATEGORIES,
} from '@/services/partsService';

/* ── helpers ── */
const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function stockStatus(p: Part): { label: string; color: string } {
  if (p.quantity === 0)                  return { label: 'Out of Stock', color: 'var(--red,#ef4444)' };
  if (p.quantity <= p.lowStockThreshold) return { label: 'Low Stock',    color: 'var(--amber,#f59e0b)' };
  return                                        { label: 'Available',    color: 'var(--green,#22c55e)' };
}

const EMPTY: Omit<Part, 'photos'> = {
  partNumber: '', brand: '', description: '', category: 'Brakes',
  cost: 0, retail: 0, quantity: 0, supplier: '', supplierPhone: '',
  supplierEmail: '', location: '', lowStockThreshold: 5, reorderQty: 10,
  compatibility: '', barcode: '', notes: '',
};

/* ── CSV / Excel column alias helpers ── */
const COL_ALIASES: Record<string, string> = {
  // part number
  part_number: 'part_number', partno: 'part_number', part_no: 'part_number',
  part: 'part_number', sku: 'part_number', item_number: 'part_number', item_no: 'part_number',
  itemnumber: 'part_number', stockno: 'part_number', stock_no: 'part_number',
  partnumber: 'part_number', product_code: 'part_number', productcode: 'part_number',
  // brand
  brand: 'brand', make: 'brand', manufacturer: 'brand', mfr: 'brand',
  // description
  description: 'description', desc: 'description', name: 'description', part_name: 'description',
  item_description: 'description', product_name: 'description',
  // category
  category: 'category', type: 'category', part_type: 'category',
  // cost / retail
  cost: 'cost', unit_cost: 'cost', purchase_price: 'cost', buy_price: 'cost',
  retail: 'retail', retail_price: 'retail', sale_price: 'retail', selling_price: 'retail', price: 'retail',
  // quantity
  quantity: 'quantity', qty: 'quantity', stock: 'quantity', on_hand: 'quantity',
  stock_quantity: 'quantity', current_stock: 'quantity', in_stock: 'quantity',
  // location
  location: 'location', bin: 'location', bin_location: 'location', shelf: 'location',
  // barcode
  barcode: 'barcode', upc: 'barcode', ean: 'barcode', isbn: 'barcode',
  // supplier
  supplier: 'supplier', vendor: 'supplier', vendor_name: 'supplier',
  supplier_phone: 'supplier_phone', vendor_phone: 'supplier_phone',
  supplier_email: 'supplier_email', vendor_email: 'supplier_email',
  // thresholds
  low_stock_threshold: 'low_stock_threshold', min_stock: 'low_stock_threshold', reorder_point: 'low_stock_threshold',
  reorder_qty: 'reorder_qty', reorder_quantity: 'reorder_qty', order_qty: 'reorder_qty',
  // misc
  compatibility: 'compatibility', compatible: 'compatibility', fits: 'compatibility',
  notes: 'notes', note: 'notes', comments: 'notes',
};

function normalizeColName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s\-\/\.#*]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function resolveColName(raw: string): string {
  const norm = normalizeColName(raw);
  return COL_ALIASES[norm] ?? norm;
}

const CSV_COLS = [
  'part_number','brand','description','category','cost','retail','quantity',
  'location','barcode','supplier','supplier_phone','supplier_email',
  'low_stock_threshold','reorder_qty','compatibility','notes',
] as const;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => resolveColName(h));
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else cur += ch;
  }
  result.push(cur);
  return result;
}

function rowToPart(r: Record<string, string>): Omit<Part, 'photos'> {
  return {
    partNumber:        r.part_number     || '',
    brand:             r.brand           || '',
    description:       r.description     || '',
    category:          PART_CATEGORIES.includes(r.category as typeof PART_CATEGORIES[number]) ? r.category : 'Other',
    cost:              parseFloat(r.cost)              || 0,
    retail:            parseFloat(r.retail)            || 0,
    quantity:          parseInt(r.quantity)            || 0,
    location:          r.location        || '',
    barcode:           r.barcode         || '',
    supplier:          r.supplier        || '',
    supplierPhone:     r.supplier_phone  || '',
    supplierEmail:     r.supplier_email  || '',
    lowStockThreshold: parseInt(r.low_stock_threshold) || 5,
    reorderQty:        parseInt(r.reorder_qty)         || 10,
    compatibility:     r.compatibility   || '',
    notes:             r.notes           || '',
  };
}

function downloadCSVTemplate() {
  const header = CSV_COLS.join(',');
  const sample = [
    'BRK-PAD-001,Bosch,Front Brake Pads Ceramic,Brakes,18.50,42.00,10,A-12,012345678901,NAPA Auto,(555)555-1234,orders@napa.com,3,6,Ford F-150 2018+,OEM cross-ref: 12345',
    'OIL-SYN-5W30,Mobil,Synthetic Motor Oil 5W-30,Fluids,6.99,14.99,24,B-4,987654321098,AutoZone,(555)555-9876,parts@autozone.com,5,12,,Store in cool dry area',
  ].join('\n');
  const blob = new Blob([header + '\n' + sample], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'parts-import-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

import { PartsOrdersView } from './PartsOrdersView';

type ActiveTab = 'inventory' | 'lowstock' | 'orders' | 'add';

// Supabase throws PostgrestError objects (not instanceof Error) — extract message from either
function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && 'message' in e && typeof (e as Record<string,unknown>).message === 'string') {
    const pg = e as { message: string; details?: string; hint?: string; code?: string };
    return [pg.message, pg.details, pg.hint].filter(Boolean).join(' — ');
  }
  return String(e);
}

/* ─────────────────────────────── */
export function PartsView() {
  const { role } = useShop();
  const isTech = role === 'technician';
  const [tab, setTab]         = useState<ActiveTab>('inventory');
  const [parts, setParts]     = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [toast, setToast]     = useState('');
  const [search, setSearch]   = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [selected, setSelected]   = useState<Part | null>(null);
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState<Omit<Part, 'photos'>>(EMPTY);
  const [costStr, setCostStr]     = useState('');
  const [retailStr, setRetailStr] = useState('');
  const [saving, setSaving]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [newQty, setNewQty]         = useState(0);

  /* photos to upload when adding a NEW part (before it exists in DB) */
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [pendingPhotoUrls, setPendingPhotoUrls] = useState<string[]>([]); /* object URLs for preview */

  /* bulk CSV import */
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [csvRows, setCsvRows]               = useState<Omit<Part,'photos'>[]>([]);
  const [csvError, setCsvError]             = useState('');
  const [csvImporting, setCsvImporting]     = useState(false);
  const [csvProgress, setCsvProgress]       = useState(0);
  const [csvDragOver, setCsvDragOver]       = useState(false);

  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<NodeJS.Timeout | null>(null);
  const photoFileRef  = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setParts(await fetchParts()); }
    catch (e: unknown) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Global barcode scanner listener */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 4) {
          const bc = barcodeBuffer.current;
          const match = parts.find(p => p.barcode === bc || p.partNumber === bc);
          if (match) { setSelected(match); setEditing(false); setTab('inventory'); notify(`Found: ${match.description}`); }
          else notify(`Barcode "${bc}" not found.`);
        }
        barcodeBuffer.current = '';
      } else if (e.key.length === 1) {
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeBuffer.current += e.key;
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [parts, notify]);

  /* derived */
  const lowStock    = parts.filter(p => p.quantity <= p.lowStockThreshold);
  const outOfStock  = parts.filter(p => p.quantity === 0);
  const totalQty    = parts.reduce((s, p) => s + p.quantity, 0);
  const totalValue  = parts.reduce((s, p) => s + p.cost * p.quantity, 0);
  const retailValue = parts.reduce((s, p) => s + p.retail * p.quantity, 0);
  const margin      = retailValue > 0 ? ((retailValue - totalValue) / retailValue * 100).toFixed(1) + '%' : '—';

  const filtered = parts.filter(p => {
    const matchCat    = filterCat === 'All' || p.category === filterCat;
    const q           = search.toLowerCase();
    const matchSearch = !q || [p.partNumber, p.brand, p.description, p.supplier, p.barcode, p.compatibility].some(v => v.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const partsPage = usePagination(filtered, { pageSize: 25 });

  /* ── form handlers ── */
  function startAdd() {
    setForm(EMPTY);
    setCostStr('');
    setRetailStr('');
    setLocationInput('');
    setPendingPhotos([]);
    setPendingPhotoUrls([]);
    setSelected(null);
    setEditing(true);
    setTab('add');
  }

  function startEdit(p: Part) {
    setForm({ ...p });
    setCostStr(p.cost > 0 ? String(p.cost) : '');
    setRetailStr(p.retail > 0 ? String(p.retail) : '');
    setLocationInput('');
    setPendingPhotos([]);
    setPendingPhotoUrls([]);
    setEditing(true);
    setTab('add');
  }

  /* add pending photos (for new-part form) */
  function addPendingPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const urls = arr.map(f => URL.createObjectURL(f));
    setPendingPhotos(prev => [...prev, ...arr]);
    setPendingPhotoUrls(prev => [...prev, ...urls]);
  }

  function removePendingPhoto(i: number) {
    URL.revokeObjectURL(pendingPhotoUrls[i]);
    setPendingPhotos(prev => prev.filter((_, idx) => idx !== i));
    setPendingPhotoUrls(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partNumber.trim())  { setError('Part number is required.'); return; }
    if (!form.description.trim()) { setError('Description is required.'); return; }
    setSaving(true); setError('');
    try {
      if (selected && editing) {
        await updatePart(selected.partNumber, form);
        notify(`${form.partNumber} updated.`);
      } else {
        /* create first, then upload any pending photos */
        await createPart({ ...form, photos: [] });
        if (pendingPhotos.length > 0) {
          const urls: string[] = [];
          for (const file of pendingPhotos) {
            const url = await uploadPartPhoto(form.partNumber, file);
            urls.push(url);
          }
          await updatePart(form.partNumber, { photos: urls });
        }
        notify(`${form.partNumber} added to inventory.`);
      }
      setPendingPhotos([]); setPendingPhotoUrls([]);
      await load();
      setEditing(false);
      setTab('inventory');
      setSelected(null);
    } catch (err: unknown) {
      setError('Save failed: ' + errMsg(err));
    } finally { setSaving(false); }
  }

  async function handleDelete(partNumber: string) {
    setSaving(true);
    try {
      await deletePart(partNumber);
      setSelected(null); setDeleteConfirm(''); setEditing(false); setTab('inventory');
      notify(`${partNumber} deleted.`);
      await load();
    } catch (err: unknown) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSaving(false); }
  }

  async function handleReserve(p: Part) {
    if (p.quantity <= 0) return;
    try {
      const newQ = await reservePart(p.partNumber, p.quantity);
      setParts(prev => prev.map(x => x.partNumber === p.partNumber ? { ...x, quantity: newQ } : x));
      if (selected?.partNumber === p.partNumber) setSelected(s => s ? { ...s, quantity: newQ } : s);
      notify(`${p.partNumber} reserved. ${newQ} remaining.`);
    } catch (err: unknown) { setError('Reserve failed: ' + errMsg(err)); }
  }

  async function handleUpdateQty(partNumber: string) {
    try {
      await updatePart(partNumber, { quantity: newQty });
      setParts(prev => prev.map(p => p.partNumber === partNumber ? { ...p, quantity: newQty } : p));
      if (selected?.partNumber === partNumber) setSelected(s => s ? { ...s, quantity: newQty } : s);
      setEditingQty(null);
      notify(`${partNumber} quantity updated to ${newQty}.`);
    } catch (err: unknown) { setError('Update failed: ' + errMsg(err)); }
  }

  /* photo upload (detail panel — existing part) */
  async function handlePhotoUpload(files: FileList | null) {
    if (!selected || !files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadPartPhoto(selected.partNumber, file);
        urls.push(url);
      }
      const newPhotos = [...(selected.photos ?? []), ...urls];
      await updatePart(selected.partNumber, { photos: newPhotos });
      setSelected(s => s ? { ...s, photos: newPhotos } : s);
      setParts(prev => prev.map(p => p.partNumber === selected.partNumber ? { ...p, photos: newPhotos } : p));
      notify(`${urls.length} photo${urls.length > 1 ? 's' : ''} uploaded.`);
    } catch (err: unknown) {
      setError('Upload failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setUploadingPhoto(false); }
  }

  async function handleDeletePhoto(url: string) {
    if (!selected) return;
    try {
      await deletePartPhoto(selected.partNumber, url, selected.photos);
      const newPhotos = selected.photos.filter(u => u !== url);
      setSelected(s => s ? { ...s, photos: newPhotos } : s);
      setParts(prev => prev.map(p => p.partNumber === selected!.partNumber ? { ...p, photos: newPhotos } : p));
      notify('Photo removed.');
    } catch (err: unknown) {
      setError('Delete photo failed: ' + (err instanceof Error ? err.message : ''));
    }
  }

  /* ── CSV / Excel bulk import ── */
  function handleCSVFile(files: FileList | null) {
    setCsvError(''); setCsvRows([]);
    if (!files || files.length === 0) return;
    const file = files[0];
    const isExcel = file.name.match(/\.(xlsx|xls)$/i);
    const isCSV   = file.name.match(/\.(csv|txt)$/i);
    if (!isExcel && !isCSV) { setCsvError('Please select a .csv, .xlsx, or .xls file.'); return; }

    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        let raw: Record<string, string>[];
        if (isExcel) {
          const buf = ev.target?.result;
          if (!(buf instanceof ArrayBuffer)) { setCsvError('Failed to read file.'); return; }
          const XLSX = await import('xlsx');
          const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellText: true, cellDates: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // Use header:1 to get raw array-of-arrays — avoids __EMPTY columns from merged/empty headers
          const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          // Scan first 20 rows to find the header row: the first row that contains
          // at least one recognized column name alias (not a title/subtitle row)
          const nonBlankRows = grid
            .slice(0, 20)
            .map((row, idx) => ({ idx, row: row as unknown[] }))
            .filter(({ row }) => row.some(c => String(c ?? '').trim() !== ''));
          const headerRowEntry = nonBlankRows.find(({ row }) => {
            const resolved = row.map(c => resolveColName(String(c ?? '')));
            return resolved.includes('part_number') || resolved.includes('description') ||
                   resolved.includes('sku') || resolved.includes('brand') ||
                   resolved.includes('quantity') || resolved.includes('cost');
          }) ?? nonBlankRows[0]; // fallback to first non-blank row
          if (!headerRowEntry) { setCsvError('No data found in the file.'); return; }
          const headers = headerRowEntry.row.map(h => resolveColName(String(h ?? '')));
          raw = (grid.slice(headerRowEntry.idx + 1) as unknown[][])
            .filter(row => row.some(c => String(c ?? '').trim() !== ''))
            .map(row =>
              Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '').trim()]))
            );
        } else {
          const text = ev.target?.result as string;
          raw = parseCSV(text);
        }
        if (raw.length === 0) { setCsvError('No data rows found. Check that the file has a header row and at least one data row.'); return; }
        const parts = raw.map(rowToPart).filter(r => r.partNumber.trim());
        if (parts.length === 0) {
          const found = raw.length > 0 ? Object.keys(raw[0]).join(', ') : 'none';
          setCsvError(`No valid rows found — every row must have a part_number column. Columns detected: ${found}`);
          return;
        }
        setCsvRows(parts);
      } catch {
        setCsvError('Failed to parse file. Make sure the file is a valid CSV or Excel spreadsheet.');
      }
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }

  async function handleBulkImport() {
    if (csvRows.length === 0) return;
    setCsvImporting(true); setCsvProgress(0); setCsvError('');
    let imported = 0, failed = 0;
    for (let i = 0; i < csvRows.length; i++) {
      try {
        await createPart({ ...csvRows[i], photos: [] });
        imported++;
      } catch { failed++; }
      setCsvProgress(Math.round(((i + 1) / csvRows.length) * 100));
    }
    setCsvImporting(false);
    await load();
    setShowBulkImport(false);
    setCsvRows([]);
    notify(`Bulk import done: ${imported} added${failed > 0 ? `, ${failed} failed (duplicates skipped)` : ''}.`);
  }

  /* ────────────── render ────────────── */
  return (
    <div style={{ padding: '20px 24px' }}>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1a1a2e', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red,#ef4444)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* ══════ BULK IMPORT MODAL ══════ */}
      {showBulkImport && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowBulkImport(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>📤 Bulk Import Parts — CSV / Excel</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Upload a .csv, .xlsx, or .xls file to add many parts at once</div>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }} onClick={() => { setShowBulkImport(false); setCsvRows([]); setCsvError(''); }}>✕</button>
            </div>

            <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>

              {/* Step 1 — download template */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>Step 1 — Download the template</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn" style={{ fontSize: 12 }} onClick={downloadCSVTemplate}>
                    ⬇ Download CSV Template
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Fill it in Excel or Google Sheets — upload as .xlsx, .xls, or save as .csv</span>
                </div>
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface,#f9f9f9)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                  <strong>Required column:</strong> <code>part_number</code> &nbsp;|&nbsp;
                  <strong>Optional:</strong> brand, description, category, cost, retail, quantity, location, barcode, supplier, supplier_phone, supplier_email, low_stock_threshold, reorder_qty, compatibility, notes<br />
                  <strong>Category values:</strong> {PART_CATEGORIES.join(', ')}
                </div>
              </div>

              {/* Step 2 — upload file */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>Step 2 — Upload your file (.csv, .xlsx, .xls)</div>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px', border: `2px dashed ${csvDragOver ? 'var(--red,#cc0000)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: csvDragOver ? 'rgba(204,0,0,0.05)' : 'var(--surface,#f9f9f9)', transition: 'border-color .15s, background .15s' }}
                  onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
                  onDragEnter={e => { e.preventDefault(); setCsvDragOver(true); }}
                  onDragLeave={() => setCsvDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setCsvDragOver(false);
                    // Try files first; fall back to items (needed when dragging from Chrome download bar)
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleCSVFile(e.dataTransfer.files);
                    } else if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                      const item = e.dataTransfer.items[0];
                      if (item.kind === 'file') {
                        const f = item.getAsFile();
                        if (f) {
                          const dt = new DataTransfer();
                          dt.items.add(f);
                          handleCSVFile(dt.files);
                        }
                      } else {
                        setCsvError('Cannot import from a browser link. Save the file to your computer first, then drag it here.');
                      }
                    } else {
                      setCsvError('No file detected. Save the file to your computer first, then drag it from File Explorer into this area.');
                    }
                  }}
                >
                  <span style={{ fontSize: 32 }}>📂</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Click to browse or drag & drop your file</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Accepts .csv, .xlsx, .xls files</div>
                  </div>
                  <input type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: 'none' }}
                    onChange={e => handleCSVFile(e.target.files)} />
                </label>
                {csvError && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,.1)', color: 'var(--red,#ef4444)', borderRadius: 7, fontSize: 12 }}>{csvError}</div>
                )}
              </div>

              {/* Step 3 — preview */}
              {csvRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 8 }}>
                    Step 3 — Review {csvRows.length} part{csvRows.length > 1 ? 's' : ''} to import
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', maxHeight: 280 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--table-head,var(--border))' }}>
                          {['#', 'Part #', 'Brand', 'Description', 'Category', 'Cost', 'Retail', 'Qty', 'Location'].map(h => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{i + 1}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>{r.partNumber || <span style={{ color: 'var(--red,#ef4444)' }}>MISSING</span>}</td>
                            <td style={{ padding: '6px 10px' }}>{r.brand || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{r.description || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>{r.category}</td>
                            <td style={{ padding: '6px 10px' }}>{money(r.cost)}</td>
                            <td style={{ padding: '6px 10px' }}>{money(r.retail)}</td>
                            <td style={{ padding: '6px 10px' }}>{r.quantity}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{r.location || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {csvImporting && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Importing… {csvProgress}%</div>
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${csvProgress}%`, height: '100%', background: 'var(--accent,#db2727)', borderRadius: 4, transition: 'width .2s' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button className="btn" onClick={() => { setShowBulkImport(false); setCsvRows([]); setCsvError(''); }}>Cancel</button>
              <button className="btn primary" disabled={csvRows.length === 0 || csvImporting} onClick={handleBulkImport}>
                {csvImporting ? `Importing ${csvProgress}%…` : `Import ${csvRows.length} Part${csvRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🔩 Parts Inventory</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Barcode lookup · Multi-photo · Low-stock alerts · Supplier tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Barcode input */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>📷</span>
            <input
              className="input"
              placeholder="Scan barcode or part #…"
              style={{ paddingLeft: 32, width: 220 }}
              onChange={e => {
                const v = e.target.value.trim();
                if (!v) return;
                const match = parts.find(p => p.barcode === v || p.partNumber === v);
                if (match) { setSelected(match); setEditing(false); setTab('inventory'); e.target.value = ''; notify(`Found: ${match.description}`); }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  const match = parts.find(p => p.barcode === v || p.partNumber === v);
                  if (match) { setSelected(match); setEditing(false); setTab('inventory'); (e.target as HTMLInputElement).value = ''; notify(`Found: ${match.description}`); }
                  else if (v) notify(`"${v}" not found in inventory.`);
                }
              }}
            />
          </div>
          <button className="btn" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => setShowBulkImport(true)}>
            📤 Bulk Import CSV
          </button>
          <button className="btn primary" onClick={startAdd}>+ Add Part</button>
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total SKUs',   value: String(parts.length),    sub: 'unique part numbers' },
          { label: 'Low Stock',    value: String(lowStock.length), sub: `${outOfStock.length} out of stock`, alert: lowStock.length > 0 },
          ...(!isTech ? [
            { label: 'Cost Value',   value: money(totalValue),  sub: totalQty > 0 ? `${totalQty} units × avg ${money(totalValue / totalQty)}` : '0 units in stock' },
            { label: 'Retail Value', value: money(retailValue), sub: totalQty > 0 ? `${totalQty} units × avg ${money(retailValue / totalQty)}` : '0 units in stock' },
            { label: 'Margin',       value: margin,             sub: 'avg gross margin' },
          ] : []),
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--card)', border: `1px solid ${c.alert ? 'var(--amber,#f59e0b)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px', color: c.alert ? 'var(--amber,#f59e0b)' : undefined }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {(['inventory', 'lowstock', 'orders', 'add'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'add') startAdd(); }}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}
          >
            {t === 'inventory' ? '📦 Inventory'
              : t === 'lowstock' ? `⚠️ Low Stock (${lowStock.length})`
              : t === 'orders' ? '🛒 Parts Orders'
              : '➕ Add / Edit'}
          </button>
        ))}
      </div>

      {/* ═══ INVENTORY TAB ═══ */}
      {tab === 'inventory' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>

          {/* Parts table */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search part #, brand, description, barcode…" style={{ flex: 1, minWidth: 200 }} />
              <select className="input" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 160 }}>
                <option value="All">All Categories</option>
                {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} of {parts.length}</span>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading inventory…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {parts.length === 0 ? 'No parts yet. Click "+ Add Part" or "Bulk Import CSV" to get started.' : 'No parts match your search.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-head,var(--border))' }}>
                      {['Part', 'Category', ...(!isTech ? ['Cost', 'Retail'] : []), 'On Hand', 'Location', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partsPage.pageItems.map(p => {
                      const st = stockStatus(p);
                      return (
                        <tr key={p.partNumber} onClick={() => { setSelected(p); setEditing(false); }}
                          style={{
                            borderBottom: '1px solid var(--border)', cursor: 'pointer',
                            background: selected?.partNumber === p.partNumber ? 'rgba(219,39,39,.07)' : 'transparent',
                            opacity: p.quantity === 0 ? 0.65 : 1,
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{p.partNumber}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.brand} — {p.description}</div>
                            {p.barcode && <div style={{ fontSize: 10, color: 'var(--muted)' }}>🔲 {p.barcode}</div>}
                            {p.photos.length > 0 && <div style={{ fontSize: 10, color: 'var(--blue,#3b82f6)' }}>📷 {p.photos.length} photo{p.photos.length > 1 ? 's' : ''}</div>}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{p.category}</td>
                          {!isTech && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(p.cost)}</td>}
                          {!isTech && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(p.retail)}</td>}
                          <td style={{ padding: '10px 12px' }}>
                            {editingQty === p.partNumber ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={ev => ev.stopPropagation()}>
                                <input type="number" value={newQty} onChange={e => setNewQty(Number(e.target.value))} min="0" style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
                                <button style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--green)', background: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: 12 }} onClick={() => handleUpdateQty(p.partNumber)}>✓</button>
                                <button style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12 }} onClick={() => setEditingQty(null)}>✕</button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline dotted' }} onClick={ev => { ev.stopPropagation(); setEditingQty(p.partNumber); setNewQty(p.quantity); }} title="Click to adjust quantity">
                                {p.quantity}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{p.location || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }} onClick={ev => ev.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} disabled={p.quantity <= 0} onClick={() => handleReserve(p)}>Reserve</button>
                              <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEdit(p)}>Edit</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination
                  page={partsPage.page} totalPages={partsPage.totalPages} totalItems={partsPage.totalItems}
                  startIndex={partsPage.startIndex} endIndex={partsPage.endIndex}
                  hasPrev={partsPage.hasPrev} hasNext={partsPage.hasNext}
                  onPrev={partsPage.prevPage} onNext={partsPage.nextPage}
                  onFirst={partsPage.goToFirst} onLast={partsPage.goToLast} onPage={partsPage.setPage}
                />
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.partNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.brand}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => startEdit(selected)}>✏️ Edit</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)' }} onClick={() => setSelected(null)}>✕</button>
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{selected.description}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{selected.category}</div>
                {selected.compatibility && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fits: {selected.compatibility}</div>}
                {selected.barcode && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>🔲 Barcode: <code style={{ fontSize: 11 }}>{selected.barcode}</code></div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                {([
                  ...(!isTech ? [
                    ['Cost',         money(selected.cost)],
                    ['Retail',       money(selected.retail)],
                    ['Margin',       selected.retail > 0 ? ((selected.retail - selected.cost) / selected.retail * 100).toFixed(1) + '%' : '—'],
                  ] as [string, string][] : []),
                  ['On Hand',      String(selected.quantity)],
                  ['Low Stock At', String(selected.lowStockThreshold)],
                  ['Reorder Qty',  String(selected.reorderQty)],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>

              {(selected.supplier || selected.supplierPhone || selected.supplierEmail) && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Supplier</div>
                  {selected.supplier && <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.supplier}</div>}
                  {selected.supplierPhone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📞 {selected.supplierPhone}</div>}
                  {selected.supplierEmail && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📧 {selected.supplierEmail}</div>}
                </div>
              )}

              {selected.location && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Bin Locations</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.location.split(',').map(l => l.trim()).filter(Boolean).map((loc, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        📍 {loc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.notes && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Notes</div>
                  <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                </div>
              )}

              {/* ── Photos (detail panel) ── */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Photos ({selected.photos.length})
                </div>

                {/* Photo grid */}
                {selected.photos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {selected.photos.map((url, i) => (
                      <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Part photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                        <button onClick={() => handleDeletePhoto(url)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red,#ef4444)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Hidden inputs */}
                  <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={uploadingPhoto}
                    onChange={e => handlePhotoUpload(e.target.files)} />
                  <input ref={photoFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={uploadingPhoto}
                    onChange={e => handlePhotoUpload(e.target.files)} />

                  <button className="btn" style={{ padding: '5px 12px', fontSize: 12, opacity: uploadingPhoto ? 0.6 : 1 }}
                    disabled={uploadingPhoto} onClick={() => cameraFileRef.current?.click()}>
                    📸 Camera
                  </button>
                  <button className="btn" style={{ padding: '5px 12px', fontSize: 12, opacity: uploadingPhoto ? 0.6 : 1 }}
                    disabled={uploadingPhoto} onClick={() => photoFileRef.current?.click()}>
                    {uploadingPhoto ? '⏳ Uploading…' : '🖼️ Browse'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>JPG · PNG · WEBP</span>
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn primary" style={{ fontSize: 12 }} disabled={selected.quantity <= 0} onClick={() => handleReserve(selected)}>
                  Reserve 1 Unit
                </button>
                {deleteConfirm !== selected.partNumber ? (
                  <button className="btn" style={{ fontSize: 12, color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)', marginLeft: 'auto' }} onClick={() => setDeleteConfirm(selected.partNumber)}>
                    Delete
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--red,#ef4444)', alignSelf: 'center', marginLeft: 'auto' }}>Confirm?</span>
                    <button className="btn" style={{ fontSize: 12, color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)' }} onClick={() => handleDelete(selected.partNumber)} disabled={saving}>Yes</button>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => setDeleteConfirm('')}>No</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ LOW STOCK TAB ═══ */}
      {tab === 'lowstock' && (
        <div>
          {lowStock.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--green,#22c55e)', fontSize: 16, fontWeight: 700 }}>
              ✅ All parts are adequately stocked!
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(245,158,11,.1)', border: '1px solid var(--amber,#f59e0b)', borderRadius: 10, display: 'flex', gap: 20, fontSize: 13 }}>
                <span>⚠️ <strong>{outOfStock.length}</strong> out of stock</span>
                <span>📉 <strong>{lowStock.length - outOfStock.length}</strong> below threshold</span>
                {!isTech && <span>💰 Reorder value: <strong>{money(lowStock.reduce((s, p) => s + p.cost * p.reorderQty, 0))}</strong></span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {lowStock.sort((a, b) => a.quantity - b.quantity).map(p => {
                  const st = stockStatus(p);
                  return (
                    <div key={p.partNumber} style={{ background: 'var(--card)', border: `1px solid ${p.quantity === 0 ? 'var(--red,#ef4444)' : 'var(--amber,#f59e0b)'}`, borderRadius: 10, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.partNumber}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.brand} — {p.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.category} · {p.location || 'No location'}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                          <span>On hand: <strong>{p.quantity}</strong></span>
                          <span>Threshold: {p.lowStockThreshold}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (p.quantity / Math.max(p.lowStockThreshold * 2, 1)) * 100)}%`, height: '100%', background: p.quantity === 0 ? 'var(--red,#ef4444)' : 'var(--amber,#f59e0b)', borderRadius: 3 }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
                          {p.supplier && <span>📦 {p.supplier}</span>}
                          {p.supplierPhone && <span style={{ marginLeft: 8 }}>📞 {p.supplierPhone}</span>}
                        </div>
                        {p.reorderQty > 0 && (
                          <button className="btn primary" style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => {
                              const msg = `Reorder ${p.reorderQty}x ${p.partNumber} (${p.description}) from ${p.supplier || 'supplier'}${p.supplierPhone ? ' · ' + p.supplierPhone : ''}`;
                              navigator.clipboard.writeText(msg).then(() => notify('Reorder note copied to clipboard!'));
                            }}>
                            📋 Copy Reorder Note
                          </button>
                        )}
                        <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setSelected(p); setEditing(false); setTab('inventory'); }}>
                          View
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ PARTS ORDERS TAB ═══ */}
      {tab === 'orders' && <PartsOrdersView />}

      {/* ═══ ADD / EDIT TAB ═══ */}
      {tab === 'add' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {selected && editing ? `Edit — ${selected.partNumber}` : 'Add New Part'}
            </h3>
            <button className="btn" onClick={() => { setEditing(false); setTab('inventory'); }}>Cancel</button>
          </div>

          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Part Number *</label>
                <input className="input" value={form.partNumber} onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))} placeholder="BRK-PAD-001" style={{ width: '100%' }} disabled={!!(selected && editing)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Brand</label>
                <input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Bosch" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Barcode / UPC</label>
                <input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type barcode" style={{ width: '100%' }} />
              </div>

              <div style={{ gridColumn: '1/3' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Description *</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Front brake pads, ceramic" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Category</label>
                <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%' }}>
                  {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {!isTech && <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cost ($)</label>
                <input
                  className="input" type="text" inputMode="decimal"
                  value={costStr}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
                    setCostStr(raw);
                    setForm(f => ({ ...f, cost: parseFloat(raw) || 0 }));
                  }}
                  onBlur={() => { const v = parseFloat(costStr); setCostStr(isNaN(v) ? '' : String(v)); }}
                  style={{ width: '100%' }}
                />
              </div>}
              {!isTech && <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Retail ($)</label>
                <input
                  className="input" type="text" inputMode="decimal"
                  value={retailStr}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
                    setRetailStr(raw);
                    setForm(f => ({ ...f, retail: parseFloat(raw) || 0 }));
                  }}
                  onBlur={() => { const v = parseFloat(retailStr); setRetailStr(isNaN(v) ? '' : String(v)); }}
                  style={{ width: '100%' }}
                />
              </div>}
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Bin Locations</label>
                {/* chips for existing locations */}
                {form.location && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {form.location.split(',').map(loc => loc.trim()).filter(Boolean).map((loc, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        📍 {loc}
                        <button type="button" onClick={() => {
                          const locs = form.location.split(',').map(l => l.trim()).filter((l, idx) => idx !== i && l);
                          setForm(f => ({ ...f, location: locs.join(', ') }));
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cc0000', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {/* add new location row */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" value={locationInput} onChange={e => setLocationInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const v = locationInput.trim();
                        if (!v) return;
                        const existing = form.location ? form.location.split(',').map(l => l.trim()).filter(Boolean) : [];
                        if (!existing.includes(v)) setForm(f => ({ ...f, location: [...existing, v].join(', ') }));
                        setLocationInput('');
                      }
                    }}
                    placeholder="e.g. Shelf A-3, Bay 2, Bin 7…" style={{ flex: 1 }} />
                  <button type="button" onClick={() => {
                    const v = locationInput.trim();
                    if (!v) return;
                    const existing = form.location ? form.location.split(',').map(l => l.trim()).filter(Boolean) : [];
                    if (!existing.includes(v)) setForm(f => ({ ...f, location: [...existing, v].join(', ') }));
                    setLocationInput('');
                  }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(204,0,0,0.4)', background: 'rgba(204,0,0,0.08)', color: '#cc0000', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    + Add Location
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Press Enter or click "+ Add Location" to add each location. Click × to remove.</div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Quantity On Hand</label>
                <input className="input" type="text" inputMode="numeric" value={form.quantity === 0 ? '' : form.quantity} onFocus={e => e.target.select()} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''); setForm(f => ({ ...f, quantity: parseInt(v) || 0 })); }} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Low Stock Alert At</label>
                <input className="input" type="text" inputMode="numeric" value={form.lowStockThreshold === 0 ? '' : form.lowStockThreshold} onFocus={e => e.target.select()} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''); setForm(f => ({ ...f, lowStockThreshold: parseInt(v) || 0 })); }} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Reorder Quantity</label>
                <input className="input" type="text" inputMode="numeric" value={form.reorderQty === 0 ? '' : form.reorderQty} onFocus={e => e.target.select()} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''); setForm(f => ({ ...f, reorderQty: parseInt(v) || 0 })); }} style={{ width: '100%' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Supplier Name</label>
                <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="AutoZone, NAPA…" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Supplier Phone</label>
                <input className="input" value={form.supplierPhone} onChange={e => setForm(f => ({ ...f, supplierPhone: e.target.value }))} placeholder="(555) 555-5555" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Supplier Email</label>
                <input className="input" type="email" value={form.supplierEmail} onChange={e => setForm(f => ({ ...f, supplierEmail: e.target.value }))} placeholder="orders@supplier.com" style={{ width: '100%' }} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Vehicle Compatibility</label>
                <input className="input" value={form.compatibility} onChange={e => setForm(f => ({ ...f, compatibility: e.target.value }))} placeholder="Ford F-150, Chevy Silverado 2019+" style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes, OEM cross-reference, storage tips…" style={{ width: '100%', resize: 'vertical' }} />
              </div>

              {/* ── Photo upload section (only for new parts; existing parts use detail panel) ── */}
              {!(selected && editing) && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Photos</label>

                  {/* Preview grid */}
                  {pendingPhotoUrls.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      {pendingPhotoUrls.map((url, i) => (
                        <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Preview ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                          <button type="button" onClick={() => removePendingPhoto(i)}
                            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red,#ef4444)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload buttons */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '14px 16px', border: '2px dashed var(--border)', borderRadius: 10, background: 'var(--surface,#f9f9f9)' }}>
                    <span style={{ fontSize: 20 }}>📷</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {pendingPhotos.length > 0 ? `${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''} selected` : 'Add part photos'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Photos will be uploaded when you save the part. JPG · PNG · WEBP</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <label style={{ cursor: 'pointer' }}>
                        <span className="btn" style={{ padding: '5px 12px', fontSize: 12 }}>📸 Camera</span>
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={e => addPendingPhotos(e.target.files)} />
                      </label>
                      <label style={{ cursor: 'pointer' }}>
                        <span className="btn" style={{ padding: '5px 12px', fontSize: 12 }}>🖼️ Browse</span>
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={e => addPendingPhotos(e.target.files)} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!isTech && form.cost > 0 && form.retail > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, fontSize: 12, color: 'var(--green,#22c55e)' }}>
                Margin preview: <strong>{((form.retail - form.cost) / form.retail * 100).toFixed(1)}%</strong> — Cost {money(form.cost)} · Retail {money(form.retail)} · Profit {money(form.retail - form.cost)} per unit
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving…' : selected && editing ? 'Save Changes' : 'Add to Inventory'}
              </button>
              <button type="button" className="btn" onClick={() => { setEditing(false); setTab('inventory'); }}>Cancel</button>
              {selected && editing && deleteConfirm !== selected.partNumber && (
                <button type="button" className="btn" style={{ marginLeft: 'auto', color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)' }} onClick={() => setDeleteConfirm(selected.partNumber)}>Delete Part</button>
              )}
              {selected && editing && deleteConfirm === selected.partNumber && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--red,#ef4444)', marginLeft: 'auto' }}>Confirm delete?</span>
                  <button type="button" className="btn" style={{ color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)' }} onClick={() => handleDelete(selected.partNumber)} disabled={saving}>Yes, Delete</button>
                  <button type="button" className="btn" onClick={() => setDeleteConfirm('')}>No</button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
