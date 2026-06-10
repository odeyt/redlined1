'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  fetchParts, createPart, updatePart, deletePart,
  reservePart, uploadPartPhoto, deletePartPhoto,
  Part, PART_CATEGORIES,
} from '@/services/partsService';

/* ── helpers ── */
const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function stockStatus(p: Part): { label: string; color: string } {
  if (p.quantity === 0)                       return { label: 'Out of Stock',  color: 'var(--red,#ef4444)' };
  if (p.quantity <= p.lowStockThreshold)      return { label: 'Low Stock',     color: 'var(--amber,#f59e0b)' };
  return                                             { label: 'Available',     color: 'var(--green,#22c55e)' };
}

const EMPTY: Omit<Part, 'photos'> = {
  partNumber: '', brand: '', description: '', category: 'Brakes',
  cost: 0, retail: 0, quantity: 0, supplier: '', supplierPhone: '',
  supplierEmail: '', location: '', lowStockThreshold: 5, reorderQty: 10,
  compatibility: '', barcode: '', notes: '',
};

type ActiveTab = 'inventory' | 'lowstock' | 'add';

/* ─────────────────────────────── */
export function PartsView() {
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
  const [saving, setSaving]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [newQty, setNewQty]         = useState(0);

  /* barcode scanner: collects rapid chars followed by Enter */
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<NodeJS.Timeout | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setParts(await fetchParts()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Global keyboard listener for USB/BT barcode scanner (types fast + Enter) */
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
  const totalValue  = parts.reduce((s, p) => s + p.cost * p.quantity, 0);
  const retailValue = parts.reduce((s, p) => s + p.retail * p.quantity, 0);

  const filtered = parts.filter(p => {
    const matchCat    = filterCat === 'All' || p.category === filterCat;
    const q           = search.toLowerCase();
    const matchSearch = !q || [p.partNumber, p.brand, p.description, p.supplier, p.barcode, p.compatibility].some(v => v.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  /* ── form handlers ── */
  function startAdd() {
    setForm(EMPTY);
    setSelected(null);
    setEditing(true);
    setTab('add');
  }

  function startEdit(p: Part) {
    setForm({ ...p });
    setEditing(true);
    setTab('add');
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
        await createPart({ ...form, photos: [] });
        notify(`${form.partNumber} added to inventory.`);
      }
      await load();
      setEditing(false);
      setTab('inventory');
      setSelected(null);
    } catch (err: unknown) {
      setError('Save failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSaving(false); }
  }

  async function handleDelete(partNumber: string) {
    setSaving(true);
    try {
      await deletePart(partNumber);
      setSelected(null);
      setDeleteConfirm('');
      setEditing(false);
      setTab('inventory');
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
    } catch (err: unknown) { setError('Reserve failed: ' + (err instanceof Error ? err.message : '')); }
  }

  async function handleUpdateQty(partNumber: string) {
    try {
      await updatePart(partNumber, { quantity: newQty });
      setParts(prev => prev.map(p => p.partNumber === partNumber ? { ...p, quantity: newQty } : p));
      if (selected?.partNumber === partNumber) setSelected(s => s ? { ...s, quantity: newQty } : s);
      setEditingQty(null);
      notify(`${partNumber} quantity updated to ${newQty}.`);
    } catch (err: unknown) { setError('Update failed: ' + (err instanceof Error ? err.message : '')); }
  }

  /* photo upload */
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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🔩 Parts Inventory</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Barcode lookup · Multi-photo · Low-stock alerts · Supplier tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Barcode search input */}
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
          <button className="btn primary" onClick={startAdd}>+ Add Part</button>
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total SKUs',      value: String(parts.length),       sub: 'unique part numbers' },
          { label: 'Low Stock',       value: String(lowStock.length),    sub: `${outOfStock.length} out of stock`, alert: lowStock.length > 0 },
          { label: 'Cost Value',      value: money(totalValue),          sub: 'at cost price' },
          { label: 'Retail Value',    value: money(retailValue),         sub: 'at retail price' },
          { label: 'Margin',          value: totalValue > 0 ? ((retailValue - totalValue) / retailValue * 100).toFixed(1) + '%' : '—', sub: 'avg gross margin' },
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
        {(['inventory', 'lowstock', 'add'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'add') startAdd(); }}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}
          >
            {t === 'inventory' ? '📦 Inventory' : t === 'lowstock' ? `⚠️ Low Stock (${lowStock.length})` : '➕ Add / Edit'}
          </button>
        ))}
      </div>

      {/* ═══ INVENTORY TAB ═══ */}
      {tab === 'inventory' && (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>

          {/* Parts table */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Search + filter */}
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
                {parts.length === 0 ? 'No parts yet. Click "+ Add Part" to get started.' : 'No parts match your search.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--table-head,var(--border))' }}>
                      {['Part', 'Category', 'Cost', 'Retail', 'On Hand', 'Location', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const st = stockStatus(p);
                      return (
                        <tr
                          key={p.partNumber}
                          onClick={() => { setSelected(p); setEditing(false); }}
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
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(p.cost)}</td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(p.retail)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {editingQty === p.partNumber ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                <input type="number" value={newQty} onChange={e => setNewQty(Number(e.target.value))} min="0" style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
                                <button style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--green)', background: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: 12 }} onClick={() => handleUpdateQty(p.partNumber)}>✓</button>
                                <button style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 12 }} onClick={() => setEditingQty(null)}>✕</button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline dotted' }} onClick={e => { e.stopPropagation(); setEditingQty(p.partNumber); setNewQty(p.quantity); }} title="Click to adjust quantity">
                                {p.quantity}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{p.location || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
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
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'start' }}>
              {/* Header */}
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

              {/* Pricing + stock */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                {([
                  ['Cost',   money(selected.cost)],
                  ['Retail', money(selected.retail)],
                  ['Margin', selected.retail > 0 ? ((selected.retail - selected.cost) / selected.retail * 100).toFixed(1) + '%' : '—'],
                  ['On Hand', String(selected.quantity)],
                  ['Low Stock At', String(selected.lowStockThreshold)],
                  ['Reorder Qty',  String(selected.reorderQty)],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Supplier */}
              {(selected.supplier || selected.supplierPhone || selected.supplierEmail) && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Supplier</div>
                  {selected.supplier && <div style={{ fontSize: 13, fontWeight: 600 }}>{selected.supplier}</div>}
                  {selected.supplierPhone && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📞 {selected.supplierPhone}</div>}
                  {selected.supplierEmail && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📧 {selected.supplierEmail}</div>}
                </div>
              )}

              {/* Location */}
              {selected.location && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Bin Location</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.location}</div>
                </div>
              )}

              {/* Notes */}
              {selected.notes && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Notes</div>
                  <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                </div>
              )}

              {/* Photos */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Photos ({selected.photos.length})
                </div>
                {selected.photos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {selected.photos.map((url, i) => (
                      <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Part photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                        <button
                          onClick={() => handleDeletePhoto(url)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red,#ef4444)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: uploadingPhoto ? 'wait' : 'pointer' }}>
                  <span className="btn" style={{ padding: '5px 12px', fontSize: 12, opacity: uploadingPhoto ? 0.6 : 1 }}>
                    {uploadingPhoto ? '⏳ Uploading…' : '📷 Upload Photos'}
                  </span>
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={uploadingPhoto}
                    onChange={e => handlePhotoUpload(e.target.files)} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>JPG, PNG, WEBP</span>
                </label>
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
                <span>💰 Reorder value: <strong>{money(lowStock.reduce((s, p) => s + p.cost * p.reorderQty, 0))}</strong></span>
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

                      {/* Stock meter */}
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

              {/* Row 1: Part # / Brand / Barcode */}
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

              {/* Row 2: Description / Category */}
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

              {/* Row 3: Cost / Retail / Location */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cost ($)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Retail ($)</label>
                <input className="input" type="number" step="0.01" min="0" value={form.retail} onChange={e => setForm(f => ({ ...f, retail: parseFloat(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Bin Location</label>
                <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="A-12, Shelf 3" style={{ width: '100%' }} />
              </div>

              {/* Row 4: Qty / Low Stock / Reorder Qty */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Quantity On Hand</label>
                <input className="input" type="number" min="0" step="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Low Stock Alert At</label>
                <input className="input" type="number" min="0" step="1" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Reorder Quantity</label>
                <input className="input" type="number" min="0" step="1" value={form.reorderQty} onChange={e => setForm(f => ({ ...f, reorderQty: parseInt(e.target.value) || 0 }))} style={{ width: '100%' }} />
              </div>

              {/* Row 5: Supplier */}
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

              {/* Row 6: Compatibility / Notes */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Vehicle Compatibility</label>
                <input className="input" value={form.compatibility} onChange={e => setForm(f => ({ ...f, compatibility: e.target.value }))} placeholder="Ford F-150, Chevy Silverado 2019+" style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes, OEM cross-reference, storage tips…" style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </div>

            {/* Margin preview */}
            {form.cost > 0 && form.retail > 0 && (
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
