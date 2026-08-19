'use client';

/**
 * Attendance and leave.
 *
 * Two tabs because they are two jobs done at different moments: marking the
 * day happens once each morning across everyone, and leave is handled one
 * request at a time whenever it arrives.
 *
 * Deliberately NOT merged with Time Tracking. That screen records how long a
 * job took, for pricing; this one records whether a person was at work. A
 * technician who spent Tuesday cleaning the workshop was at work and has no
 * time entry, and a day of leave has no clock times at all.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchAttendance, recordAttendance, fetchLeaveTypes, fetchLeaveRequests,
  requestLeave, decideLeave, cancelLeave, leaveDayCount,
  ATTENDANCE_STATUSES,
  type AttendanceDay, type AttendanceStatus, type LeaveRequest, type LeaveType,
} from '@/services/attendanceService';
import { fetchEmployees, type Employee } from '@/services/employeeService';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Colour by what the status means, not by how many there are. */
const STATUS_COLOR: Record<AttendanceStatus, string> = {
  'Present':  '#059669',
  'Late':     '#d97706',
  'Half day': '#d97706',
  'Absent':   '#dc2626',
  'Leave':    '#7c3aed',
  'Holiday':  '#0891b2',
  'Rest day': '#64748b',
};

const LEAVE_COLOR: Record<string, string> = {
  Pending:   '#d97706',
  Approved:  '#059669',
  Rejected:  '#dc2626',
  Cancelled: '#64748b',
};

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card card-hero" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

