'use client';

import { useEffect, useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchCustomers } from '@/services/customerService';
import { fetchTechnicians } from '@/services/technicianService';
import { fetchVehicles } from '@/services/vehicleService';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { Customer } from '@/lib/types';
import type { Technician } from '@/services/technicianService';
import type { Vehicle } from '@/lib/types';

const DEFAULT_BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Mobile Route 1', 'Mobile Route 2', 'Depot Dispatch'];
const REMINDER_OPTIONS = ['None', 'Confirmed', 'Reminder sent', 'Awaiting tow', 'Checked in'];

const EMPTY_FORM = { time: '', customer: '', vehicle: '', service: '', bay: '', technician: '', reminder: 'Confirmed' };

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14,
  padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
  position: 'relative',
};

export function AppointmentsView() {
  const { appointments } = useAppState();
  const dispatch = useAppDispatch();

  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [allVehicles, setAllVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<(Vehicle & { id: string })[]>([]);
  const [enableAppointmentBay, setEnableAppointmentBay] = useState(true);
  const [bays, setBays] = useState<string[]>(DEFAULT_BAYS);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchCustomers().then(setCustomers).catch(() => {});
    fetchTechnicians().then(setTechnicians).catch(() => {});
    fetchVehicles().then(v => setAllVehicles(v as (Vehicle & { id: string })[])).catch(() => {});
    fetchShopSettings().then(s => {
      setEnableAppointmentBay(s.enableAppointmentBay ?? true);
      setBays(s.appointmentBays ?? DEFAULT_BAYS);
    }).catch(() => {});
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (field === 'customer') {
      const cust = customers.find(c => c.name === value);
      const vehicles = cust ? allVehicles.filter(v => v.customerId === cust.id) : [];
      setCustomerVehicles(vehicles);
      // Auto-fill if exactly one vehicle
      if (vehicles.length === 1) {
        setForm(f => ({ ...f, customer: value, vehicle: vehicles[0].label }));
      } else {
        setForm(f => ({ ...f, customer: value, vehicle: '' }));
      }
    }
  }

  function openNew() {
    setEditingIndex(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(index: number) {
    const a = appointments[index];
    setEditingIndex(index);
    setForm({ time: a[0], customer: a[1], vehicle: a[2], service: a[3], bay: a[5], technician: a[7] ?? '', reminder: a[6] });
    const cust = customers.find(c => c.name === a[1]);
    setCustomerVehicles(cust ? allVehicles.filter(v => v.customerId === cust.id) : []);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.time || !form.customer || !form.service) return;
    const row = [form.time, form.customer, form.vehicle, form.service,
      editingIndex !== null ? appointments[editingIndex][4] : 'New Job',
      form.bay, form.reminder, form.technician] as [string, string, string, string, string, string, string, string];

    if (editingIndex !== null) {
      dispatch({ type: 'EDIT_APPOINTMENT', appointmentIndex: editingIndex, appointment: row });
    } else {
      dispatch({ type: 'ADD_APPOINTMENT', appointment: row });
    }
    setForm(EMPTY_FORM); setShowForm(false); setEditingIndex(null);
  }

  function handleDelete(index: number) {
    if (!confirm('Remove this appointment?')) return;
    dispatch({ type: 'DELETE_APPOINTMENT', appointmentIndex: index });
    notify('Appointment removed.');
  }

  return (
    <>
      <Panel title="Appointments" hint="Daily booking list — customer, vehicle, bay/route assignment, technician, and check-in">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={openNew}>+ Book Appointment</button>
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(0,160,80,0.12)', border: '1px solid rgba(0,160,80,0.3)', borderRadius: 8, color: '#00a050', fontSize: 14 }}>
            {toast}
          </div>
        )}

        <table>
          <thead>
            <tr><th>Time</th><th>Customer</th><th>Vehicle</th><th>Requested Service</th><th>Job Card</th><th>Technician</th>{enableAppointmentBay && <th>Bay / Route</th>}<th>Reminder</th><th>Action</th></tr>
          </thead>
          <tbody>
            {appointments.map((a, i) => (
              <tr key={i}>
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
                    <button className="mini-btn" onClick={() => dispatch({ type: 'CHECK_IN', appointmentIndex: i })}>Check in</button>
                    <button className="mini-btn" onClick={() => openEdit(i)}>Edit</button>
                    <button className="mini-btn" style={{ color: 'var(--red,#cc0000)' }} onClick={() => handleDelete(i)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {showForm && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditingIndex(null); } }}>
          <div style={modal}>
            <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700 }}>
              {editingIndex !== null ? 'Edit Appointment' : 'Book Appointment'}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="login-field">
                <label>Time *</label>
                <input type="time" value={form.time} onChange={e => set('time', e.target.value)} required />
              </div>

              <div className="login-field">
                <label>Customer *</label>
                <select value={form.customer} onChange={e => set('customer', e.target.value)} required>
                  <option value="">— Select customer —</option>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  {/* Keep the existing name if not in the list */}
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
                  <label>Bay / Route</label>
                  <select value={form.bay} onChange={e => set('bay', e.target.value)}>
                    <option value="">— Select bay or route —</option>
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
                <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingIndex(null); setForm(EMPTY_FORM); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingIndex !== null ? 'Update Appointment' : 'Book Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
