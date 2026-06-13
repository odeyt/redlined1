'use client';

import { useAppState, useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';

export function AppointmentsView() {
  const { appointments } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <Panel title="Appointments" hint="Daily booking list — customer, vehicle, bay/route assignment, technician, and check-in">
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
  );
}
