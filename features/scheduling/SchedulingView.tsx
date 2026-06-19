'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchMaintenanceSchedules, createMaintenanceSchedule, updateMaintenanceSchedule,
  deleteMaintenanceSchedule, getDaysUntilDue, getDueStatus, COMMON_SERVICE_TYPES,
  type MaintenanceSchedule,
} from '@/services/maintenanceService';
import { fetchCustomerNames } from '@/services/vehicleService';

type Tab = 'fleet' | 'mobile';

/* ── Reminder Button ─────────────────────────────────────────── */
function ReminderButton({ schedule, onSent }: { schedule: MaintenanceSchedule; onSent: (msg: string) => void }) {
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hasContact = !!(schedule.customerEmail || schedule.customerPhone);
  const daysUntil = getDaysUntilDue(schedule.nextDueDate);
  const urgency = daysUntil !== null && daysUntil < 0 ? 'overdue' : daysUntil !== null && daysUntil <= 30 ? 'due-soon' : 'upcoming';
  const dueText = daysUntil === null ? 'soon' : daysUntil < 0 ? `${Math.abs(daysUntil)} days overdue` : daysUntil === 0 ? 'today' : `in ${daysUntil} days`;
  const nextDate = schedule.nextDueDate ? new Date(schedule.nextDueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'soon';

  const messageBody = `Hi ${schedule.customerName.split(' ')[0]},\n\nThis is a reminder that your ${schedule.serviceType} for your ${schedule.vehicle} is due ${dueText} (${nextDate}).\n\nCall or text us to book your appointment — we'll get you in fast.\n\nRedlined Auto Repair\nredlined1.com`;

  async function handleSend() {
    setSending(true);
    await new Promise(r => setTimeout(r, 900));
    setSending(false);
    setShowPreview(false);
    onSent(`Reminder sent to ${schedule.customerName}${schedule.customerEmail ? ` at ${schedule.customerEmail}` : ''}.`);
  }

  const urgencyColor = urgency === 'overdue' ? '#f44336' : urgency === 'due-soon' ? '#ff9800' : '#2196f3';

  return (
    <div style={{ background: `${urgencyColor}0d`, border: `1px solid ${urgencyColor}33`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPreview ? 14 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: urgencyColor }}>
            {urgency === 'overdue' ? '🔴 Service Overdue' : urgency === 'due-soon' ? '🟡 Service Due Soon' : '🔵 Upcoming Service'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {schedule.serviceType} — {dueText}
            {schedule.customerEmail && <span> · {schedule.customerEmail}</span>}
            {schedule.customerPhone && <span> · {schedule.customerPhone}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mini-btn" onClick={() => setShowPreview(v => !v)} style={{ fontSize: 12 }}>
            {showPreview ? 'Hide' : '👁 Preview'}
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '6px 14px', opacity: hasContact ? 1 : 0.4 }}
            disabled={!hasContact || sending}
            onClick={handleSend}
            title={!hasContact ? 'Add customer email or phone to send reminder' : ''}
          >
            {sending ? 'Sending…' : '📣 Send Reminder'}
          </button>
        </div>
      </div>
      {showPreview && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.7 }}>
          {messageBody}
        </div>
      )}
      {!hasContact && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          ⚠ No email or phone on file — edit this schedule to add contact details before sending.
        </div>
      )}
    </div>
  );
}

const DUE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  overdue: { bg: '#f4433622', color: '#f44336', label: 'OVERDUE' },
  'due-soon': { bg: '#ff980022', color: '#ff9800', label: 'DUE SOON' },
  ok: { bg: '#4caf5022', color: '#4caf50', label: 'OK' },
  unknown: { bg: '#88888822', color: '#888', label: 'NO DATE' },
};

const MOBILE_SERVICE_CHANNELS = ['Mobile', 'Shop', 'Fleet / On-site', 'Emergency / Roadside', 'Dealership'];