export function AttendanceView() {
  const [tab, setTab] = useState<'attendance' | 'leave'>('attendance');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Attendance tab
  const [date, setDate] = useState(today());
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [loadingDays, setLoadingDays] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Leave tab
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  useEffect(() => {
    fetchEmployees()
      .then(setEmployees)
      .catch(e => setError(errMsg(e, 'Could not load the people list.')));
  }, []);

  const loadDays = useCallback(async () => {
    setLoadingDays(true);
    try {
      setDays(await fetchAttendance(date, date));
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load attendance.'));
    } finally {
      setLoadingDays(false);
    }
  }, [date]);

  const loadLeave = useCallback(async () => {
    setLoadingLeave(true);
    try {
      const [t, r] = await Promise.all([fetchLeaveTypes(), fetchLeaveRequests()]);
      setTypes(t);
      setRequests(r);
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load leave.'));
    } finally {
      setLoadingLeave(false);
    }
  }, []);

  useEffect(() => { void loadDays(); }, [loadDays]);
  useEffect(() => { void loadLeave(); }, [loadLeave]);

  const dayFor = (employeeId: string) => days.find(d => d.employeeId === employeeId);
  const nameFor = (employeeId: string) =>
    employees.find(e => e.id === employeeId)?.fullName ?? 'Unknown';

  async function setStatus(employeeId: string, status: AttendanceStatus) {
    setSavingId(employeeId);
    try {
      const saved = await recordAttendance({ employeeId, workDate: date, status });
      setDays(prev => [...prev.filter(d => d.employeeId !== employeeId), saved]);
      setError('');
    } catch (e) {
      setError(errMsg(e, 'That did not save.'));
    } finally {
      setSavingId(null);
    }
  }

  async function submitRequest() {
    if (!form.employeeId || !form.leaveTypeId) {
      setError('Choose a person and a type of leave.');
      return;
    }
    setSubmitting(true);
    try {
      await requestLeave(form);
      setShowForm(false);
      setForm({ employeeId: '', leaveTypeId: '', startDate: today(), endDate: today(), halfDay: false, reason: '' });
      await loadLeave();
      notify('Leave requested');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'The request was not saved.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(request: LeaveRequest, decision: 'Approved' | 'Rejected') {
    try {
      const result = await decideLeave(request.id, decision);
      await Promise.all([loadLeave(), loadDays()]);
      // The leave IS granted at this point. Saying only "approved" when the
      // calendar did not get the days would leave someone off work with
      // nothing showing it.
      if (result.dayError) {
        setError(
          'Leave was ' + decision.toLowerCase() + ', but the days could not be written to the calendar: ' +
          result.dayError + ' — mark them by hand on the Attendance tab.',
        );
      } else if (decision === 'Approved') {
        notify('Approved — ' + result.daysWritten + ' day' + (result.daysWritten === 1 ? '' : 's') + ' marked as leave');
      } else {
        notify('Rejected');
      }
    } catch (e) {
      setError(errMsg(e, 'That decision was not saved.'));
    }
  }

  async function withdraw(request: LeaveRequest) {
    if (!confirm('Cancel this leave request for ' + nameFor(request.employeeId) + '?')) return;
    try {
      await cancelLeave(request.id);
      await loadLeave();
      // Said explicitly: cancelling does not un-mark the days, because whether
      // they actually worked them is a different fact and guessing would
      // overwrite a real record.
      notify('Cancelled — any days already marked as leave are unchanged');
    } catch (e) {
      setError(errMsg(e, 'That was not cancelled.'));
    }
  }

  const pending = requests.filter(r => r.status === 'Pending');
  const marked = days.length;
  const present = days.filter(d => d.status === 'Present' || d.status === 'Late' || d.status === 'Half day').length;
  const away = days.filter(d => d.status === 'Absent' || d.status === 'Leave').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Attendance &amp; Leave</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['attendance', 'leave'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="btn"
              style={{
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: '1px solid var(--border)',
                textTransform: 'capitalize',
              }}
            >
              {t}
              {t === 'leave' && pending.length > 0 ? ' (' + pending.length + ')' : ''}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      {toast && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(5,150,105,0.1)', color: '#059669', fontSize: 13 }}>
          {toast}
        </div>
      )}

      {tab === 'attendance' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="On the list" value={String(employees.length)} />
            <StatCard label="Marked" value={marked + ' of ' + employees.length} />
            <StatCard label="At work" value={String(present)} color="#059669" />
            <StatCard label="Away" value={String(away)} color="#dc2626" />
          </div>

          <Panel title="Mark the day">
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Date</label>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={e => setDate(e.target.value)}
                className="input"
                style={{ width: 170 }}
              />
            </div>

            {loadingDays ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
            ) : employees.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                No people yet. Add them in the Employees module first — attendance is recorded against a
                person, not against a job.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {employees.map(employee => {
                  const day = dayFor(employee.id);
                  return (
                    <div
                      key={employee.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                        borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ fontWeight: 600, minWidth: 160 }}>{employee.fullName}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {ATTENDANCE_STATUSES.map(status => {
                          const active = day?.status === status;
                          return (
                            <button
                              key={status}
                              disabled={savingId === employee.id}
                              onClick={() => setStatus(employee.id, status)}
                              className="btn"
                              style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                background: active ? STATUS_COLOR[status] : 'transparent',
                                color: active ? '#fff' : 'var(--muted)',
                                border: '1px solid ' + (active ? STATUS_COLOR[status] : 'var(--border)'),
                                opacity: savingId === employee.id ? 0.5 : 1,
                              }}
                            >
                              {status}
                            </button>
                          );
                        })}
                      </div>
                      {!day && (
                        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>not marked</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === 'leave' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
              {showForm ? 'Cancel' : '+ Request leave'}
            </button>
          </div>

          {showForm && (
            <Panel title="New leave request">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Person</label>
                  <select className="input" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">— choose —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Type</label>
                  <select className="input" value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
                    <option value="">— choose —</option>
                    {types.filter(t => t.isActive).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.isPaid ? '' : ' (unpaid)'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>From</label>
                  <input type="date" className="input" value={form.startDate}
                    onChange={e => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>To</label>
                  <input type="date" className="input" value={form.endDate} min={form.startDate}
                    onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Reason</label>
                  <input className="input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={form.halfDay}
                      disabled={form.startDate !== form.endDate}
                      onChange={e => setForm({ ...form, halfDay: e.target.checked })}
                    />
                    Half day
                  </label>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary" disabled={submitting} onClick={submitRequest}>
                  {submitting ? 'Saving…' : 'Submit request'}
                </button>
              </div>
            </Panel>
          )}

          <Panel title={'Leave requests' + (pending.length > 0 ? ' — ' + pending.length + ' waiting' : '')}>
            {loadingLeave ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
            ) : requests.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No leave has been requested yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requests.map(request => (
                  <div
                    key={request.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 150, fontWeight: 600 }}>{nameFor(request.employeeId)}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', minWidth: 200 }}>
                      {request.startDate}
                      {request.endDate !== request.startDate ? ' → ' + request.endDate : ''}
                      {' · '}
                      {leaveDayCount(request)} day{leaveDayCount(request) === 1 ? '' : 's'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>{request.reason}</div>
                    <span
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                        color: LEAVE_COLOR[request.status],
                        border: '1px solid ' + LEAVE_COLOR[request.status],
                      }}
                    >
                      {request.status}
                    </span>
                    {request.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" style={{ fontSize: 12, color: '#059669', borderColor: '#059669' }}
                          onClick={() => decide(request, 'Approved')}>Approve</button>
                        <button className="btn" style={{ fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={() => decide(request, 'Rejected')}>Reject</button>
                      </div>
                    )}
                    {request.status === 'Approved' && (
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => withdraw(request)}>Cancel</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
