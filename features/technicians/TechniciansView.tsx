'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchTechnicians, createTechnician, updateTechnician, deleteTechnician,
  fetchTechPerformance, fetchTechOpenROs,
  Technician, TechPerformance,
  TECH_ROLES, PAY_TYPES, SPECIALTIES,
} from '@/services/technicianService';

/* ─────────────────── helpers ─────────────────── */
function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtH(n: number) { return n.toFixed(1) + ' h'; }
function statusColor(s: string) {
  if (s === 'Active')   return 'var(--green)';
  if (s === 'On Leave') return 'var(--amber)';
  return 'var(--muted)';
}
function roStatusColor(s: string) {
  if (s === 'In Progress') return 'var(--blue)';
  if (s === 'Open')        return 'var(--amber)';
  return 'var(--muted)';
}
function initials(name: string) {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

const EMPTY: Omit<Technician, 'id' | 'createdAt'> = {
  name: '', role: 'Technician', phone: '', email: '',
  specialty: 'General Repair', certifications: '',
  payType: 'Hourly', payRate: 25,
  hireDate: '', status: 'Active', notes: '',
};

type ActiveTab = 'roster' | 'workboard' | 'performance';

interface TechRO {
  roNumber: string; customerName: string; vehicle: string;
  status: string; laborHours: number; laborRate: number;
  partsTotal: number; openedDate: string;
}

/* ─────────────────── ROCard ─────────────────── */
function ROCard({ r }: { r: TechRO }) {
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{r.roNumber}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: roStatusColor(r.status) }}>{r.status}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{r.customerName}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.vehicle}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span>{r.laborHours.toFixed(1)} hrs</span>
        <span>{fmt(r.laborHours * r.laborRate + r.partsTotal)}</span>
      </div>
    </div>
  );
}