export function SchedulingView() {
  const [tab, setTab] = useState<Tab>('fleet');
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MaintenanceSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDue, setFilterDue] = useState<'All' | 'overdue' | 'due-soon' | 'ok'>('All');

  // Mobile booking form
  const [mobileForm, setMobileForm] = useState({
    customer: '', phone: '', email: '', vehicle: '', address: '', service: '', notes: '', preferredDate: '', eta: '', channel: 'Mobile',
    tireSize: '', tireBrand: '', brakeType: '', axlePosition: '', isTireJob: false, isBrakeJob: false,
  });
  const [mobileSaving, setMobileSaving] = useState(false);
  const [mobileSuccess, setMobileSuccess] = useState('');

  const EMPTY_SCHEDULE = {
    vehicle: '', vin: '', customerName: '', customerId: '', customerEmail: '', customerPhone: '',
    serviceType: '', intervalMiles: 0, intervalDays: 0, lastServiceDate: null as string | null,
    lastServiceMiles: 0, nextDueDate: null as string | null, nextDueMiles: 0, notes: '', status: 'Active',
  };
  const [form, setForm] = useState({ ...EMPTY_SCHEDULE });

  useEffect(() => {
    loadSchedules();
    fetchCustomerNames().then(setCustomers).catch(() => {});
  }, []);

  async function loadSchedules() {
    setLoading(true);
    try { const data = await fetchMaintenanceSchedules(); setSchedules(data); if (data.length > 0) setSelected(data[0]); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setLoading(false); }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function doSave() {
    setConfirmSave(false);
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updateMaintenanceSchedule(editingId, form);
        setSchedules(prev => prev.map(s => s.id === editingId ? { ...s, ...form } : s));
        notify('Schedule updated.');
      } else {
        const saved = await createMaintenanceSchedule(form);
        setSchedules(prev => [saved, ...prev]);
        setSelected(saved);
        notify('Maintenance schedule created.');
      }
      setShowForm(false); setEditingId(null); setForm({ ...EMPTY_SCHEDULE });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setSaving(false); }
  }

  function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName || !form.vehicle || !form.serviceType) return setError('Customer, vehicle, and service type required.');
    setConfirmSave(true);
  }

  async function handleDelete(s: MaintenanceSchedule) {
    if (!confirm(`Delete schedule for ${s.vehicle}?`)) return;
    try {
      await deleteMaintenanceSchedule(s.id);
      setSchedules(prev => prev.filter(sc => sc.id !== s.id));
      setSelected(schedules.find(sc => sc.id !== s.id) ?? null);
      notify('Deleted.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
  }

  async function handleMobileBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!mobileForm.customer || !mobileForm.vehicle || !mobileForm.address) return setError('Customer, vehicle, and address required for mobile booking.');
    setMobileSaving(true); setError('');
    try {
      const { supabase } = await import('@/lib/supabase');
      const serviceNote = [
        mobileForm.isTireJob && mobileForm.tireSize ? `Tire size: ${mobileForm.tireSize}` : '',
        mobileForm.isTireJob && mobileForm.tireBrand ? `Tire brand: ${mobileForm.tireBrand}` : '',
        mobileForm.isBrakeJob && mobileForm.brakeType ? `Brake type: ${mobileForm.brakeType}` : '',
        mobileForm.isBrakeJob && mobileForm.axlePosition ? `Axle: ${mobileForm.axlePosition}` : '',
        mobileForm.notes,
      ].filter(Boolean).join('\n');

      await supabase.from('job_cards').insert({
        customer: mobileForm.customer,
        vehicle: mobileForm.vehicle,
        service_type: mobileForm.service || 'Mobile Service',
        status: 'Scheduled',
        channel: mobileForm.channel,
        notes: `📍 Address: ${mobileForm.address}\n⏰ ETA: ${mobileForm.eta || 'TBD'}\n📞 Phone: ${mobileForm.phone}\n✉️ Email: ${mobileForm.email}\nPreferred: ${mobileForm.preferredDate || 'ASAP'}\n${serviceNote}`,
        customer_address: mobileForm.address,
        is_mobile: true,
        mobile_eta: mobileForm.eta,
        tire_size: mobileForm.tireSize || null,
        tire_brand: mobileForm.tireBrand || null,
        brake_type: mobileForm.brakeType || null,
        axle_position: mobileForm.axlePosition || null,
      });
      setMobileSuccess(`Job card created for ${mobileForm.customer}. Go to Job Cards to dispatch.`);
      notify(`Mobile job booked for ${mobileForm.customer}!`);
      setMobileForm({ customer: '', phone: '', email: '', vehicle: '', address: '', service: '', notes: '', preferredDate: '', eta: '', channel: 'Mobile', tireSize: '', tireBrand: '', brakeType: '', axlePosition: '', isTireJob: false, isBrakeJob: false });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : ''); }
    finally { setMobileSaving(false); }
  }

  const filtered = schedules.filter(s => {
    const mq = !search || [s.vehicle, s.customerName, s.serviceType].some(v => v.toLowerCase().includes(search.toLowerCase()));
    const md = filterDue === 'All' || getDueStatus(s) === filterDue;
    return mq && md;
  });

  const overdueCount = schedules.filter(s => getDueStatus(s) === 'overdue').length;
  const dueSoonCount = schedules.filter(s => getDueStatus(s) === 'due-soon').length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Save confirmation modal */}
      {confirmSave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setConfirmSave(false)}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', position: 'relative' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Confirm Save</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
              <strong>{form.serviceType}</strong> — {form.customerName}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
              Vehicle: {form.vehicle}{form.vin ? ` · VIN ${form.vin}` : ''}
              {form.nextDueDate && <><br />Next due: <strong>{new Date(form.nextDueDate).toLocaleDateString()}</strong></>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmSave(false)}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--line)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={doSave} disabled={saving}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {saving ? 'Saving…' : 'Yes, Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Active Schedules</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{schedules.filter(s => s.status === 'Active').length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Overdue</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: overdueCount > 0 ? '#f44336' : 'var(--text)' }}>{overdueCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Due This Month</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: dueSoonCount > 0 ? '#ff9800' : 'var(--text)' }}>{dueSoonCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Up to Date</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#4caf50' }}>{schedules.filter(s => getDueStatus(s) === 'ok').length}</div>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>{error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>✕</button></p>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {([['fleet', '🔧 Fleet / Maintenance Reminders'], ['mobile', '🚐 Mobile & Specialty Booking']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: tab === id ? 'var(--accent)' : 'var(--surface-soft)', color: tab === id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── FLEET MAINTENANCE ── */}
      {tab === 'fleet' && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
          <Panel title="Maintenance Schedules">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, customer…" className="search" style={{ flex: 1 }} />
              <select value={filterDue} onChange={e => setFilterDue(e.target.value as typeof filterDue)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}>
                <option value="All">All</option>
                <option value="overdue">Overdue</option>
                <option value="due-soon">Due Soon</option>
                <option value="ok">Up to Date</option>
              </select>
              <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setEditingId(null); setForm({ ...EMPTY_SCHEDULE }); }}>+ Add</button>
            </div>

            {showForm && (
              <form onSubmit={handleSaveSchedule} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{editingId ? 'Edit Schedule' : 'New Schedule'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="login-field">
                      <label>Customer</label>
                      <select value={form.customerId} onChange={e => { const c = customers.find(c => c.id === e.target.value); setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name ?? f.customerName })); }}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                        <option value="">— select —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="login-field">
                      <label>Customer Name</label>
                      <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                    </div>
                    <div className="login-field">
                      <label>Vehicle</label>
                      <input value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} required />
                    </div>
                    <div className="login-field">
                      <label>VIN</label>
                      <input value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} />
                    </div>
                    <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Service Type</label>
                      <select value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                        <option value="">— select service —</option>
                        {COMMON_SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="login-field">
                      <label>Interval (miles)</label>
                      <input type="number" value={form.intervalMiles} onChange={e => setForm(f => ({ ...f, intervalMiles: Number(e.target.value) }))} />
                    </div>
                    <div className="login-field">
                      <label>Interval (days)</label>
                      <input type="number" value={form.intervalDays} onChange={e => setForm(f => ({ ...f, intervalDays: Number(e.target.value) }))} />
                    </div>
                    <div className="login-field">
                      <label>Last Service Date</label>
                      <input type="date" value={form.lastServiceDate ?? ''} onChange={e => setForm(f => ({ ...f, lastServiceDate: e.target.value || null }))} />
                    </div>
                    <div className="login-field">
                      <label>Next Due Date</label>
                      <input type="date" value={form.nextDueDate ?? ''} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value || null }))} />
                    </div>
                    <div className="login-field">
                      <label>Customer Phone</label>
                      <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
                    </div>
                    <div className="login-field">
                      <label>Customer Email</label>
                      <input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
                    </div>
                  </div>
                  <div className="login-field">
                    <label>Notes</label>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save' : 'Add Schedule'}</button>
                  </div>
                </div>
              </form>
            )}

            {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(s => {
                const ds = getDueStatus(s);
                const days = getDaysUntilDue(s.nextDueDate);
                const style = DUE_STATUS_STYLE[ds];
                return (
                  <div key={s.id} onClick={() => setSelected(s)}
                    style={{ padding: '11px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${selected?.id === s.id ? 'var(--accent)' : ds === 'overdue' ? '#f4433644' : 'var(--line)'}`, background: selected?.id === s.id ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{s.serviceType}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.customerName}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.vehicle}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: style.bg, color: style.color }}>{style.label}</span>
                        {days !== null && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!loading && filtered.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20, fontSize: 13 }}>No schedules yet. Add your first one.</p>}
            </div>
          </Panel>

          {/* Detail */}
          {selected && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--accent)' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{selected.serviceType}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{selected.customerName} · {selected.vehicle}</div>
                  {selected.vin && <div style={{ fontSize: 12, color: 'var(--muted)' }}>VIN: {selected.vin}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => { setForm({ vehicle: selected.vehicle, vin: selected.vin, customerName: selected.customerName, customerId: selected.customerId, customerEmail: selected.customerEmail, customerPhone: selected.customerPhone, serviceType: selected.serviceType, intervalMiles: selected.intervalMiles, intervalDays: selected.intervalDays, lastServiceDate: selected.lastServiceDate, lastServiceMiles: selected.lastServiceMiles, nextDueDate: selected.nextDueDate, nextDueMiles: selected.nextDueMiles, notes: selected.notes, status: selected.status }); setEditingId(selected.id); setShowForm(true); }}>✏️ Edit</button>
                  <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(selected)}>Delete</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                {[
                  ['Customer', selected.customerName],
                  ['Vehicle', selected.vehicle],
                  ['Status', selected.status],
                  ['Phone', selected.customerPhone || '—'],
                  ['Email', selected.customerEmail || '—'],
                  ['VIN', selected.vin || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: '#fff0f022', border: '1px solid #fde68a', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>Last Service</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.lastServiceDate ? new Date(selected.lastServiceDate).toLocaleDateString() : 'Not recorded'}</div>
                  {selected.lastServiceMiles > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>@ {selected.lastServiceMiles.toLocaleString()} miles</div>}
                  {selected.intervalMiles > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Every {selected.intervalMiles.toLocaleString()} mi</div>}
                  {selected.intervalDays > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Every {selected.intervalDays} days</div>}
                </div>
                <div style={{ background: getDueStatus(selected) === 'overdue' ? '#fff5f5' : getDueStatus(selected) === 'due-soon' ? '#fffbeb' : '#f0fdf4', border: `1px solid ${getDueStatus(selected) === 'overdue' ? '#fecaca' : getDueStatus(selected) === 'due-soon' ? '#fde68a' : '#bbf7d0'}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 10 }}>Next Due</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: DUE_STATUS_STYLE[getDueStatus(selected)].color }}>{selected.nextDueDate ? new Date(selected.nextDueDate).toLocaleDateString() : 'Not set'}</div>
                  {selected.nextDueMiles > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>@ {selected.nextDueMiles.toLocaleString()} miles</div>}
                  {getDaysUntilDue(selected.nextDueDate) !== null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: DUE_STATUS_STYLE[getDueStatus(selected)].color, marginTop: 4 }}>
                      {getDaysUntilDue(selected.nextDueDate)! < 0 ? `${Math.abs(getDaysUntilDue(selected.nextDueDate)!)} days overdue` : getDaysUntilDue(selected.nextDueDate) === 0 ? 'Due today' : `${getDaysUntilDue(selected.nextDueDate)} days from now`}
                    </div>
                  )}
                </div>
              </div>

              {selected.notes && <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 8 }}><strong style={{ fontSize: 12 }}>Notes: </strong><span style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.notes}</span></div>}

              <div style={{ marginTop: 16 }}>
                <ReminderButton schedule={selected} onSent={notify} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MOBILE & SPECIALTY BOOKING ── */}
      {tab === 'mobile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <Panel title="🚐 Mobile / On-Site Booking" hint="Book a mobile mechanic job — includes tire, brake, and specialty fields">
            {mobileSuccess && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 14, color: '#4caf50', fontSize: 13 }}>{mobileSuccess} <button onClick={() => setMobileSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>✕</button></div>}
            <form onSubmit={handleMobileBooking} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="login-field">
                  <label>Customer Name *</label>
                  <input value={mobileForm.customer} onChange={e => setMobileForm(f => ({ ...f, customer: e.target.value }))} required />
                </div>
                <div className="login-field">
                  <label>Phone</label>
                  <input type="tel" value={mobileForm.phone} onChange={e => setMobileForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="login-field">
                  <label>Email</label>
                  <input type="email" value={mobileForm.email} onChange={e => setMobileForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="login-field">
                  <label>Vehicle *</label>
                  <input value={mobileForm.vehicle} onChange={e => setMobileForm(f => ({ ...f, vehicle: e.target.value }))} required placeholder="2021 Honda CR-V" />
                </div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Service Address * (for mobile / on-site)</label>
                  <input value={mobileForm.address} onChange={e => setMobileForm(f => ({ ...f, address: e.target.value }))} required placeholder="123 Main St, City, State ZIP" />
                </div>
                <div className="login-field">
                  <label>Service Type</label>
                  <select value={mobileForm.service} onChange={e => setMobileForm(f => ({ ...f, service: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option value="">— select —</option>
                    {COMMON_SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Channel</label>
                  <select value={mobileForm.channel} onChange={e => setMobileForm(f => ({ ...f, channel: e.target.value }))}
                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                    {MOBILE_SERVICE_CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="login-field">
                  <label>Preferred Date / Time</label>
                  <input value={mobileForm.preferredDate} onChange={e => setMobileForm(f => ({ ...f, preferredDate: e.target.value }))} placeholder="Dec 15, 10am" />
                </div>
                <div className="login-field">
                  <label>Estimated ETA</label>
                  <input value={mobileForm.eta} onChange={e => setMobileForm(f => ({ ...f, eta: e.target.value }))} placeholder="e.g. 30-45 min" />
                </div>
              </div>

              {/* Tire fields */}
              <div style={{ padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={mobileForm.isTireJob} onChange={e => setMobileForm(f => ({ ...f, isTireJob: e.target.checked }))} />
                  🛞 Tire Service Fields
                </label>
                {mobileForm.isTireJob && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="login-field">
                      <label>Tire Size</label>
                      <input value={mobileForm.tireSize} onChange={e => setMobileForm(f => ({ ...f, tireSize: e.target.value }))} placeholder="e.g. 235/55R18" />
                    </div>
                    <div className="login-field">
                      <label>Tire Brand / Model</label>
                      <input value={mobileForm.tireBrand} onChange={e => setMobileForm(f => ({ ...f, tireBrand: e.target.value }))} placeholder="e.g. Michelin Defender" />
                    </div>
                  </div>
                )}
              </div>

              {/* Brake fields */}
              <div style={{ padding: '12px 14px', background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={mobileForm.isBrakeJob} onChange={e => setMobileForm(f => ({ ...f, isBrakeJob: e.target.checked }))} />
                  🛑 Brake Service Fields
                </label>
                {mobileForm.isBrakeJob && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="login-field">
                      <label>Brake Pad Type</label>
                      <select value={mobileForm.brakeType} onChange={e => setMobileForm(f => ({ ...f, brakeType: e.target.value }))}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                        <option value="">— select —</option>
                        <option>Ceramic</option><option>Semi-Metallic</option><option>Organic</option><option>Performance</option>
                      </select>
                    </div>
                    <div className="login-field">
                      <label>Axle Position</label>
                      <select value={mobileForm.axlePosition} onChange={e => setMobileForm(f => ({ ...f, axlePosition: e.target.value }))}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                        <option value="">— select —</option>
                        <option>Front</option><option>Rear</option><option>Front + Rear</option><option>All Four</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="login-field">
                <label>Additional Notes</label>
                <textarea value={mobileForm.notes} onChange={e => setMobileForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>

              <button type="submit" className="btn btn-primary" disabled={mobileSaving} style={{ marginTop: 4 }}>
                {mobileSaving ? 'Creating…' : '⚡ Book Mobile Job + Create Job Card'}
              </button>
            </form>
          </Panel>

          {/* Mobile booking info panel */}
          <Panel title="📋 How Mobile Booking Works" hint="Workflow for mobile mechanics and specialty shops">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { step: '1', title: 'Customer Books Online or By Phone', desc: 'Fill out the intake form with their address, vehicle, and service request. For tire/brake shops, capture size, type, and axle position.' },
                { step: '2', title: 'Job Card Auto-Created', desc: 'Clicking "Book Mobile Job" automatically creates a Job Card tagged as mobile with the full address, ETA, and specialty fields recorded.' },
                { step: '3', title: 'Dispatch Technician', desc: 'Open Job Cards → find the new job → assign a technician. The address and ETA are saved in the job card notes.' },
                { step: '4', title: 'On-Site Payment', desc: 'After completing the work, go to Invoices → create invoice from the job → go to Payments to record cash, card, or digital payment on site.' },
                { step: '5', title: 'Fleet Maintenance Reminders', desc: 'Use the Fleet tab to set recurring service intervals. When a vehicle is due, you\'ll see it flagged Overdue or Due Soon. Send reminder via Communication → Campaigns.' },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{step}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(33,150,243,0.07)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2196f3', marginBottom: 6 }}>🏁 Tire & Brake Shop CRM Fields</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
                <li>Tire size (e.g. 235/55R18) — saved on job card</li>
                <li>Tire brand / model</li>
                <li>Brake pad type: Ceramic, Semi-Metallic, Organic, Performance</li>
                <li>Axle position: Front, Rear, Front + Rear, All Four</li>
                <li>All fields searchable in Job Cards view</li>
              </ul>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
