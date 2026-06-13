'use client';

import { useEffect, useState } from 'react';
import { useAppState, useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchCustomers } from '@/services/customerService';
import { fetchTechnicians } from '@/services/technicianService';
import type { Customer } from '@/lib/types';
import type { Technician } from '@/services/technicianService';

const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Mobile Route 1', 'Mobile Route 2', 'Depot Dispatch'];

const REMINDER_OPTIONS = ['None', 'Confirmed', 'Reminder sent', 'Awaiting tow', 'Checked in'];

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14,
  padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
};

export function AppointmentsView() {
  const { appointments } = useAppState();
  const dispatch = useAppDispatch();

  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({
    time: '', customer: '', vehicle: '', service: '',
    bay: '', technician: '', reminder: 'Confirmed',
  });

  useEffect(() => {
    fetchCustomers().then(setCustomers).catch(() => {});
    fetchTechnicians().then(setTechnicians).catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.time || !form.customer || !form.service) return;
    dispatch({
      type: 'ADD_APPOINTMENT',
      appointment: [form.time, form.customer, form.vehicle, form.service, 'New Job', form.bay, form.reminder],
    });
    setToast('Appointment booked!');
    setTimeout(() => setToast(''), 3000);
    setForm({ time: '', customer: '', vehicle: '', service: '', bay: '', technician: '', reminder: 'Confirmed' });
    setShowForm(false);
  }

  return (
    <>
      <Panel title="Appointments" hint="Daily booking list — customer, vehicle, bay/route assignment, technician, and check-in">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Book Appointment</button>
        </div>

        {toast && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(0,160,80,0.12)', border: '1px solid rgba(0,160,80,0.3)', borderRadius: 8, color: '#00a050', fontSize: 14 }}>
            {toast}
          </div>
        )}

        <table>
          <thead>
            <tr><th>Time</th><th>Customer</th><th>Vehicle</th><th>Requested Service</th><th>Job Card</th><th>Bay / Route</th><th>Reminder</th><th>Action</th></tr>
          </thead>
          <tbody>
            {appointments.map((a, i) => (
              <tr key={i}>
                <td>{a[0]}</td>
                <td>{a[1]}</td>
                <td>{a[2]}</td>
                <td>{a[3]}</td>
                <td><Badge text={a[4]} /></td>
                <td>{a[5]}</td>
                <td><Badge text={a[6]} /></td>
                <td>
                  <button className="mini-btn" onClick={() => dispatch({ type: 'CHECK_IN', appointmentIndex: i })}>Check in</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {showForm && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={modal}>
            <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700 }}>Book Appointment</h2>
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
                </select>
              </div>

              <div className="login-field">
                <label>Vehicle</label>
                <input placeholder="e.g. 2021 Toyota RAV4" value={form.vehicle} onChange={e => set('vehicle', e.target.value)} />
              </div>

              <div className="login-field">
                <label>Requested Service *</label>
                <input placeholder="e.g. Oil change, Brake inspection" value={form.service} onChange={e => set('service', e.target.value)} required />
              </div>

              <div className="login-field">
                <label>Bay / Route</label>
                <select value={form.bay} onChange={e => set('bay', e.target.value)}>
                  <option value="">— Select bay or route —</option>
                  {BAYS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

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
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Book Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
