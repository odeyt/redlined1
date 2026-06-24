'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchCustomers } from '@/services/customerService';
import { fetchTechnicians } from '@/services/technicianService';
import { fetchVehicles } from '@/services/vehicleService';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { PhotoGalleryModal } from '@/components/PhotoGalleryModal';
import { fetchEntityImages, uploadEntityImage, deleteEntityImage, saveEntityImageOrder } from '@/services/entityImageService';

const SERVICE_SUGGESTIONS = [
  'Oil Change – Conventional',
  'Oil Change – Synthetic',
  'Oil Change – High Mileage',
  'Tire Rotation',
  'Tire Rotation & Balance',
  'Tire Replacement – All Four',
  'Brake Inspection',
  'Brake Pad Replacement – Front',
  'Brake Pad Replacement – Rear',
  'Brake Pad & Rotor Replacement',
  'Battery Replacement',
  'Battery Test',
  'Air Filter Replacement',
  'Cabin Air Filter Replacement',
  'Transmission Service',
  'Transmission Fluid Flush',
  'Coolant Flush',
  'Power Steering Flush',
  'Brake Fluid Flush',
  'Fuel System Cleaning',
  'Spark Plug Replacement',
  'Timing Belt Replacement',
  'Serpentine Belt Replacement',
  'AC Recharge',
  'AC Inspection',
  'Engine Diagnostic',
  'Check Engine Light Diagnosis',
  'Wheel Alignment',
  'Suspension Inspection',
  'Shocks & Struts Replacement',
  'CV Axle Replacement',
  'Alternator Replacement',
  'Starter Replacement',
  'Radiator Replacement',
  'Water Pump Replacement',
  'Thermostat Replacement',
  'Pre-Purchase Inspection',
  'State Inspection',
  'Emissions Test',
  '30,000 Mile Service',
  '60,000 Mile Service',
  '90,000 Mile Service',
  'Multi-Point Inspection',
  'Windshield Wiper Replacement',
  'Headlight Restoration',
  'Exhaust Repair',
  'Catalytic Converter Replacement',
];
import {
  fetchAppointments, createAppointment, updateAppointment, deleteAppointment,
  type AppointmentRecord,
} from '@/services/appointmentService';
import type { Customer } from '@/lib/types';
import type { Technician } from '@/services/technicianService';
import type { Vehicle } from '@/lib/types';

const DEFAULT_BAYS = ['D1 Shop 1', 'D1 Shop 2'];
const REMINDER_OPTIONS = ['None', 'Confirmed', 'Reminder sent', 'Awaiting tow', 'Checked in'];

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { date: today, time: '', customer: '', vehicle: '', service: '', bay: '', technician: '', reminder: 'Confirmed' };

