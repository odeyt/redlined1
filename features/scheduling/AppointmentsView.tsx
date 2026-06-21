'use client';

import { useEffect, useState } from 'react';
import { useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchCustomers } from '@/services/customerService';
import { fetchTechnicians } from '@/services/technicianService';
import { fetchVehicles } from '@/services/vehicleService';
import { fetchShopSettings } from '@/services/shopSettingsService';
import {
  fetchAppointments, createAppointment, updateAppointment, deleteAppointment,
  type AppointmentRecord,
} from '@/services/appointmentService';
import type { Customer } from '@/lib/types';
import type { Technician } from '@/services/technicianService';
import type { Vehicle } from '@/lib/types';

const DEFAULT_BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Mobile Route 1', 'Mobile Route 2', 'Depot Dispatch'];
const REMINDER_OPTIONS = ['None', 'Confirmed', 'Reminder sent', 'Awaiting tow', 'Checked in'];

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { date: today, time: '', customer: '', vehicle: '', service: '', bay: '', technician: '', reminder: 'Confirmed' };

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
  const [allVehicles, setAllVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [enableAppointmentBay, setEnableAppointmentBay] = useState(true);
  const [bays, setBays] = useState<string[]>(DEFAULT_BAYS);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    // Load form data (customers, vehicles, settings) independently from appointments
    // so a failing appointments query never breaks the booking form
    Promise.all([
      fetchCustomers(),
      fetchTechnicians(),
      fetchVehicles(),
      fetchShopSettings(),
    ]).then(([custs, techs, vehs, settings]) => {
      setCustomers(custs);
      setTechnicians(techs);
      setAllVehicles(vehs as (Vehicle & { id: string })[]);
      setEnableAppointmentBay(settings.enableAppointmentBay ?? true);
      setBays(settings.appointmentBays ?? DEFAULT_BAYS);
    }).catch(() => {});

    fetchAppointments()
      .then(records => setAppts(records))
      .catch(() => {})
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
      const vehicles = cust ? allVehicles.filter(v => v.customerId === cust.id) : [];
      setCustomerVehicles(vehicles);
      if (vehicles.length === 1) {
        setForm(f => ({ ...f, customer: value, vehicle: vehicles[0].label }));
      } else {
        setForm(f => ({ ...f, customer: value, vehicle: '' }));
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
    const cust = customers.find(c => c.name === a[1]);
    setCustomerVehicles(cust ? allVehicles.filter(v => v.customerId === cust.id) : []);
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
    } catch {
      notify('Failed to save appointment. Please try again.');
    }
    setForm(EMPTY_FORM); setShowForm(false); setEditingId(null);
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
                <label>Vehicle</label>
                {customerVehicles.length > 0 ? (
                  <select value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
                    <option value="">— Select vehicle —</option>
                    {customerVehicles.map(v => (
                      <option key={v.id} value={v.label}>{v.label}{v.plate ? ` · ${v.plate}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input placeholder="e.g. 2021 Toyota RAV4" value={form.vehicle} onChange={e => set('vehicle', e.target.value)} />
                )}
              </div>

              <div className="login-field">
                <label>Requested Service *</label>
                <input placeholder="e.g. Oil change, Brake inspection" value={form.service} onChange={e => set('service', e.target.value)} required />
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
                <label>Technician</label>
                <select value={form.technician} onChange={e => set('technician', e.target.value)}>
                  <option value="">— Assign technician —</option>
                  {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
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
    </>
  );
}
