'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import {
  fetchInspections, createInspection, updateInspection, deleteInspection,
  nextInspectionNumber, uploadInspectionPhoto,
  INSPECTION_TEMPLATE, INSPECTION_STATUSES,
  type Inspection, type InspectionItem, type CustomerApproval,
} from '@/services/inspectionService';
import { fetchCustomerNames, fetchVehicles } from '@/services/vehicleService';
import type { Vehicle } from '@/lib/types';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { ShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { supabase } from '@/lib/supabase';
import { fetchTechnicians, createTechnician, TECH_ROLES } from '@/services/technicianService';

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50', Attention: '#ff9800', Fail: '#f44336', 'N/A': '#888',
};
const ITEM_STATUSES: InspectionItem['status'][] = ['N/A', 'Pass', 'Attention', 'Fail'];

function freshItem(template: Omit<InspectionItem, 'id'>): InspectionItem {
  return { ...template, id: Math.random().toString(36).slice(2) };
}

function InspectionStatBadge({ label, color, items }: { label: string; color: string; items: InspectionItem[] }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ textAlign: 'center', flex: 1, background: color + '11', border: `1px solid ${color}44`, borderRadius: 10, padding: '10px 8px', position: 'relative', cursor: items.length > 0 ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{items.length}</div>
      <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      {items.length > 0 && <div style={{ fontSize: 9, color, opacity: 0.7, marginTop: 2 }}>hover for details</div>}
      {hover && items.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, marginTop: 6, minWidth: 220, maxWidth: 300,
          background: 'var(--card)', border: `1px solid ${color}44`,
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: '8px 0', textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px 6px', borderBottom: `1px solid ${color}22` }}>
            {label} — {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {items.map(it => (
              <div key={it.id} style={{ padding: '6px 12px', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{it.name}</div>
                {it.category && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{it.category}</div>}
                {it.notes && <div style={{ fontSize: 11, color, marginTop: 2, fontStyle: 'italic' }}>{it.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InspectionSummaryCard({ label, color, numColor, items, onSelect }: {
  label: string; color: string; numColor: string;
  items: Inspection[]; onSelect: (ins: Inspection) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div className="card" style={{ padding: 16, position: 'relative', cursor: items.length > 0 ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: numColor }}>{items.length}</div>
      {items.length > 0 && <div style={{ fontSize: 9, color, opacity: 0.6, marginTop: 2 }}>hover for details</div>}
      {hover && items.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 300, marginTop: 6,
          minWidth: 260, maxWidth: 340, background: 'var(--card)',
          border: `1px solid ${numColor}44`, borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '8px 0', textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: numColor, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px 6px', borderBottom: `1px solid ${numColor}22` }}>
            {label} — {items.length}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {items.map(ins => (
              <div key={ins.id} onClick={() => onSelect(ins)}
                style={{ padding: '7px 12px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{ins.inspectionNumber} — {ins.customerName}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ins.vehicle}</div>
                {ins.status && <div style={{ fontSize: 10, color: numColor, fontWeight: 600 }}>{ins.status}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InspectionsView() {
  const dispatch = useAppDispatch();
  const { prefill } = useAppState();
  const { shopId } = useShop();
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
  const [techMembers, setTechMembers] = useState<{ email: string; role: string }[]>([]);
  const [dbTechs, setDbTechs] = useState<{ id: string; name: string; role: string }[]>([]);
  const [showAddTech, setShowAddTech] = useState(false);
  const [addTechForm, setAddTechForm] = useState({ name: '', role: 'Technician' });
  const [addTechSaving, setAddTechSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetItem, setPhotoTargetItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareError, setShareError] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);
  const [generatingShare, setGeneratingShare] = useState(false);

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
    fetchTechnicians().then(ts => setDbTechs(ts.map(t => ({ id: t.id, name: t.name, role: t.role })))).catch(() => {});
    if (shopId) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? '';
        fetch(`/api/members?shopId=${shopId}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(j => setTechMembers((j.members ?? []).filter((m: { role: string }) => m.role === 'technician' || m.role === 'advisor' || m.role === 'manager')))
          .catch(() => {});
      });
    }
  }, [shopId]);

  useEffect(() => {
    if (!prefill || (!prefill.jobCardId && !prefill.customerName)) return;
    nextInspectionNumber().then(num => {
      setForm({
        ...EMPTY_FORM,
        inspectionNumber: num,
        items: getActiveTemplate(),
        customerName: prefill.customerName ?? '',
        customerId: prefill.customerId ?? '',
        vehicle: prefill.vehicle ?? '',
        jobCardId: prefill.jobCardId ?? '',
      });
      setEditingId(null);
      setShowForm(true);
      setSelected(null);
      dispatch({ type: 'SET_PREFILL', prefill: null });
    });
  }, [prefill]);

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

  async function saveNewTech() {
    if (!addTechForm.name.trim()) return;
    setAddTechSaving(true);
    try {
      const t = await createTechnician({
        name: addTechForm.name.trim(), role: addTechForm.role,
        phone: '', email: '', specialty: '', certifications: '',
        payType: 'Hourly', payRate: 0, hireDate: null, status: 'Active', notes: '',
      });
      setDbTechs(prev => [...prev, { id: t.id, name: t.name, role: t.role }]);
      setForm(f => ({ ...f, technician: t.name }));
      setAddTechForm({ name: '', role: 'Technician' });
      setShowAddTech(false);
      notify(`Technician "${t.name}" added`);
    } catch { notify('Failed to add technician'); }
    finally { setAddTechSaving(false); }
  }

  function getActiveTemplate() {
    if (shopSettings?.inspectionTemplate && shopSettings.inspectionTemplate.length > 0) {
      return shopSettings.inspectionTemplate.map(t => freshItem({ ...t, status: 'N/A', notes: '', photoUrl: '' }));
    }
    return INSPECTION_TEMPLATE.map(freshItem);
  }

  async function openNew() {
    const num = await nextInspectionNumber();
    setForm({ ...EMPTY_FORM, inspectionNumber: num, items: getActiveTemplate() });
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
    const targetItemId = photoTargetItem;
    setUploadingItemId(targetItemId);
    try {
      const url = await uploadInspectionPhoto(editingId, targetItemId, file);
      const updatedItems = form.items.map(it => it.id === targetItemId ? { ...it, photoUrl: url } : it);
      setForm(f => ({ ...f, items: updatedItems }));
      await updateInspection(editingId, { items: updatedItems });
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
      setSelected(prev => prev?.id === ins.id ? (inspections.find(i => i.id !== ins.id) ?? null) : prev);
      notify('Deleted.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleGenerateShareLink(ins: Inspection) {
    setGeneratingShare(true);
    try {
      const res = await fetch('/api/inspection-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: ins.id, shopId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const url = `${window.location.origin}/inspection/${json.token}`;
      setShareUrl(url);
      navigator.clipboard.writeText(url).then(() => { setCopiedShare(true); setTimeout(() => setCopiedShare(false), 3000); });
    } catch (e: unknown) { setShareError(e instanceof Error ? e.message : 'Failed to generate link'); }
    finally { setGeneratingShare(false); }
  }

  async function handleSendEmail(ins: Inspection) {
    if (!ins.customerEmail) return notify('No customer email on file for this inspection.');
    setSendingEmail(true);
    try {
      const res = await fetch('/api/inspection-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: ins.id, shopId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      notify(`Report sent to ${json.sentTo}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to send email'); }
    finally { setSendingEmail(false); }
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
      {(() => {
        const statGroups = [
          { label: 'Total Inspections', color: 'var(--muted)', numColor: 'var(--text)', items: inspections },
          { label: 'In Progress',       color: '#2196f3',       numColor: '#2196f3',    items: inspections.filter(i => i.status === 'In Progress') },
          { label: 'Completed',         color: '#4caf50',       numColor: '#4caf50',    items: inspections.filter(i => i.status === 'Completed') },
          { label: 'Needs Approval',    color: '#f59e0b',       numColor: '#f59e0b',    items: inspections.filter(i => i.status === 'Needs Approval') },
        ];
        return (
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {statGroups.map(({ label, color, numColor, items }) => (
              <InspectionSummaryCard key={label} label={label} color={color} numColor={numColor} items={items} onSelect={ins => { setSelected(ins); setShowForm(false); }} />
            ))}
          </div>
        );
      })()}

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
                      <div style={{ fontWeight: 700, color: ins.status === 'Completed' || ins.status === 'Customer Approved' ? '#4caf50' : ins.status === 'Partially Approved' ? '#ff9800' : ins.status === 'Customer Declined' ? '#f44336' : '#2196f3' }}>{ins.status}</div>
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
                  {(() => {
                    const customerVehicles = allVehicles.filter(v => v.customerId === form.customerId);
                    const otherVehicles = allVehicles.filter(v => v.customerId !== form.customerId);
                    const showDropdown = allVehicles.length > 0;
                    return (
                      <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Vehicle
                          {form.customerId && customerVehicles.length === 0 && allVehicles.length > 0 && (
                            <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (no vehicles for this customer — select from all below)</span>
                          )}
                        </label>
                        {showDropdown ? (
                          <select value={form.vehicle} onChange={e => {
                            const v = allVehicles.find(v => v.label === e.target.value);
                            setForm(f => ({ ...f, vehicle: e.target.value, vin: v?.vin ?? f.vin }));
                          }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                            <option value="">— select vehicle —</option>
                            {customerVehicles.length > 0 && (
                              <optgroup label={`${form.customerName || 'Customer'} vehicles`}>
                                {customerVehicles.map(v => (
                                  <option key={v.id} value={v.label}>{v.label}{v.vin ? ` · ${v.vin}` : ''}</option>
                                ))}
                              </optgroup>
                            )}
                            {otherVehicles.length > 0 && (
                              <optgroup label="Other vehicles">
                                {otherVehicles.map(v => (
                                  <option key={v.id} value={v.label}>{v.label}{v.vin ? ` · ${v.vin}` : ''}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} required placeholder="e.g. 2020 Toyota Camry" style={{ width: '100%' }} />
                        )}
                      </div>
                    );
                  })()}
                  <div className="login-field">
                    <label>VIN</label>
                    <input value={form.vin}
                      onChange={e => setForm(f => ({ ...f, vin: e.target.value.toUpperCase() }))}
                      placeholder="Auto-filled from vehicle" style={{ textTransform: 'uppercase' }} />
                  </div>
                  <div className="login-field">
                    <label>Mileage</label>
                    <input type="text" inputMode="numeric" value={form.mileage === 0 ? '' : form.mileage}
                      placeholder="0"
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                        setForm(f => ({ ...f, mileage: parseInt(raw) || 0 }));
                      }} />
                  </div>
                  <div className="login-field">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Technician</span>
                      <button type="button" onClick={() => setShowAddTech(v => !v)}
                        style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                        {showAddTech ? '✕ Cancel' : '+ Add New'}
                      </button>
                    </label>
                    {(() => {
                      const memberOptions = techMembers.map(m => ({
                        value: m.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        label: `${m.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (${m.role})`,
                        group: 'Team Members',
                      }));
                      const dbOptions = dbTechs
                        .filter(t => !techMembers.some(m => m.email.toLowerCase().startsWith(t.name.toLowerCase().replace(/ /g, '.'))))
                        .map(t => ({ value: t.name, label: `${t.name} (${t.role})`, group: 'Technicians' }));
                      const allOptions = [...memberOptions, ...dbOptions];
                      return allOptions.length > 0 ? (
                        <select value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))}
                          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                          <option value="">— select technician —</option>
                          {memberOptions.length > 0 && (
                            <optgroup label="Team Members">
                              {memberOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </optgroup>
                          )}
                          {dbOptions.length > 0 && (
                            <optgroup label="Technicians">
                              {dbOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </optgroup>
                          )}
                        </select>
                      ) : (
                        <input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} placeholder="Technician name" />
                      );
                    })()}
                    {showAddTech && (
                      <div style={{ marginTop: 8, padding: 12, background: 'var(--surface-soft)', borderRadius: 8, border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>Add New Technician</div>
                        <input placeholder="Full name *" value={addTechForm.name}
                          onChange={e => setAddTechForm(f => ({ ...f, name: e.target.value }))}
                          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
                        <select value={addTechForm.role} onChange={e => setAddTechForm(f => ({ ...f, role: e.target.value }))}
                          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                          {TECH_ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                        <button type="button" onClick={saveNewTech} disabled={addTechSaving || !addTechForm.name.trim()}
                          style={{ padding: '7px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: addTechSaving || !addTechForm.name.trim() ? 0.6 : 1 }}>
                          {addTechSaving ? 'Saving…' : 'Save & Select'}
                        </button>
                      </div>
                    )}
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
                <button className="btn" disabled={sendingEmail || !selected.customerEmail}
                  style={{ background: 'rgba(33,150,243,0.1)', color: '#2196f3', border: '1px solid #2196f344', opacity: !selected.customerEmail ? 0.45 : 1 }}
                  onClick={() => handleSendEmail(selected)}
                  title={!selected.customerEmail ? 'No customer email on file' : `Send report to ${selected.customerEmail}`}>
                  {sendingEmail ? '…Sending' : '✉️ Email Report'}
                </button>
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
                <button className="btn" disabled={generatingShare}
                  style={{ background: 'rgba(156,39,176,0.1)', color: '#9c27b0', border: '1px solid #9c27b044' }}
                  onClick={() => { setShareUrl(''); setShareError(''); handleGenerateShareLink(selected); }}>
                  {generatingShare ? '…' : '🔗 Share Link'}
                </button>
                <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
              </div>

              {/* Share error modal */}
              {shareError && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                  onClick={() => setShareError('')}>
                  <div style={{ background: 'var(--card)', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', position: 'relative' }}
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => setShareError('')} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>⚠ Share Link Failed</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 16 }}>
                      {shareError}
                    </div>
                    {shareError.toLowerCase().includes('share_token') && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                        <strong>Fix:</strong> The <code>share_token</code> column is missing from your database. Run <strong>migration_dvi_features.sql</strong> in Supabase SQL Editor to add it.
                      </div>
                    )}
                    <button onClick={() => setShareError('')}
                      style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--line)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* Share link modal — renders at fixed center so it's always visible */}
              {shareUrl && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                  onClick={() => { setShareUrl(''); setGeneratingShare(false); }}>
                  <div style={{ background: 'var(--card)', borderRadius: 16, padding: 32, maxWidth: 520, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', position: 'relative' }}
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setShareUrl(''); setGeneratingShare(false); }} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9c27b0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🔗 Customer Share Link</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Share this link with the customer so they can view the inspection report and approve repairs.</div>
                    <div style={{ background: 'rgba(156,39,176,0.07)', border: '1px solid #9c27b044', borderRadius: 10, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: 'var(--text)', wordBreak: 'break-all', marginBottom: 16 }}>
                      {shareUrl}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareUrl); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 3000); }}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: copiedShare ? '#4caf50' : '#9c27b0', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>
                        {copiedShare ? '✓ Copied to clipboard!' : '📋 Copy Link'}
                      </button>
                      <button onClick={() => { setShareUrl(''); setGeneratingShare(false); }}
                        style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--line)', background: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}>
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Detail */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--accent)' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{selected.inspectionNumber}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{selected.customerName} · {selected.vehicle}</div>
                    {selected.vin && <div style={{ color: 'var(--muted)', fontSize: 12 }}>VIN: {selected.vin}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: selected.status === 'Completed' || selected.status === 'Customer Approved' ? '#4caf50' : selected.status === 'Partially Approved' ? '#ff9800' : selected.status === 'Customer Declined' ? '#f44336' : '#2196f3' }}>{selected.status}</span>
                    {selected.mileage > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.mileage.toLocaleString()} mi</div>}
                    {selected.technician && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tech: {selected.technician}</div>}
                  </div>
                </div>

                {/* Summary badges with hover dropdown */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Fail',      color: '#f44336', items: selected.items.filter(i => i.status === 'Fail') },
                    { label: 'Attention', color: '#ff9800', items: selected.items.filter(i => i.status === 'Attention') },
                    { label: 'Pass',      color: '#4caf50', items: selected.items.filter(i => i.status === 'Pass') },
                    { label: 'N/A',       color: '#888',    items: selected.items.filter(i => i.status === 'N/A') },
                  ].map(({ label, color, items: its }) => (
                    <InspectionStatBadge key={label} label={label} color={color} items={its} />
                  ))}
                </div>

                {/* Customer approval status */}
                {selected.customerApproval && (() => {
                  const a: CustomerApproval = selected.customerApproval;
                  const color = a.decision === 'approved' ? '#2e7d32' : a.decision === 'partial' ? '#e65100' : '#c62828';
                  const bg = a.decision === 'approved' ? 'rgba(46,125,50,0.08)' : a.decision === 'partial' ? 'rgba(230,81,0,0.08)' : 'rgba(198,40,40,0.08)';
                  const label = a.decision === 'approved' ? '✅ Customer Approved All Repairs' : a.decision === 'partial' ? '⚡ Customer Partially Approved' : '🚫 Customer Declined Repairs';
                  return (
                    <div style={{ background: bg, border: `1px solid ${color}44`, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, color, fontSize: 13, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Signed by <strong>{a.approvedBy}</strong> · {new Date(a.approvedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                      {a.approvedItems?.length > 0 && (
                        <div style={{ fontSize: 12, color: '#2e7d32', marginTop: 6 }}>
                          Approved: {a.approvedItems.map(id => selected.items.find(i => i.id === id)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                      {a.declinedItems?.length > 0 && (
                        <div style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
                          Declined: {a.declinedItems.map(id => selected.items.find(i => i.id === id)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                      {a.customerMessage && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '6px 10px' }}>
                          "{a.customerMessage}"
                        </div>
                      )}
                    </div>
                  );
                })()}

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
