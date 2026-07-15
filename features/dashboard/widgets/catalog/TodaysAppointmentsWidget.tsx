'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import { fetchAppointments, type AppointmentRecord } from '@/services/appointmentService';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function TodaysAppointmentsWidget({ onNav: nav }: WidgetProps) {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    fetchAppointments()
      .then(all => setAppointments(all.filter(a => a.date === todayStr)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <Panel title="Today's Appointments" hint="Scheduled for today">
      {appointments.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No appointments scheduled today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {appointments.map(a => {
            const [time, customer, vehicle] = a.data;
            return (
              <div key={a.id} onClick={() => nav('appointments')} className="dash-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{time} — {customer}</span>
                <span style={{ color: 'var(--muted)' }}>{vehicle}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
