'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchInspections, createInspection, updateInspection, deleteInspection,
  nextInspectionNumber, uploadInspectionPhoto,
  INSPECTION_TEMPLATE, INSPECTION_STATUSES,
  type Inspection, type InspectionItem,
} from '@/services/inspectionService';
import { fetchCustomerNames, fetchVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/lib/types';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { ShopSettings } from '@/services/shopSettingsService';

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50', Attention: '#ff9800', Fail: '#f44336', 'N/A': '#888',
};
const ITEM_STATUSES: InspectionItem['status'][] = ['N/A', 'Pass', 'Attention', 'Fail'];

function freshItem(template: Omit<InspectionItem, 'id'>): InspectionItem {
  return { ...template, id: Math.random().toString(36).slice(2) };
}

export function InspectionsView() {
  const dispatch = useAppDispatch();
  const { prefill } = useAppState();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Inspection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [allVehicles, setAllVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetItem, setPhotoTargetItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const EMPTY_FORM = {
    inspectionNumber: '',
    jobCardId: '',
    customerName: '',
    customerId: '',
    vehicle: '',
    vin: '',
    mileage: 0,
    technician: '',
    status: 'In Progress' as const,
    items: INSPECTION_TEMPLATE.map(freshItem),
    notes: '',
    customerEmail: '',
    customerPhone: '',
    completedAt: null as string | null,
  };
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    fetchCustomerNames().then(setCustomers).catch(() => {});
    fetchVehicles().then(setAllVehicles).catch(() => {});
    fetchShopSettings().then(setShopSettings).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchInspections();
      setInspections(data);
      if (data.length > 0) setSelected(data[0]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function openNew() {
    const num = await nextInspectionNumber();
    setForm({ ...EMPTY_FORM, inspectionNumber: num, items: INSPECTION_TEMPLATE.map(freshItem) });
    setEditingId(null);
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(ins: Inspection) {
    setForm({
      inspectionNumber: ins.inspectionNumber,
      jobCardId: ins.jobCardId,
      customerName: ins.customerName,
      customerId: ins.customerId,
      vehicle: ins.vehicle,
      vin: ins.vin,
      mileage: ins.mileage,
      technician: ins.technician,
      status: ins.status as 'In Progress',
      items: ins.items.length > 0 ? ins.items : INSPECTION_TEMPLATE.map(freshItem),
      notes: ins.notes,
      customerEmail: ins.customerEmail,
      customerPhone: ins.customerPhone,
      completedAt: ins.completedAt,
    });
    setEditingId(ins.id);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName || !form.vehicle) return setError('Customer and vehicle are required.');
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updateInspection(editingId, { ...form });
        const updated = { ...selected!, ...form, id: editingId, createdAt: selected?.createdAt ?? '' };
        setInspections(prev => prev.map(i => i.id === editingId ? updated : i));
        setSelected(updated);
        notify(`${form.inspectionNumber} updated.`);
      } else {
        const saved = await createInspection(form);
        setInspections(prev => [saved, ...prev]);
        setSelected(saved);
        notify(`${saved.inspectionNumber} created.`);
      }
      setShowForm(false); setEditingId(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setSaving(false); }
  }

  function setItemStatus(itemId: string, status: InspectionItem['status']) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === itemId ? { ...it, status } : it) }));
  }

  function setItemNote(itemId: string, notes: string) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === itemId ? { ...it, notes } : it) }));
  }

  async function handlePhotoUpload(file: File) {
    if (!editingId || !photoTargetItem) return;
    setUploadingItemId(photoTargetItem);
    try {
      const url = await uploadInspectionPhoto(editingId, photoTargetItem, file);
      setForm(f => ({ ...f, items: f.items.map(it => it.id === photoTargetItem ? { ...it, photoUrl: url } : it) }));
      await updateInspection(editingId, {
        items: form.items.map(it => it.id === photoTargetItem ? { ...it, photoUrl: url } : it),
      });
      notify('Photo uploaded.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setUploadingItemId(null); setPhotoTargetItem(null); }
  }

  async function handleComplete(ins: Inspection) {
    try {
      await updateInspection(ins.id, { status: 'Completed', completedAt: new Date().toISOString() });
      const updated = { ...ins, status: 'Completed', completedAt: new Date().toISOString() };
      setInspections(prev => prev.map(i => i.id === ins.id ? updated : i));
      setSelected(updated);
      notify(`${ins.inspectionNumber} marked complete.`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleDelete(ins: Inspection) {
    if (!confirm(`Delete ${ins.inspectionNumber}?`)) return;
    try {
      await deleteInspection(ins.id);
      setInspections(prev => prev.filter(i => i.id !== ins.id));
      setSelected(inspections.find(i => i.id !== ins.id) ?? null);
      notify('Deleted.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  const filtered = inspections.filter(i => {
    const ms = filterStatus === 'All' || i.status === filterStatus;
    const mq = !search || [i.inspectionNumber, i.customerName, i.vehicle].some(v => v.toLowerCase().includes(search.toLowerCase()));
    return ms && mq;
  });

  const categories = [...new Set(form.items.map(it => it.category))];
  const failCount = (items: InspectionItem[]) => items.filter(it => it.status === 'Fail').length;
  const attnCount = (items: InspectionItem[]) => items.filter(it => it.status === 'Attention').length;
  const passCount = (items: InspectionItem[]) => items.filter(it => it.status === 'Pass').length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); e.target.value = ''; }} />

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Inspections</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{inspections.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>In Progress</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2196f3' }}>{inspections.filter(i => i.status === 'In Progress').length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Completed</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{inspections.filter(i => i.status === 'Completed').length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Needs Approval</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{inspections.filter(i => i.status === 'Needs Approval').length}</div>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>{error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></p>}

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '1fr 1.4fr' : '340px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left: List */}
        <Panel title="Inspections (DVI)" hint="Digital vehicle inspections with Pass/Attention/Fail">
          {inspections.length > 0 && (
            <div onClick={() => { setSelected(inspections[0]); setShowForm(false); }}
              style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', marginBottom: 12, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>⚡ Most Recent</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{inspections[0].inspectionNumber} — {inspections[0].customerName}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inspections[0].vehicle}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="search" style={{ flex: 1, minWidth: 100 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
              <option value="All">All</option>
              {INSPECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary" onClick={openNew}>+ New DVI</button>
          </div>
          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(ins => {
              const fails = failCount(ins.items);
              const attns = attnCount(ins.items);
              return (
                <div key={ins.id} onClick={() => { setSelected(ins); setShowForm(false); }}
                  style={{ padding: '11px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${selected?.id === ins.id ? 'var(--accent)' : 'var(--line)'}`, background: selected?.id === ins.id ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{ins.inspectionNumber}</strong>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ins.customerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ins.vehicle}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: ins.status === 'Completed' ? '#4caf50' : '#2196f3' }}>{ins.status}</div>
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {fails > 0 && <span style={{ background: '#f4433622', color: '#f44336', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{fails}✗</span>}
                        {attns > 0 && <span style={{ background: '#ff980022', color: '#ff9800', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{attns}!</span>}
                        {passCount(ins.items) > 0 && <span style={{ background: '#4caf5022', color: '#4caf50', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{passCount(ins.items)}✓</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && filtered.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No inspections yet.</p>}
          </div>
        </Panel>

        {/* Right: Form or Detail */}
        <div>
          {showForm ? (
            <form onSubmit={handleSave}>
              <Panel title={editingId ? `✏️ Edit ${form.inspectionNumber}` : 'New Digital Vehicle Inspection'}>
                {/* Header fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div className="login-field">
                    <label>Inspection #</label>
                    <input value={form.inspectionNumber} onChange={e => setForm(f => ({ ...f, inspectionNumber: e.target.value }))} readOnly={!!editingId} style={editingId ? { opacity: 0.6 } : {}} />
                  </div>
                  <div className="login-field">
                    <label>Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'In Progress' }))}
                      style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      {INSPECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Customer</label>
                    <select value={form.customerId} onChange={e => {
                      const c = customers.find(c => c.id === e.target.value);
                      setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName, vehicle: '', vin: '' }));
                    }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="">— select —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Customer Name</label>
                    <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                  </div>
                  <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Vehicle {form.customerId && allVehicles.filter(v => v.customerId === form.customerId).length === 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(no registered vehicles — type manually below)</span>}</label>
                    {form.customerId && allVehicles.filter(v => v.customerId === form.customerId).length > 0 ? (
                      <select value={form.vehicle} onChange={e => {
                        const v = allVehicles.find(v => v.label === e.target.value && v.customerId === form.customerId);
                        setForm(f => ({ ...f, vehicle: e.target.value, vin: v?.vin ?? f.vin }));
                      }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                        <option value="">— select vehicle —</option>
                        {allVehicles.filter(v => v.customerId === form.customerId).map(v => (
                          <option key={v.id} value={v.label}>{v.label}{v.vin ? ` · ${v.vin}` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} required placeholder="e.g. 2020 Toyota Camry" style={{ width: '100%' }} />
                    )}
                  </div>
                  <div className="login-field">
                    <label>VIN</label>
                    <input value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} placeholder="Auto-filled from vehicle" />
                  </div>
                  <div className="login-field">
                    <label>Mileage</label>
                    <input type="number" value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: Number(e.target.value) }))} />
                  </div>
                  <div className="login-field">
                    <label>Technician</label>
                    <input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} />
                  </div>
                  <div className="login-field">
                    <label>Customer Email</label>
                    <input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
                  </div>
                  <div className="login-field">
                    <label>Customer Phone</label>
                    <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
                  </div>
                </div>

                {/* Checklist */}
                {categories.map(cat => (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--line)' }}>{cat}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {form.items.filter(it => it.category === cat).map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--surface-soft)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ flex: 1, fontSize: 13 }}>{item.name}</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {ITEM_STATUSES.map(s => (
                              <button key={s} type="button" onClick={() => setItemStatus(item.id, s)}
                                style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${item.status === s ? STATUS_COLOR[s] : 'var(--line)'}`, background: item.status === s ? STATUS_COLOR[s] + '22' : 'transparent', color: item.status === s ? STATUS_COLOR[s] : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                          {editingId && (
                            <button type="button" onClick={() => { setPhotoTargetItem(item.id); photoInputRef.current?.click(); }}
                              style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                              title="Add photo">
                              {uploadingItemId === item.id ? '…' : item.photoUrl ? '📷✓' : '📷'}
                            </button>
                          )}
                          {item.status !== 'Pass' && item.status !== 'N/A' && (
                            <input value={item.notes} onChange={e => setItemNote(item.id, e.target.value)}
                              placeholder="Notes…" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, width: 140 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="login-field" style={{ marginTop: 8 }}>
                  <label>Overall Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                  <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Inspection'}</button>
                </div>
              </Panel>
            </form>
          ) : selected ? (
            <div>
              {/* Action bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => openEdit(selected)}>✏️ Fill Out / Edit</button>
                <button className="btn" onClick={() => setShowPreview(true)}>👁 Customer Report</button>
                {selected.status !== 'Completed' && (
                  <button className="btn" style={{ background: 'rgba(76,175,80,0.1)', color: '#4caf50', border: '1px solid #4caf5044' }} onClick={() => handleComplete(selected)}>✓ Mark Complete</button>
                )}
                {selected.status === 'Completed' && (
                  <button className="btn" style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', fontWeight: 600 }}
                    onClick={() => {
                      dispatch({ type: 'SET_PREFILL', prefill: { customerName: selected.customerName, customerId: selected.customerId, inspectionId: selected.id } });
                      dispatch({ type: 'SET_MODULE', module: 'estimates' });
                    }}>
                    📋 Create Estimate →
                  </button>
                )}
                <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
              </div>

              {/* Detail */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--accent)' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{selected.inspectionNumber}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{selected.customerName} · {selected.vehicle}</div>
                    {selected.vin && <div style={{ color: 'var(--muted)', fontSize: 12 }}>VIN: {selected.vin}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: selected.status === 'Completed' ? '#4caf50' : '#2196f3' }}>{selected.status}</span>
                    {selected.mileage > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.mileage.toLocaleString()} mi</div>}
                    {selected.technician && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tech: {selected.technician}</div>}
                  </div>
                </div>

                {/* Summary badges */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Fail', count: failCount(selected.items), color: '#f44336' },
                    { label: 'Attention', count: attnCount(selected.items), color: '#ff9800' },
                    { label: 'Pass', count: passCount(selected.items), color: '#4caf50' },
                    { label: 'N/A', count: selected.items.filter(i => i.status === 'N/A').length, color: '#888' },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ textAlign: 'center', flex: 1, background: color + '11', border: `1px solid ${color}44`, borderRadius: 10, padding: '10px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
                      <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Items by category */}
                {[...new Set(selected.items.map(i => i.category))].map(cat => (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{cat}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {selected.items.filter(i => i.category === cat).map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'var(--surface-soft)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[item.status] }}>{item.status}</span>
                          {item.notes && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.notes}</span>}
                          {item.photoUrl && <a href={item.photoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📷</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {selected.notes && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)', marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{selected.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
              Select an inspection to view
            </div>
          )}
        </div>
      </div>

      {/* Customer Preview / Print Report */}
      {showPreview && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 700, padding: 44, position: 'relative' }}>
            <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 14, right: 14, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✕ Close</button>
            <button onClick={() => { setShowPreview(false); window.print(); }} style={{ position: 'absolute', top: 14, right: 92, background: '#cc0000', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🖨 Print</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 20, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                {shopSettings?.logoUrl && <img src={shopSettings.logoUrl} alt="Logo" style={{ height: 50, objectFit: 'contain' }} />}
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#cc0000' }}>{shopSettings?.companyName || 'Redlined1'}</div>
                  {shopSettings?.address && <div style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line' }}>{shopSettings.address}</div>}
                  {shopSettings?.phone && <div style={{ fontSize: 11, color: '#555' }}>📞 {shopSettings.phone}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Digital Vehicle Inspection</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{selected.inspectionNumber}</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
                  {selected.customerName} · {selected.vehicle}<br />
                  {selected.mileage > 0 && `${selected.mileage.toLocaleString()} mi · `}{new Date(selected.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'FAIL', count: failCount(selected.items), bg: '#fff5f5', border: '#fecaca', color: '#f44336' },
                { label: 'ATTENTION', count: attnCount(selected.items), bg: '#fffbeb', border: '#fde68a', color: '#ff9800' },
                { label: 'PASS', count: passCount(selected.items), bg: '#f0fdf4', border: '#bbf7d0', color: '#4caf50' },
              ].map(({ label, count, bg, border, color }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 8px' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color }}>{count}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Checklist by category */}
            {[...new Set(selected.items.map(i => i.category))].map(cat => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #eee' }}>{cat}</div>
                {selected.items.filter(i => i.category === cat).map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 8px', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: STATUS_COLOR[item.status], minWidth: 60, textAlign: 'right' }}>{item.status}</span>
                    {item.notes && <span style={{ fontSize: 11, color: '#888', maxWidth: 180 }}>{item.notes}</span>}
                    {item.photoUrl && <img src={item.photoUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />}
                  </div>
                ))}
              </div>
            ))}

            {selected.notes && <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8f8f8', borderRadius: 8 }}><strong style={{ fontSize: 12 }}>Notes: </strong><span style={{ fontSize: 12, color: '#555' }}>{selected.notes}</span></div>}

            <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 12 }}>
              {shopSettings?.companyName} {shopSettings?.phone ? `· ${shopSettings.phone}` : ''} {shopSettings?.email ? `· ${shopSettings.email}` : ''}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
