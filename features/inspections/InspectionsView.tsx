'use client';

import { useEffect, useRef, useState } from 'react';
import { GuidedInspection } from './GuidedInspection';
import { CameraCapture } from '@/components/camera/CameraCapture';
import { useAppDispatch, useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { TechPills } from '@/components/TechPill';
import {
  fetchInspections, createInspection, updateInspection, deleteInspection,
  nextInspectionNumber, uploadInspectionPhoto,
  INSPECTION_TEMPLATE, INTAKE_OUTTAKE_ITEMS, INSPECTION_STATUSES,
  type Inspection, type InspectionItem, type CustomerApproval,
} from '@/services/inspectionService';
import { StorageImage } from '@/components/StorageImage';
import { fetchVehicles } from '@/services/vehicleService';
import { fetchCustomers } from '@/services/customerService';
import type { Vehicle, Customer } from '@/lib/types';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { ShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { revealNewRecord } from '@/lib/revealNewRecord';
import { vehicleOptionValue, vehicleOptionLabel } from '@/lib/vehicleOption';
import { supabase } from '@/lib/supabase';
import { fetchTechnicians, createTechnician, uniqueTechsByPerson, TECH_ROLES } from '@/services/technicianService';
import { FilterPills } from '@/components/FilterPills';
import { draftEstimateFromInspection } from '@/services/aiService';

const STATUS_COLOR: Record<string, string> = {
  Pass: '#4caf50', Attention: '#ff9800', Fail: '#f44336', 'N/A': '#888',
};

// Category color palette — each section gets a distinct accent
const CATEGORY_COLORS: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  'Brakes':                 { bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c', icon: '🛑' },
  'Tires':                  { bg: '#f1f5f9', border: '#94a3b8', color: '#334155', icon: '⭕' },
  'Fluids':                 { bg: '#dbeafe', border: '#93c5fd', color: '#1d4ed8', icon: '💧' },
  'Lights':                 { bg: '#fef9c3', border: '#fde047', color: '#92400e', icon: '💡' },
  'Under Hood':             { bg: '#f3e8ff', border: '#c084fc', color: '#7e22ce', icon: '🔧' },
  'Suspension':             { bg: '#ffedd5', border: '#fdba74', color: '#c2410c', icon: '🔩' },
  'Intake — Exterior':      { bg: '#dcfce7', border: '#86efac', color: '#166534', icon: '🚗' },
  'Intake — Interior':      { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46', icon: '🪑' },
  'Intake — Functional':    { bg: '#e0f2fe', border: '#7dd3fc', color: '#0369a1', icon: '⚙️' },
  'Outtake — QA Checklist': { bg: '#f0fdf4', border: '#4ade80', color: '#15803d', icon: '✅' },
};

function getCategoryStyle(cat: string) {
  // Exact match first, then prefix match for dynamic categories like "Fuel — Triage Checks"
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const prefix = Object.keys(CATEGORY_COLORS).find(k => cat.toLowerCase().startsWith(k.toLowerCase()));
  if (prefix) return CATEGORY_COLORS[prefix];
  // Dynamic triage categories (e.g. "Fuel — Triage Checks", "Engine — Triage Checks")
  if (cat.toLowerCase().includes('fuel'))        return { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', icon: '⛽' };
  if (cat.toLowerCase().includes('engine'))      return { bg: '#f3e8ff', border: '#c084fc', color: '#7e22ce', icon: '🔧' };
  if (cat.toLowerCase().includes('electrical'))  return { bg: '#fef9c3', border: '#fde047', color: '#92400e', icon: '⚡' };
  if (cat.toLowerCase().includes('transmission'))return { bg: '#ede9fe', border: '#a78bfa', color: '#5b21b6', icon: '⚙️' };
  if (cat.toLowerCase().includes('ac') || cat.toLowerCase().includes('heat')) return { bg: '#e0f2fe', border: '#7dd3fc', color: '#0369a1', icon: '❄️' };
  if (cat.toLowerCase().includes('exhaust'))     return { bg: '#f5f5f4', border: '#a8a29e', color: '#44403c', icon: '💨' };
  if (cat.toLowerCase().includes('steering'))    return { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', icon: '🎯' };
  if (cat.toLowerCase().includes('cooling'))     return { bg: '#cffafe', border: '#67e8f9', color: '#0e7490', icon: '🌡️' };
  // Default fallback
  return { bg: '#f8fafc', border: '#cbd5e1', color: '#475569', icon: '📋' };
}
const ITEM_STATUSES: InspectionItem['status'][] = ['N/A', 'Pass', 'Attention', 'Fail'];

function freshItem(template: Omit<InspectionItem, 'id'>): InspectionItem {
  return { ...template, id: Math.random().toString(36).slice(2) };
}

function InspectionStatBadge({ label, color, items, active, onClick }: {
  label: string; color: string; items: InspectionItem[];
  active?: boolean; onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const clickable = items.length > 0;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'center', flex: 1, position: 'relative',
        background: active ? color + '22' : color + '11',
        border: `${active ? 2 : 1}px solid ${active ? color : color + '44'}`,
        borderRadius: 10, padding: '10px 8px',
        cursor: clickable ? 'pointer' : 'default',
        transform: active ? 'translateY(-1px)' : 'none',
        boxShadow: active ? `0 4px 14px ${color}33` : 'none',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{items.length}</div>
      <div style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      {clickable && (
        <div style={{ fontSize: 9, color, opacity: 0.7, marginTop: 2 }}>
          {active ? '↑ click to clear' : 'click to jump'}
        </div>
      )}
      {hover && clickable && !active && (
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

function ReportStatCard({ label, statusKey, bg, border, color, items }: {
  label: string; statusKey: string; bg: string; border: string; color: string; items: InspectionItem[];
}) {
  const [hov, setHov] = useState(false);
  const its = items.filter(i => i.status === statusKey);
  return (
    <div style={{ flex: 1, textAlign: 'center', background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 8px', position: 'relative' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{its.length}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      {its.length > 0 && <div style={{ fontSize: 9, color, opacity: 0.6, marginTop: 2 }}>hover for details</div>}
      {hov && its.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 10, marginTop: 6, minWidth: 220, background: '#fff', border: `1px solid ${border}`, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', padding: '8px 0', textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', padding: '0 12px 6px', borderBottom: `1px solid ${border}` }}>{label} — {its.length} item{its.length !== 1 ? 's' : ''}</div>
          {its.map(it => (
            <div key={it.id} style={{ padding: '6px 12px', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{it.name}</div>
              {it.notes && <div style={{ fontSize: 11, color, marginTop: 2 }}>{it.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportItemRow({ item, onPhotoClick }: { item: InspectionItem; onPhotoClick: (url: string) => void }) {
  const [hov, setHov] = useState(false);
  const color = STATUS_COLOR[item.status] ?? '#888';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #f5f5f5', borderRadius: 6, background: hov ? '#fafafa' : 'transparent', transition: 'background 0.15s' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#111' }}>{item.name}</span>
      {item.notes && <span style={{ fontSize: 11, color: '#888', maxWidth: 180 }}>{item.notes}</span>}
      <div style={{ position: 'relative' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: color, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          {item.status}
        </span>
      </div>
      {item.photoUrl && (
        <StorageImage url={item.photoUrl} alt="photo" onClick={() => onPhotoClick(item.photoUrl)}
          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: `2px solid ${color}`, cursor: 'zoom-in', flexShrink: 0 }} />
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
    <div className="card card-hero" style={{ padding: 16, position: 'relative', cursor: items.length > 0 ? 'pointer' : 'default' }}
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
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
  // Which item the camera is open for. Separate from photoTargetItem so the
  // camera can be cancelled without leaving a target armed.
  const [cameraItemId, setCameraItemId] = useState<string | null>(null);
  // Kept so a failed upload can be retried without making the technician walk
  // back to the car and take the photo again.
  const [failedPhoto, setFailedPhoto] = useState<{ file: File; itemId: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareError, setShareError] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);
  const [generatingShare, setGeneratingShare] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<string>('');
  const [aiDraftMock, setAiDraftMock] = useState(false);
  const [aiDraftError, setAiDraftError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [activeItemFilter, setActiveItemFilter] = useState<string | null>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

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
    // These used to swallow every failure. When the customer list failed to
    // load the dropdown was simply empty, with nothing on screen to say so —
    // which reads as "the customer name won't register" rather than "the
    // request failed". Same for vehicles. Report it instead.
    fetchCustomers().then(setCustomers)
      .catch(e => setError(`Could not load customers: ${e instanceof Error ? e.message : 'request failed'}`));
    fetchVehicles().then(setAllVehicles)
      .catch(e => setError(`Could not load vehicles: ${e instanceof Error ? e.message : 'request failed'}`));
    fetchShopSettings().then(setShopSettings).catch(() => {});
    fetchTechnicians(true).then(ts => setDbTechs(uniqueTechsByPerson(ts).map(t => ({ id: t.id, name: t.name, role: t.role })))).catch(() => {});
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

  // Vehicle Intake creates the inspection itself, then sends its id. Open that
  // record rather than starting a new form — building a second one here is how
  // a single intake would end up as two DVIs.
  //
  // The request is consumed the moment it arrives and held in a ref, rather
  // than left in the store until the list loads. Leaving it there meant the
  // effect re-fired on every change to `inspections`, and if the operator had
  // opened the edit form in the meantime it closed again under them.
  const pendingOpenId = useRef<string | null>(null);
  useEffect(() => {
    if (!prefill?.openInspectionId) return;
    pendingOpenId.current = prefill.openInspectionId;
    dispatch({ type: 'SET_PREFILL', prefill: null });
  }, [prefill, dispatch]);

  useEffect(() => {
    const id = pendingOpenId.current;
    if (!id) return;
    // A form the operator opened themselves outranks a stale navigation.
    if (showForm) { pendingOpenId.current = null; return; }
    const found = inspections.find(i => i.id === id);
    if (!found) return; // list not loaded yet; this reruns when it is
    pendingOpenId.current = null;
    setSelected(found);
  }, [inspections, showForm]);

  useEffect(() => {
    // Stand down for both other instructions: `openInspectionId` means a DVI
    // already exists, and `inspectionId` belongs to the estimates flow. Acting
    // on either would open a blank second inspection.
    if (!prefill || prefill.openInspectionId || prefill.inspectionId) return;
    if (!prefill.jobCardId && !prefill.customerName) return;
    nextInspectionNumber().then(num => {
      setForm({
        ...EMPTY_FORM,
        inspectionNumber: num,
        items: getActiveTemplate(),
        customerName: prefill.customerName ?? '',
        customerId: prefill.customerId ?? '',
        vehicle: prefill.vehicle ?? '',
        vin: prefill.vin ?? '',
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

  function parseTechList(val: string): string[] {
    return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  function toggleTech(name: string) {
    setForm(f => {
      const cur = parseTechList(f.technician);
      const next = cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name];
      return { ...f, technician: next.join(', ') };
    });
  }

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
      setForm(f => {
        const cur = parseTechList(f.technician);
        return { ...f, technician: [...cur, t.name].join(', ') };
      });
      setAddTechForm({ name: '', role: 'Technician' });
      setShowAddTech(false);
      notify(`Technician "${t.name}" added`);
    } catch { notify('Failed to add technician'); }
    finally { setAddTechSaving(false); }
  }

  function getActiveTemplate() {
    const base = (shopSettings?.inspectionTemplate && shopSettings.inspectionTemplate.length > 0)
      ? shopSettings.inspectionTemplate.map(t => freshItem({ ...t, status: 'N/A', notes: '', photoUrl: '' }))
      : INSPECTION_TEMPLATE.map(freshItem);
    const existingNames = new Set(base.map(i => i.name));
    const extras = INTAKE_OUTTAKE_ITEMS
      .filter(t => !existingNames.has(t.name))
      .map(t => freshItem({ ...t, status: 'N/A', notes: '', photoUrl: '' }));
    return [...base, ...extras];
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
      // The new inspection is prepended, so it is at the top of the list —
      // but the form is long and closing it leaves you scrolled where you
      // were, with both the confirmation and the new row off-screen. On a
      // phone that made a successful save indistinguishable from a failed one
      // without scrolling up to check.
      revealNewRecord();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setSaving(false); }
  }

  function setItemStatus(itemId: string, status: InspectionItem['status']) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === itemId ? { ...it, status } : it) }));
  }

  function setItemNote(itemId: string, notes: string) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === itemId ? { ...it, notes } : it) }));
  }

  async function handlePhotoUpload(file: File, itemId?: string) {
    // Explicit id when the camera supplies one: setPhotoTargetItem is async, so
    // reading state here would attach the photo to the previously chosen item.
    const targetItemId = itemId ?? photoTargetItem;
    if (!editingId || !targetItemId) return;
    setUploadingItemId(targetItemId);
    try {
      const url = await uploadInspectionPhoto(editingId, targetItemId, file);
      const updatedItems = form.items.map(it => it.id === targetItemId ? { ...it, photoUrl: url } : it);
      setForm(f => ({ ...f, items: updatedItems }));
      await updateInspection(editingId, { items: updatedItems });
      setFailedPhoto(null);
      notify('Photo uploaded.');
    } catch (e: unknown) {
      // Hold the file so it can be retried. A technician on shop wifi loses
      // an upload often enough that "take it again" is not an answer.
      setFailedPhoto({ file, itemId: targetItemId });
      setError(`Photo upload failed: ${e instanceof Error ? e.message : 'unknown error'}. Use Retry — the photo is still here.`);
      try {
        const { logger } = await import('@/lib/logger');
        logger.error('inspections.photoUpload failed', e, { inspectionId: editingId, itemId: targetItemId, bytes: file.size });
      } catch { /* reporting must not mask the upload failure */ }
    }
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch('/api/inspection-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  async function handleAiDraftEstimate(ins: Inspection) {
    setAiDrafting(true); setAiDraftError(''); setAiDraft('');
    try {
      const failItems = ins.items.filter(it => it.status === 'Fail');
      const attnItems = ins.items.filter(it => it.status === 'Attention');
      const findings = [
        ...failItems.map(it => ({ label: it.name, finding: 'Fail', severity: 'High' })),
        ...attnItems.map(it => ({ label: it.name, finding: 'Needs Attention', severity: 'Medium' })),
      ];
      const res = await draftEstimateFromInspection({
        make: ins.vehicle,
        model: '',
        year: '',
        mileage: 0,
        laborRate: 85,
        currency: 'USD',
        findings,
      });
      const r = res.result as unknown as Record<string, unknown>;
      const draft = typeof r.estimateSummary === 'string'
        ? r.estimateSummary
        : JSON.stringify(r, null, 2);
      setAiDraft(draft);
      setAiDraftMock(res.mock);
    } catch (err) {
      setAiDraftError(err instanceof Error ? err.message : 'AI request failed');
    } finally { setAiDrafting(false); }
  }

  async function handleSendEmail(ins: Inspection) {
    if (!ins.customerEmail) return notify('No customer email on file for this inspection.');
    setSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch('/api/inspection-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

      {/* Opens the camera rather than the file picker. Falls back to the
          picker itself when there is no camera, no permission, or the browser
          cannot do it — so desktop keeps working unchanged. */}
      {cameraItemId && (
        <CameraCapture
          title="Inspection photo"
          onCancel={() => setCameraItemId(null)}
          onCapture={file => {
            const itemId = cameraItemId;
            setCameraItemId(null);
            if (itemId) void handlePhotoUpload(file, itemId);
          }}
        />
      )}

      {/* A failed upload keeps the photo rather than discarding it. */}
      {failedPhoto && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 'max(16px, env(safe-area-inset-bottom))', zIndex: 3000, margin: '0 auto', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderRadius: 14, background: 'var(--surface)', border: '1px solid #dc2626', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', color: 'var(--text)', fontSize: 14 }}>
          <span style={{ flex: 1, minWidth: 150 }}>Photo not uploaded.</span>
          <button
            onClick={() => { const p = failedPhoto; setFailedPhoto(null); void handlePhotoUpload(p.file, p.itemId); }}
            disabled={uploadingItemId !== null}
            style={{ minHeight: 44, padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
            {uploadingItemId ? 'Retrying…' : 'Retry'}
          </button>
          <button onClick={() => setFailedPhoto(null)}
            style={{ minHeight: 44, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--btn-border)', background: 'transparent', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer' }}>
            Discard
          </button>
        </div>
      )}

      {/* Writes into the same form state the checklist below renders, so the
          two are never out of step and Save behaves identically either way. */}
      {guidedOpen && showForm && (
        <GuidedInspection
          items={form.items}
          onChange={items => setForm(f => ({ ...f, items }))}
          onPhoto={itemId => setCameraItemId(itemId)}
          uploadingItemId={uploadingItemId}
          onClose={() => setGuidedOpen(false)}
          title={form.inspectionNumber || 'Inspection'}
        />
      )}

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
              <div className="section-label">⚡ Most Recent</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{inspections[0].inspectionNumber} — {inspections[0].customerName}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inspections[0].vehicle}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="search" style={{ flex: 1, minWidth: 100 }} />
            <button className="btn btn-primary" onClick={openNew}>+ New DVI</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FilterPills statuses={['All', ...INSPECTION_STATUSES]} active={filterStatus} onChange={setFilterStatus} />
          </div>
          {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(ins => {
              const fails  = failCount(ins.items);
              const attns  = attnCount(ins.items);
              const passes = passCount(ins.items);
              const nas    = ins.items.filter(i => i.status === 'N/A').length;
              const total  = ins.items.length;
              // Health colour: red if any fail, orange if any attention, green if all scored pass
              const healthColor = fails > 0 ? '#f44336' : attns > 0 ? '#ff9800' : passes > 0 ? '#4caf50' : 'var(--line)';
              const statusColor = ins.status === 'Completed' || ins.status === 'Customer Approved' ? '#4caf50'
                : ins.status === 'Partially Approved' ? '#ff9800'
                : ins.status === 'Customer Declined' ? '#f44336' : '#2196f3';
              const isActive = selected?.id === ins.id;
              return (
                <div key={ins.id} onClick={() => { setSelected(ins); setShowForm(false); setActiveItemFilter(null); }}
                  style={{
                    borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`,
                    background: isActive ? 'rgba(204,0,0,0.05)' : 'var(--surface-soft)',
                    boxShadow: isActive ? '0 2px 8px rgba(204,0,0,0.10)' : 'none',
                    transition: 'box-shadow 0.15s',
                  }}>
                  {/* Colored health strip */}
                  <div style={{ height: 3, background: healthColor, opacity: 0.8 }} />

                  <div style={{ padding: '10px 13px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{ins.inspectionNumber}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{ins.customerName}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ins.vehicle}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusColor + '18', border: `1px solid ${statusColor}44`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', marginLeft: 6 }}>
                        {ins.status}
                      </span>
                    </div>

                    {/* Dashboard score pills */}
                    {total > 0 && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                        {fails > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#f44336', background: '#f4433618', border: '1px solid #f4433630', borderRadius: 6, padding: '2px 7px' }}>
                            <span>✕</span> {fails} Fail
                          </span>
                        )}
                        {attns > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#e65100', background: '#ff980018', border: '1px solid #ff980030', borderRadius: 6, padding: '2px 7px' }}>
                            <span>!</span> {attns} Attn
                          </span>
                        )}
                        {passes > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2e7d32', background: '#4caf5015', border: '1px solid #4caf5030', borderRadius: 6, padding: '2px 7px' }}>
                            <span>✓</span> {passes} Pass
                          </span>
                        )}
                        {nas > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--line)', borderRadius: 6, padding: '2px 7px' }}>
                            {nas} N/A
                          </span>
                        )}
                      </div>
                    )}

                    {/* Mini health progress bar */}
                    {total > 0 && (passes + fails + attns) > 0 && (
                      <div style={{ marginTop: 7, height: 4, borderRadius: 4, overflow: 'hidden', background: 'var(--line)', display: 'flex' }}>
                        {fails  > 0 && <div style={{ flex: fails,  background: '#f44336' }} />}
                        {attns  > 0 && <div style={{ flex: attns,  background: '#ff9800' }} />}
                        {passes > 0 && <div style={{ flex: passes, background: '#4caf50' }} />}
                        {nas    > 0 && <div style={{ flex: nas,    background: 'var(--line)' }} />}
                      </div>
                    )}
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
                      if (!c) { setForm(f => ({ ...f, customerId: '', customerName: '', customerPhone: '', customerEmail: '', vehicle: '', vin: '' })); return; }
                      const firstVehicle = allVehicles.find(v => v.customerId === c.id);
                      setForm(f => ({
                        ...f,
                        customerId: c.id,
                        customerName: c.name ?? f.customerName,
                        customerPhone: c.phone ?? f.customerPhone,
                        customerEmail: c.email ?? f.customerEmail,
                        vehicle: firstVehicle?.label ?? f.vehicle,
                        vin: firstVehicle?.vin ?? f.vin,
                      }));
                    }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="">— select customer —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="login-field">
                    <label>Customer Name</label>
                    <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required placeholder="Auto-filled from customer" />
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
                            const v = allVehicles.find(v => vehicleOptionValue(v) === e.target.value);
                            setForm(f => ({ ...f, vehicle: e.target.value, vin: v?.vin ?? f.vin }));
                          }} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', width: '100%' }}>
                            <option value="">— select vehicle —</option>
                            {customerVehicles.length > 0 && (
                              <optgroup label={`${form.customerName || 'Customer'} vehicles`}>
                                {customerVehicles.map(v => (
                                  <option key={v.id} value={vehicleOptionValue(v)}>{vehicleOptionLabel(v)}</option>
                                ))}
                              </optgroup>
                            )}
                            {otherVehicles.length > 0 && (
                              <optgroup label="Other vehicles">
                                {otherVehicles.map(v => (
                                  <option key={v.id} value={vehicleOptionValue(v)}>{vehicleOptionLabel(v)}</option>
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
                      }));
                      const dbOptions = dbTechs
                        .filter(t => !techMembers.some(m => m.email.toLowerCase().startsWith(t.name.toLowerCase().replace(/ /g, '.'))))
                        .map(t => ({ value: t.name, label: `${t.name} (${t.role})` }));
                      const allOptions = [...memberOptions, ...dbOptions];
                      const selected = parseTechList(form.technician);
                      return allOptions.length > 0 ? (
                        <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {allOptions.map(o => {
                            const isChecked = selected.includes(o.value);
                            return (
                              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: isChecked ? 'rgba(204,0,0,0.08)' : 'transparent', border: isChecked ? '1px solid rgba(204,0,0,0.3)' : '1px solid transparent', userSelect: 'none' }}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleTech(o.value)} style={{ accentColor: 'var(--accent)' }} />
                                {o.label}
                              </label>
                            );
                          })}
                        </div>
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
                          onMouseEnter={e => { if (!addTechSaving && addTechForm.name.trim()) { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; } }}
                          onMouseLeave={e => { if (!addTechSaving && addTechForm.name.trim()) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent)'; } }}
                          style={{ padding: '7px 14px', borderRadius: 999, background: 'transparent', color: 'var(--accent)', border: '2px solid var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: addTechSaving || !addTechForm.name.trim() ? 0.6 : 1, transition: 'background .15s, color .15s' }}>
                          {addTechSaving ? 'Saving…' : 'Save & Select'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="login-field">
                    <label>Customer Email</label>
                    <input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} placeholder="Auto-filled from customer" />
                  </div>
                  <div className="login-field">
                    <label>Customer Phone</label>
                    <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="Auto-filled from customer" />
                  </div>
                </div>

                {/* Sixty-odd rows of four-way radios is where a technician on a
                    phone loses their place. The walkthrough is the same items,
                    one at a time, writing into this same form state. */}
                {form.items.length > 0 && (
                  <button type="button" onClick={() => setGuidedOpen(true)}
                    style={{ width: '100%', minHeight: 54, marginBottom: 14, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
                    ▶ Walk through {form.items.length} checks
                  </button>
                )}

                {/* Checklist */}
                {categories.map(cat => {
                  const cs = getCategoryStyle(cat);
                  return (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: cs.bg, border: `1.5px solid ${cs.border}`, borderRadius: 8, padding: '6px 12px', marginBottom: 8 }}>
                      <span style={{ fontSize: 15 }}>{cs.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: cs.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cat}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {form.items.filter(it => it.category === cat).map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--surface-soft)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ flex: 1, fontSize: 13 }}>{item.name}</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {ITEM_STATUSES.map(s => (
                              <button key={s} type="button" onClick={() => setItemStatus(item.id, s)}
                                style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${item.status === s ? STATUS_COLOR[s] : 'var(--line)'}`, background: item.status === s ? STATUS_COLOR[s] : 'transparent', color: item.status === s ? '#fff' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                          {editingId && (
                            uploadingItemId === item.id ? (
                              <span style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 8px' }}>uploading…</span>
                            ) : item.photoUrl ? (
                              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <a href={item.photoUrl} target="_blank" rel="noreferrer" title="View full photo">
                                  <StorageImage url={item.photoUrl} alt="inspection photo"
                                    style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '2px solid #4caf50', display: 'block', cursor: 'zoom-in' }} />
                                </a>
                                <button type="button" onClick={() => setCameraItemId(item.id)}
                                  style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                                  title="Replace photo">↺</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setCameraItemId(item.id)}
                                style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                                title="Add photo">📷</button>
                            )
                          )}
                          {item.status !== 'Pass' && item.status !== 'N/A' && (
                            <input value={item.notes} onChange={e => setItemNote(item.id, e.target.value)}
                              placeholder="Notes…" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, width: 140 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}

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
                <button
                  className="btn"
                  onClick={() => handleAiDraftEstimate(selected)}
                  disabled={aiDrafting}
                  style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  {aiDrafting ? '⏳ Drafting…' : '✨ Draft Estimate with AI'}
                </button>
                <button className="btn" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => handleDelete(selected)}>Delete</button>
              </div>

              {/* AI Estimate Draft */}
              {(aiDraft || aiDraftError) && (
                <div style={{ marginBottom: 12, padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>AI Estimate Draft — Suggestion Only</span>
                    {aiDraftMock && <span style={{ fontSize: 10, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>MOCK</span>}
                    <button onClick={() => { setAiDraft(''); setAiDraftError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
                  </div>
                  {aiDraftError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{aiDraftError}</p>}
                  {aiDraft && (
                    <>
                      <pre style={{ fontSize: 12, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiDraft}</pre>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic', marginBottom: 0 }}>
                        ⚠ AI suggestions must be verified by a qualified technician before presenting to the customer.
                      </p>
                    </>
                  )}
                </div>
              )}

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
                        onMouseEnter={e => { const c = copiedShare ? '#4caf50' : '#9c27b0'; e.currentTarget.style.background = c; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { const c = copiedShare ? '#4caf50' : '#9c27b0'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = c; }}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 999, border: `2px solid ${copiedShare ? '#4caf50' : '#9c27b0'}`, background: 'transparent', color: copiedShare ? '#4caf50' : '#9c27b0', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s, color 0.2s' }}>
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
                    {selected.technician && <div style={{ marginTop: 4 }}><TechPills value={selected.technician} gap={4} /></div>}
                  </div>
                </div>

                {/* Summary badges — click to filter checklist */}
                <div style={{ display: 'flex', gap: 10, marginBottom: activeItemFilter ? 8 : 20 }}>
                  {[
                    { label: 'Fail',      color: '#f44336', items: selected.items.filter(i => i.status === 'Fail') },
                    { label: 'Attention', color: '#ff9800', items: selected.items.filter(i => i.status === 'Attention') },
                    { label: 'Pass',      color: '#4caf50', items: selected.items.filter(i => i.status === 'Pass') },
                    { label: 'N/A',       color: '#888',    items: selected.items.filter(i => i.status === 'N/A') },
                  ].map(({ label, color, items: its }) => (
                    <InspectionStatBadge key={label} label={label} color={color} items={its}
                      active={activeItemFilter === label}
                      onClick={() => {
                        const next = activeItemFilter === label ? null : label;
                        setActiveItemFilter(next);
                        if (next) setTimeout(() => checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                    />
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

                {/* Active filter banner */}
                {activeItemFilter && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '7px 12px', background: 'var(--surface-soft)', borderRadius: 8, border: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Showing <strong style={{ color: 'var(--text)' }}>{activeItemFilter}</strong> items only
                    </span>
                    <button type="button" onClick={() => setActiveItemFilter(null)}
                      style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                      ✕ Clear filter
                    </button>
                  </div>
                )}

                {/* Items by category */}
                <div ref={checklistRef}>
                {[...new Set(selected.items.map(i => i.category))].map(cat => {
                  const catItems = selected.items.filter(i => i.category === cat);
                  const visibleItems = activeItemFilter ? catItems.filter(i => i.status === activeItemFilter) : catItems;
                  if (activeItemFilter && visibleItems.length === 0) return null;
                  const cs = getCategoryStyle(cat);
                  return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: cs.bg, border: `1.5px solid ${cs.border}`, borderRadius: 8, padding: '5px 10px', marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{cs.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: cs.color, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>{cat}</span>
                      {activeItemFilter && <span style={{ fontSize: 10, fontWeight: 400, color: cs.color, opacity: 0.8 }}>({visibleItems.length}/{catItems.length})</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {catItems.map(item => {
                        const dimmed = activeItemFilter && item.status !== activeItemFilter;
                        const highlighted = activeItemFilter && item.status === activeItemFilter;
                        return (
                        <div key={item.id} style={{
                          display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 8,
                          background: highlighted ? STATUS_COLOR[item.status] + '12' : 'var(--surface-soft)',
                          border: highlighted ? `1px solid ${STATUS_COLOR[item.status]}44` : '1px solid transparent',
                          opacity: dimmed ? 0.3 : 1,
                          transition: 'opacity 0.2s, background 0.2s',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[item.status], flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[item.status] }}>{item.status}</span>
                          {item.notes && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.notes}</span>}
                          {item.photoUrl && (
                            <StorageImage url={item.photoUrl} alt="photo"
                              onClick={() => setLightboxUrl(item.photoUrl)}
                              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, border: '2px solid #4caf50', display: 'block', cursor: 'zoom-in', flexShrink: 0 }} />
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
                </div>

                {selected.notes && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)', marginTop: 8 }}>
                    <div className="section-label" style={{ marginBottom: 6 }}>Notes</div>
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
        <div onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 14, width: '100%', maxWidth: 700, padding: 44, position: 'relative' }}>
            <button onClick={() => setShowPreview(false)} style={{ position: 'absolute', top: 14, right: 14, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✕ Close</button>
            <button onClick={() => { setShowPreview(false); window.print(); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; }}
              style={{ position: 'absolute', top: 14, right: 92, background: 'transparent', color: '#cc0000', border: '2px solid #cc0000', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background .15s, color .15s' }}>🖨 Print</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 20, borderBottom: '3px solid #cc0000' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                {shopSettings?.logoUrl && <StorageImage url={shopSettings.logoUrl} alt="Logo" style={{ height: 50, objectFit: 'contain' }} />}
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

            {/* Summary — hoverable stat cards */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              {([
                { label: 'FAIL',      statusKey: 'Fail',      bg: '#fff5f5', border: '#fecaca', color: '#f44336' },
                { label: 'ATTENTION', statusKey: 'Attention', bg: '#fffbeb', border: '#fde68a', color: '#ff9800' },
                { label: 'PASS',      statusKey: 'Pass',      bg: '#f0fdf4', border: '#bbf7d0', color: '#4caf50' },
              ] as const).map(({ label, statusKey, bg, border, color }) => (
                <ReportStatCard key={label} label={label} statusKey={statusKey} bg={bg} border={border} color={color} items={selected.items} />
              ))}
            </div>

            {/* Checklist by category */}
            {[...new Set(selected.items.map(i => i.category))].map(cat => {
              const cs = getCategoryStyle(cat);
              return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: cs.bg, border: `1.5px solid ${cs.border}`, borderRadius: 8, padding: '6px 12px', marginBottom: 8 }}>
                  <span style={{ fontSize: 15 }}>{cs.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: cs.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cat}</span>
                </div>
                {selected.items.filter(i => i.category === cat).map(item => (
                  <ReportItemRow key={item.id} item={item} onPhotoClick={setLightboxUrl} />
                ))}
              </div>
              );
            })}

            {selected.notes && <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8f8f8', borderRadius: 8 }}><strong style={{ fontSize: 12 }}>Notes: </strong><span style={{ fontSize: 12, color: '#555' }}>{selected.notes}</span></div>}

            <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#aaa', borderTop: '1px solid #eee', paddingTop: 12 }}>
              {shopSettings?.companyName} {shopSettings?.phone ? `· ${shopSettings.phone}` : ''} {shopSettings?.email ? `· ${shopSettings.email}` : ''}
            </div>
          </div>
        </div>
      )}
      {/* Photo lightbox */}
      {lightboxUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setLightboxUrl('')}>
          <button onClick={() => setLightboxUrl('')} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          <StorageImage url={lightboxUrl} alt="Inspection photo"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} />
          <a href={lightboxUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 24, background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 12, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🔗 Open full size
          </a>
        </div>
      )}
    </>
  );
}