function parseTechs(val: string): string[] {
  return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14,
  padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
  position: 'relative',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function AppointmentsView() {
  const dispatch = useAppDispatch();

  const [appts, setAppts] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [serviceSuggestions, setServiceSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [enableAppointmentBay, setEnableAppointmentBay] = useState(true);
  const [bays, setBays] = useState<string[]>(DEFAULT_BAYS);
  const [toast, setToast] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoAppt, setPhotoAppt] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    // Load form data (customers, vehicles, settings) independently from appointments
    // so a failing appointments query never breaks the booking form
    Promise.all([
      fetchCustomers(),
      fetchTechnicians(),
      fetchShopSettings(),
    ]).then(([custs, techs, settings]) => {
      setCustomers(custs);
      setTechnicians(techs);
      setEnableAppointmentBay(settings.enableAppointmentBay ?? true);
      setBays(settings.appointmentBays ?? DEFAULT_BAYS);
    }).catch(() => {});

    fetchAppointments()
      .then(records => { setAppts(records); setFetchError(''); })
      .catch(err => setFetchError(err?.message ?? 'Unknown error loading appointments'))
      .finally(() => setLoading(false));

    function onSettingsUpdate(e: Event) {
      const d = (e as CustomEvent).detail ?? {};
      if (d.appointmentBays !== undefined) setBays(d.appointmentBays);
      if (d.enableAppointmentBay !== undefined) setEnableAppointmentBay(d.enableAppointmentBay);
    }
    window.addEventListener('shop-settings-updated', onSettingsUpdate);
    return () => window.removeEventListener('shop-settings-updated', onSettingsUpdate);
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (field === 'customer') {
      const cust = customers.find(c => c.name === value);
      setCustomerVehicles([]);
      setForm(f => ({ ...f, customer: value, vehicle: '' }));
      if (cust) {
        setVehiclesLoading(true);
        fetchVehicles()
          .then(all => {
            const vehs = (all as (Vehicle & { id: string })[]).filter(v => v.customerId === cust.id);
            setCustomerVehicles(vehs);
            if (vehs.length === 1) {
              setForm(f => ({ ...f, vehicle: vehs[0].label }));
            }
          })
          .catch(() => {})
          .finally(() => setVehiclesLoading(false));
      }
    }
    if (field === 'service') {
      const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length > 0 && value.trim().length >= 2) {
        const matches = SERVICE_SUGGESTIONS.filter(s =>
          words.every(w => s.toLowerCase().includes(w))
        );
        setServiceSuggestions(matches);
        setShowSuggestions(matches.length > 0);
      } else {
        setShowSuggestions(false);
      }
    }
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setCustomerVehicles([]);
    setShowForm(true);
  }

  function openEdit(record: AppointmentRecord) {
    const a = record.data;
    setEditingId(record.id);
    setForm({ date: record.date, time: a[0], customer: a[1], vehicle: a[2], service: a[3], bay: a[5], technician: a[7] ?? '', reminder: a[6] });
    setCustomerVehicles([]);
    const cust = customers.find(c => c.name === a[1]);
    if (cust) {
      setVehiclesLoading(true);
      fetchVehicles()
        .then(all => setCustomerVehicles((all as (Vehicle & { id: string })[]).filter(v => v.customerId === cust.id)))
        .catch(() => {})
        .finally(() => setVehiclesLoading(false));
    }
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.time || !form.customer || !form.service) return;
    const row = [
      form.time, form.customer, form.vehicle, form.service,
      editingId ? (appts.find(a => a.id === editingId)?.data[4] ?? 'New Job') : 'New Job',
      form.bay, form.reminder, form.technician,
    ] as [string, string, string, string, string, string, string, string];

    try {
      if (editingId) {
        await updateAppointment(editingId, form.date, row);
        setAppts(prev => prev.map(a => a.id === editingId ? { id: editingId, date: form.date, data: row } : a));
        notify(`Appointment updated for ${row[1]}.`);
      } else {
        const created = await createAppointment(form.date, row);
        setAppts(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date) || a.data[0].localeCompare(b.data[0])));
        notify(`Appointment booked for ${row[1]}.`);
      }
      setForm(EMPTY_FORM); setShowForm(false); setEditingId(null);
    } catch (err: unknown) {
      notify('Failed to save appointment: ' + (err instanceof Error ? err.message : 'Please try again.'));
    }
  }

  async function handleCheckIn(record: AppointmentRecord) {
    const updated = [...record.data] as typeof record.data;
    updated[6] = 'Checked in';
    try {
      await updateAppointment(record.id, record.date, updated);
      setAppts(prev => prev.map(a => a.id === record.id ? { ...a, data: updated } : a));
      dispatch({ type: 'NOTIFY', message: `${record.data[1]} checked in for ${record.data[3]}.` });
    } catch {
      notify('Check-in failed. Please try again.');
    }
  }

  async function handleDelete(record: AppointmentRecord) {
    if (!confirm('Remove this appointment?')) return;
    try {
      await deleteAppointment(record.id);
      setAppts(prev => prev.filter(a => a.id !== record.id));
      notify('Appointment removed.');
    } catch {
      notify('Delete failed. Please try again.');
    }
  }

  const colSpan = enableAppointmentBay ? 10 : 9;

  return (
    <>
      <Panel title="Appointments" hint="Daily booking list — customer, vehicle, bay/location assignment, technician, and check-in">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={openNew}>+ Book Appointment</button>
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(0,160,80,0.12)', border: '1px solid rgba(0,160,80,0.3)', borderRadius: 8, color: '#00a050', fontSize: 14 }}>
            {toast}
          </div>
        )}

        {fetchError && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            <strong>⚠ Error loading appointments:</strong> {fetchError}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading appointments…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Customer</th><th>Vehicle</th><th>Requested Service</th><th>Job Card</th>
                <th>Technician</th>
                {enableAppointmentBay && <th>Bay / Location</th>}
                <th>Reminder</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {appts.length === 0 && (
                <tr><td colSpan={colSpan} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>No appointments yet. Click "+ Book Appointment" to add one.</td></tr>
              )}
              {appts.map((record) => {
                const a = record.data;
                return (
                  <tr key={record.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDate(record.date)}</td>
                    <td>{a[0]}</td>
                    <td>{a[1]}</td>
                    <td>{a[2]}</td>
                    <td>{a[3]}</td>
                    <td><Badge text={a[4]} /></td>
                    <td>{a[7] ? <span style={{ background: 'rgba(204,0,0,0.08)', color: 'var(--accent)', borderRadius: 5, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{a[7]}</span> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>}</td>
                    {enableAppointmentBay && <td style={{ color: 'var(--muted)', fontSize: 12 }}>{a[5] || '—'}</td>}
                    <td><Badge text={a[6]} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="mini-btn" onClick={() => handleCheckIn(record)}>Check in</button>
                        <button className="mini-btn" onClick={() => openEdit(record)}>Edit</button>
                        <button className="mini-btn" onClick={() => setPhotoAppt({ id: record.id, label: `${a[0]} — ${a[1]}` })}>📷</button>
                        <button className="mini-btn" style={{ color: 'var(--red,#cc0000)' }} onClick={() => handleDelete(record)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {showForm && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}>
          <div style={modal}>
            <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700 }}>
              {editingId !== null ? 'Edit Appointment' : 'Book Appointment'}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="login-field">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>

              <div className="login-field">
                <label>Time *</label>
                <input type="time" value={form.time} onChange={e => set('time', e.target.value)} required />
              </div>

              <div className="login-field">
                <label>Customer *</label>
                <select value={form.customer} onChange={e => set('customer', e.target.value)} required>
                  <option value="">— Select customer —</option>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {form.customer && !customers.find(c => c.name === form.customer) && (
                    <option value={form.customer}>{form.customer}</option>
                  )}
                </select>
              </div>

              <div className="login-field">
                <label>Vehicle {vehiclesLoading && <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>loading…</span>}</label>
                {customerVehicles.length > 0 ? (
                  <select value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
                    <option value="">— Select vehicle —</option>
                    {customerVehicles.map(v => (
                      <option key={v.id} value={v.label}>{v.label}</option>
                    ))}
                  </select>
                ) : (
                  <input placeholder={form.customer ? 'No registered vehicles — type manually' : 'Select a customer first'} value={form.vehicle} onChange={e => set('vehicle', e.target.value)} />
                )}
              </div>

              <div className="login-field">
                <label>Requested Service *</label>
                <input
                  placeholder="Start typing: Oil, Brake, Tire…"
                  value={form.service}
                  onChange={e => set('service', e.target.value)}
                  onFocus={() => {
                    const words = form.service.trim().toLowerCase().split(/\s+/).filter(Boolean);
                    if (words.length > 0 && form.service.trim().length >= 2) {
                      const matches = SERVICE_SUGGESTIONS.filter(s => words.every(w => s.toLowerCase().includes(w)));
                      setServiceSuggestions(matches);
                      setShowSuggestions(matches.length > 0);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  required
                  autoComplete="off"
                />
                {showSuggestions && serviceSuggestions.length > 0 && (
                  <div style={{
                    marginTop: 4, background: 'var(--surface)',
                    border: '1px solid var(--line)', borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    maxHeight: 180, overflowY: 'auto',
                  }}>
                    {serviceSuggestions.map(s => (
                      <div
                        key={s}
                        onMouseDown={() => { setForm(f => ({ ...f, service: s })); setShowSuggestions(false); }}
                        style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {enableAppointmentBay && (
                <div className="login-field">
                  <label>Bay / Location</label>
                  <select value={form.bay} onChange={e => set('bay', e.target.value)}>
                    <option value="">— Select bay or location —</option>
                    {bays.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              <div className="login-field">
                <label>Technician{parseTechs(form.technician).length > 0 && <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>({parseTechs(form.technician).length} selected)</span>}</label>
                <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {technicians.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>No technicians added yet</span>}
                  {technicians.map(t => {
                    const selected = parseTechs(form.technician).includes(t.name);
                    return (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6, background: selected ? 'rgba(204,0,0,0.08)' : 'transparent', border: selected ? '1px solid rgba(204,0,0,0.3)' : '1px solid transparent', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            const current = parseTechs(form.technician);
                            const next = selected ? current.filter(n => n !== t.name) : [...current, t.name];
                            setForm(f => ({ ...f, technician: next.join(', ') }));
                          }}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        {t.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="login-field">
                <label>Reminder Status</label>
                <select value={form.reminder} onChange={e => set('reminder', e.target.value)}>
                  {REMINDER_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingId !== null ? 'Update Appointment' : 'Book Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {photoAppt && (
        <PhotoGalleryModal
          title={photoAppt.label}
          fetchImages={() => fetchEntityImages('appointment', photoAppt.id)}
          uploadImage={(file, label) => uploadEntityImage('appointment', photoAppt.id, file, label)}
          deleteImage={deleteEntityImage}
          saveOrder={(ids) => saveEntityImageOrder('appointment', photoAppt.id, ids)}
          onClose={() => setPhotoAppt(null)}
        />
      )}
    </>
  );
}
