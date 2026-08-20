'use client';

/**
 * Who is at work today.
 *
 * The one question an owner actually asks first thing in the morning, and
 * until M6 nothing in this system could answer it.
 *
 * "Not marked" is shown as its own number rather than folded into absent.
 * Somebody nobody has marked yet is not the same as somebody who did not come
 * in, and treating them as absent is how attendance records become fiction.
 */

import { useEffect, useState } from 'react';
import { fetchAttendance, type AttendanceDay } from '@/services/attendanceService';
import { fetchEmployees, type Employee } from '@/services/employeeService';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

const today = () => new Date().toISOString().slice(0, 10);

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ minWidth: 70 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

export function WhoIsInWidget({ onNav }: WidgetProps) {
  const [days, setDays] = useState<AttendanceDay[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([fetchAttendance(today(), today()), fetchEmployees()])
      .then(([d, e]) => { setDays(d); setEmployees(e); })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Could not load attendance.</div>;
  }
  if (!days) return null;

  const present = days.filter(d => d.status === 'Present' || d.status === 'Late' || d.status === 'Half day').length;
  const leave   = days.filter(d => d.status === 'Leave').length;
  const absent  = days.filter(d => d.status === 'Absent').length;
  const off     = days.filter(d => d.status === 'Holiday' || d.status === 'Rest day').length;
  const unmarked = Math.max(0, employees.length - days.length);

  const late = days.filter(d => d.status === 'Late').map(d =>
    employees.find(e => e.id === d.employeeId)?.fullName).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="at work" value={present} color="#059669" />
        {leave > 0 && <Stat label="on leave" value={leave} color="#7c3aed" />}
        {absent > 0 && <Stat label="absent" value={absent} color="#dc2626" />}
        {off > 0 && <Stat label="day off" value={off} />}
        {unmarked > 0 && <Stat label="not marked" value={unmarked} color="#d97706" />}
      </div>

      {late.length > 0 && (
        <div style={{ fontSize: 12, color: '#d97706' }}>
          Late: {late.join(', ')}
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => onNav('attendance')}>
          {unmarked > 0 ? 'Mark the day' : 'Attendance'}
        </button>
      </div>
    </div>
  );
}