/* ─────────────────── main component ─────────────────── */
export function TechniciansView() {
  const [tab, setTab]               = useState<ActiveTab>('roster');
  const [techs, setTechs]           = useState<Technician[]>([]);
  const [perf, setPerf]             = useState<TechPerformance[]>([]);
  const [selected, setSelected]     = useState<Technician | null>(null);
  const [techROs, setTechROs]       = useState<TechRO[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState<Omit<Technician, 'id' | 'createdAt'>>(EMPTY);
  const [error, setError]           = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [boardPerf, setBoardPerf]   = useState<Record<string, TechRO[]>>({});
  const [boardLoading, setBoardLoading] = useState(false);

  /* derived totals */
  const activeTechs  = techs.filter(t => t.status === 'Active').length;
  const totalROs     = perf.reduce((s, p) => s + p.roCount, 0);
  const totalHours   = perf.reduce((s, p) => s + p.totalLaborHours, 0);
  const totalRevenue = perf.reduce((s, p) => s + p.totalValue, 0);
  const perfMap      = Object.fromEntries(perf.map(p => [p.techName, p]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([fetchTechnicians(), fetchTechPerformance()]);
      setTechs(t);
      setPerf(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Load work board when tab switches */
  const loadBoard = useCallback(async (techList: Technician[]) => {
    if (techList.length === 0) return;
    setBoardLoading(true);
    const out: Record<string, TechRO[]> = {};
    await Promise.all(
      techList.filter(t => t.status === 'Active').map(async t => {
        try { out[t.name] = await fetchTechOpenROs(t.name); }
        catch { out[t.name] = []; }
      })
    );
    setBoardPerf(out);
    setBoardLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'workboard') loadBoard(techs);
  }, [tab, techs, loadBoard]);

  /* Select a tech and load their open ROs */
  async function selectTech(t: Technician) {
    setSelected(t);
    setEditing(false);
    setDeleteConfirm('');
    try {
      const ros = await fetchTechOpenROs(t.name);
      setTechROs(ros);
    } catch { setTechROs([]); }
  }

  function startAdd() {
    setSelected(null);
    setForm(EMPTY);
    setEditing(true);
    setDeleteConfirm('');
  }

  function startEdit(t: Technician) {
    setForm({
      name: t.name, role: t.role, phone: t.phone, email: t.email,
      specialty: t.specialty, certifications: t.certifications,
      payType: t.payType, payRate: t.payRate,
      hireDate: t.hireDate ?? '', status: t.status, notes: t.notes,
    });
    setEditing(true);
    setDeleteConfirm('');
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (selected) {
        await updateTechnician(selected.id, form);
      } else {
        await createTechnician(form);
      }
      await load();
      setEditing(false);
      setSelected(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await deleteTechnician(id);
      setSelected(null);
      setDeleteConfirm('');
      setEditing(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  async function toggleStatus(t: Technician) {
    const next = t.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateTechnician(t.id, { status: next });
      await load();
      if (selected?.id === t.id) setSelected({ ...t, status: next });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /* ────────────────────────── render ────────────────────────── */
  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>👥 Employees</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Profiles · Work board · Labor tracking · Performance stats
          </p>
        </div>
        <button className="btn primary" onClick={startAdd}>+ Add Technician</button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,.12)', color: 'var(--red,#ef4444)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Technicians',    value: String(techs.length),   sub: `${activeTechs} active` },
          { label: 'Total ROs Worked',     value: String(totalROs),       sub: 'all time' },
          { label: 'Labor Hours Logged',   value: fmtH(totalHours),       sub: 'across all techs' },
          { label: 'Total Revenue Generated', value: fmt(totalRevenue),   sub: 'labor + parts' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {(['roster', 'workboard', 'performance'] as ActiveTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}
          >
            {t === 'roster' ? '👥 Roster' : t === 'workboard' ? '📋 Work Board' : '📊 Performance'}
          </button>
        ))}
      </div>

      {/* ═══ ROSTER ═══ */}
      {tab === 'roster' && (
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr' : '300px 1fr', gap: 16 }}>

          {/* List (hidden while editing) */}
          {!editing && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'start' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                {techs.length} Technician{techs.length !== 1 ? 's' : ''}
              </div>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
              ) : techs.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No technicians yet.<br />
                  <button className="btn primary" style={{ marginTop: 12 }} onClick={startAdd}>Add first technician</button>
                </div>
              ) : (
                techs.map(t => (
                  <div
                    key={t.id}
                    onClick={() => selectTech(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                      cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      background: selected?.id === t.id ? 'rgba(219,39,39,.07)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: t.status === 'Active' ? 'var(--accent)' : 'var(--border)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {initials(t.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.role}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(t.status), whiteSpace: 'nowrap' }}>{t.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Detail / Edit panel */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

            {/* ── Edit / Add form ── */}
            {editing && (
              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {selected ? `Edit — ${selected.name}` : 'Add Technician'}
                  </h3>
                  <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Full Name *</label>
                    <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mike Rodriguez" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Role</label>
                    <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%' }}>
                      {TECH_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Status</label>
                    <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                      {['Active', 'On Leave', 'Inactive'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Phone</label>
                    <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Email</label>
                    <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tech@shop.com" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Specialty</label>
                    <select className="input" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} style={{ width: '100%' }}>
                      {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Hire Date</label>
                    <input className="input" type="date" value={form.hireDate ?? ''} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Pay Type</label>
                    <select className="input" value={form.payType} onChange={e => setForm(f => ({ ...f, payType: e.target.value }))} style={{ width: '100%' }}>
                      {PAY_TYPES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                      {form.payType === 'Commission' ? 'Commission %' : form.payType === 'Hourly' ? 'Hourly Rate ($)' : form.payType === 'Salary' ? 'Annual Salary ($)' : 'Flat Rate per Job ($)'}
                    </label>
                    <input className="input" type="number" step="0.01" min="0" value={form.payRate} onChange={e => setForm(f => ({ ...f, payRate: parseFloat(e.target.value) || 0 }))} style={{ width: '100%' }} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Certifications (comma-separated)</label>
                    <input className="input" value={form.certifications} onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))} placeholder="ASE A1, ASE A6, EPA 609" style={{ width: '100%' }} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes</label>
                    <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes…" style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                </div>

                <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="btn primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : selected ? 'Save Changes' : 'Create Technician'}
                  </button>
                  {selected && deleteConfirm !== selected.id && (
                    <button className="btn" style={{ marginLeft: 'auto', color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)' }} onClick={() => setDeleteConfirm(selected.id)}>
                      Delete
                    </button>
                  )}
                  {selected && deleteConfirm === selected.id && (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--red,#ef4444)', marginLeft: 'auto' }}>Confirm delete?</span>
                      <button className="btn" style={{ color: 'var(--red,#ef4444)', borderColor: 'var(--red,#ef4444)' }} onClick={() => handleDelete(selected.id)} disabled={saving}>Yes, Delete</button>
                      <button className="btn" onClick={() => setDeleteConfirm('')}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Profile view ── */}
            {!editing && selected && (
              <div>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                    background: selected.status === 'Active' ? 'var(--accent)' : 'var(--border)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 700,
                  }}>
                    {initials(selected.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selected.name}</h2>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.role}{selected.specialty ? ` · ${selected.specialty}` : ''}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(selected.status) }}>{selected.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => startEdit(selected)}>✏️ Edit</button>
                    <button className="btn" onClick={() => toggleStatus(selected)}>
                      {selected.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>

                {/* Info grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                  {([
                    ['📞 Phone', selected.phone || '—'],
                    ['📧 Email', selected.email || '—'],
                    ['💰 Pay', `${selected.payType} · ${selected.payType === 'Commission' ? selected.payRate + '%' : fmt(selected.payRate)}`],
                    ['📅 Hire Date', selected.hireDate ? new Date(selected.hireDate + 'T00:00:00').toLocaleDateString() : '—'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Certifications */}
                {selected.certifications && (
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Certifications</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.certifications.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                        <span key={c} style={{ fontSize: 11, padding: '2px 10px', background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderRadius: 20, fontWeight: 700 }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performance summary */}
                {(() => {
                  const p = perfMap[selected.name];
                  if (!p) return (
                    <div style={{ padding: '16px 20px', color: 'var(--muted)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      No ROs assigned to this technician yet.
                    </div>
                  );
                  return (
                    <div>
                      <div style={{ padding: '10px 20px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Performance Summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        {([
                          ['Total ROs',     String(p.roCount)],
                          ['Completed',     String(p.completedROCount)],
                          ['Open ROs',      String(p.openROCount)],
                          ['Labor Hours',   fmtH(p.totalLaborHours)],
                          ['Labor Value',   fmt(p.totalLaborValue)],
                          ['Parts Value',   fmt(p.totalPartsValue)],
                          ['Total Revenue', fmt(p.totalValue)],
                          ['Avg Hrs / RO',  fmtH(p.avgHoursPerRO)],
                          ['Job Cards',     String(p.jobCardCount)],
                        ] as [string, string][]).map(([l, v]) => (
                          <div key={l} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Open ROs */}
                {techROs.length > 0 && (
                  <div>
                    <div style={{ padding: '10px 20px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Active Repair Orders ({techROs.length})
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--table-head,var(--border))' }}>
                          {['RO #', 'Customer', 'Vehicle', 'Status', 'Hours', 'Labor', 'Parts'].map(h => (
                            <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {techROs.map(r => (
                          <tr key={r.roNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--accent)' }}>{r.roNumber}</td>
                            <td style={{ padding: '8px 12px' }}>{r.customerName}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.vehicle}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: roStatusColor(r.status) }}>{r.status}</span>
                            </td>
                            <td style={{ padding: '8px 12px' }}>{fmtH(r.laborHours)}</td>
                            <td style={{ padding: '8px 12px' }}>{fmt(r.laborHours * r.laborRate)}</td>
                            <td style={{ padding: '8px 12px' }}>{fmt(r.partsTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Notes */}
                {selected.notes && (
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notes</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!editing && !selected && (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                ← Select a technician to view profile, stats, and open ROs
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ WORK BOARD ═══ */}
      {tab === 'workboard' && (
        <div>
          {boardLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading work board…</div>
          ) : techs.filter(t => t.status === 'Active').length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No active technicians. Add technicians with Active status and assign them to Repair Orders.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {techs.filter(t => t.status === 'Active').map(t => {
                const ros = boardPerf[t.name] ?? [];
                const inProg  = ros.filter(r => r.status === 'In Progress');
                const pending = ros.filter(r => r.status !== 'In Progress');
                return (
                  <div key={t.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(219,39,39,.06)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {initials(t.name)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.role}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{ros.length}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>open ROs</div>
                      </div>
                    </div>
                    {/* RO list */}
                    {ros.length === 0 ? (
                      <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No open ROs</div>
                    ) : (
                      <>
                        {inProg.length > 0 && (
                          <div style={{ padding: '5px 16px', fontSize: 10, fontWeight: 700, color: 'var(--blue,#3b82f6)', textTransform: 'uppercase', background: 'rgba(59,130,246,.06)' }}>
                            In Progress ({inProg.length})
                          </div>
                        )}
                        {inProg.map(r => <ROCard key={r.roNumber} r={r} />)}
                        {pending.length > 0 && (
                          <div style={{ padding: '5px 16px', fontSize: 10, fontWeight: 700, color: 'var(--amber,#f59e0b)', textTransform: 'uppercase', background: 'rgba(245,158,11,.06)' }}>
                            Pending ({pending.length})
                          </div>
                        )}
                        {pending.map(r => <ROCard key={r.roNumber} r={r} />)}
                        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                          <span>Total: <strong>{fmtH(ros.reduce((s, r) => s + r.laborHours, 0))}</strong></span>
                          <span>Value: <strong>{fmt(ros.reduce((s, r) => s + r.laborHours * r.laborRate + r.partsTotal, 0))}</strong></span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ PERFORMANCE ═══ */}
      {tab === 'performance' && (
        <div>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
          ) : perf.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No performance data yet. Assign technicians to Repair Orders to track stats.
            </div>
          ) : (
            <>
              {/* Table */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--table-head,var(--border))' }}>
                        {['Technician', 'Total ROs', 'Completed', 'Open', 'Labor Hours', 'Labor Value', 'Parts Value', 'Total Revenue', 'Avg Hrs/RO', 'Job Cards'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...perf].sort((a, b) => b.totalValue - a.totalValue).map((p, i) => (
                        <tr key={p.techName} style={{ borderBottom: '1px solid var(--border)', background: i % 2 !== 0 ? 'rgba(0,0,0,.02)' : 'transparent' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                {initials(p.techName)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{p.techName}</div>
                                {i === 0 && perf.length > 1 && <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>🏆 Top Performer</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>{p.roCount}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>{p.completedROCount}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: p.openROCount > 0 ? 'var(--amber)' : 'var(--muted)' }}>{p.openROCount}</td>
                          <td style={{ padding: '10px 14px' }}>{fmtH(p.totalLaborHours)}</td>
                          <td style={{ padding: '10px 14px' }}>{fmt(p.totalLaborValue)}</td>
                          <td style={{ padding: '10px 14px' }}>{fmt(p.totalPartsValue)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmt(p.totalValue)}</td>
                          <td style={{ padding: '10px 14px' }}>{fmtH(p.avgHoursPerRO)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>{p.jobCardCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--table-head,var(--border))', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>Totals</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{perf.reduce((s, p) => s + p.roCount, 0)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{perf.reduce((s, p) => s + p.completedROCount, 0)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{perf.reduce((s, p) => s + p.openROCount, 0)}</td>
                        <td style={{ padding: '10px 14px' }}>{fmtH(perf.reduce((s, p) => s + p.totalLaborHours, 0))}</td>
                        <td style={{ padding: '10px 14px' }}>{fmt(perf.reduce((s, p) => s + p.totalLaborValue, 0))}</td>
                        <td style={{ padding: '10px 14px' }}>{fmt(perf.reduce((s, p) => s + p.totalPartsValue, 0))}</td>
                        <td style={{ padding: '10px 14px' }}>{fmt(perf.reduce((s, p) => s + p.totalValue, 0))}</td>
                        <td style={{ padding: '10px 14px' }}>—</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{perf.reduce((s, p) => s + p.jobCardCount, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Revenue bar chart */}
              {(() => {
                const maxVal = Math.max(...perf.map(p => p.totalValue), 1);
                return (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Revenue by Technician</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[...perf].sort((a, b) => b.totalValue - a.totalValue).map(p => (
                        <div key={p.techName} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 140, fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.techName}</div>
                          <div style={{ flex: 1, height: 22, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(p.totalValue / maxVal) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width .4s ease', minWidth: p.totalValue > 0 ? 4 : 0 }} />
                          </div>
                          <div style={{ width: 80, fontSize: 12, fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>{fmt(p.totalValue)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
