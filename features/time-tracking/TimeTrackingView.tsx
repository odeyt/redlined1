'use client';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchTimeEntries, clockIn, clockOut, deleteTimeEntry,
  elapsedMinutes, formatDuration, type TimeEntry,
} from '@/services/timeTrackingService';
import { fetchTechnicians, type Technician } from '@/services/technicianService';

type DateFilter = 'today' | 'week' | 'all';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card card-hero" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

export function TimeTrackingView() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Clock-in form
  const [techName, setTechName] = useState('');
  const [jobRef, setJobRef] = useState('');
  const [notes, setNotes] = useState('');
  const [clocking, setClocking] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');

  // Live elapsed ticker
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    load();
    fetchTechnicians().then(setTechnicians).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    setLoading(true);
    try {
      setEntries(await fetchTimeEntries());
    } catch (e: unknown) {
      setError(errMsg(e, 'Failed to load time entries'));
    } finally {
      setLoading(false);
    }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleClockIn() {
    if (!techName.trim()) return;
    setClocking(true);
    try {
      const entry = await clockIn({ technicianName: techName.trim(), jobCardNumber: jobRef.trim() || undefined, notes: notes.trim() || undefined });
      setEntries(prev => [entry, ...prev]);
      setJobRef(''); setNotes('');
      notify(`${entry.technicianName} clocked in.`);
    } catch (e: unknown) {
      setError(errMsg(e, 'Clock-in failed'));
    } finally {
      setClocking(false);
    }
  }

  async function handleClockOut(id: string) {
    try {
      const updated = await clockOut(id);
      setEntries(prev => prev.map(e => e.id === id ? updated : e));
      const mins = elapsedMinutes(updated.clockIn);
      notify(`Clocked out — ${formatDuration(mins)} logged.`);
    } catch (e: unknown) {
      setError(errMsg(e, 'Clock-out failed'));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this time entry? This cannot be undone.')) return;
    try {
      await deleteTimeEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (e: unknown) {
      setError(errMsg(e, 'Delete failed'));
    }
  }

  function exportCSV() {
    const rows = [
      ['Technician', 'Job Card', 'Clock In', 'Clock Out', 'Duration', 'Notes'],
      ...filtered.map(e => [
        e.technicianName,
        e.jobCardNumber ?? '',
        new Date(e.clockIn).toLocaleString(),
        e.clockOut ? new Date(e.clockOut).toLocaleString() : 'Active',
        e.clockOut ? formatDuration(Math.floor((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000)) : '',
        e.notes,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `time-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ── derived ──
  const active = entries.filter(e => !e.clockOut);
  const completed = entries.filter(e => !!e.clockOut);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - (now.getDay() * 86400000);

  const filtered = entries.filter(e => {
    const t = new Date(e.clockIn).getTime();
    if (dateFilter === 'today') return t >= todayStart;
    if (dateFilter === 'week') return t >= weekStart;
    return true;
  });

  const todayMins = completed
    .filter(e => new Date(e.clockIn).getTime() >= todayStart)
    .reduce((s, e) => s + Math.floor((new Date(e.clockOut!).getTime() - new Date(e.clockIn).getTime()) / 60000), 0);

  const weekMins = completed
    .filter(e => new Date(e.clockIn).getTime() >= weekStart)
    .reduce((s, e) => s + Math.floor((new Date(e.clockOut!).getTime() - new Date(e.clockIn).getTime()) / 60000), 0);

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%',
  };

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      {/* Stats */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <StatCard label="Hours Today" value={formatDuration(todayMins)} color="#4caf50" />
        <StatCard label="Hours This Week" value={formatDuration(weekMins)} color="#2196f3" />
        <StatCard label="Active Now" value={String(active.length)} color={active.length > 0 ? '#ff9800' : 'var(--text)'} />
        <StatCard label="Total Entries" value={String(entries.length)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 16, alignItems: 'start' }}>

        {/* ── Clock In Form ── */}
        <Panel title="Clock In" hint="Start tracking time for a technician">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Technician *</label>
              {technicians.length > 0 ? (
                <select value={techName} onChange={e => setTechName(e.target.value)} style={inputStyle}>
                  <option value="">— Select technician —</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={techName}
                  onChange={e => setTechName(e.target.value)}
                  placeholder="Technician name"
                  style={inputStyle}
                />
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Job Card # (optional)</label>
              <input value={jobRef} onChange={e => setJobRef(e.target.value)} placeholder="e.g. JC-1042" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Oil change + tire rotation" style={inputStyle} />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: 12, fontSize: 15, marginTop: 4 }}
              onClick={handleClockIn}
              disabled={clocking || !techName.trim()}
            >
              {clocking ? 'Clocking In…' : '⏱ Clock In'}
            </button>
          </div>

          {/* Active sessions */}
          {active.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="section-label">
                Active Sessions ({active.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {active.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(76,175,80,0.07)', border: '1px solid rgba(76,175,80,0.25)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.technicianName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {e.jobCardNumber ? `${e.jobCardNumber} · ` : ''}{formatDuration(elapsedMinutes(e.clockIn))} elapsed
                      </div>
                    </div>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50', flexShrink: 0 }} />
                    <button
                      className="btn"
                      onMouseEnter={ev => { ev.currentTarget.style.background = '#4caf50'; ev.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = '#4caf50'; }}
                      style={{ fontSize: 12, padding: '5px 12px', background: 'transparent', color: '#4caf50', border: '2px solid #4caf50', flexShrink: 0, transition: 'background .15s, color .15s' }}
                      onClick={() => handleClockOut(e.id)}
                    >
                      Clock Out
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* ── Time Log ── */}
        <Panel title="Time Log" hint="All recorded time entries">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['today', 'week', 'all'] as DateFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: dateFilter === f ? '1px solid var(--accent)' : '1px solid var(--line)',
                    background: dateFilter === f ? 'rgba(204,0,0,0.08)' : 'var(--surface-soft)',
                    color: dateFilter === f ? 'var(--accent)' : 'var(--muted)',
                    fontWeight: dateFilter === f ? 700 : 400,
                  }}
                >
                  {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'All Time'}
                </button>
              ))}
            </div>
            <button className="mini-btn" onClick={exportCSV}>Export CSV</button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>⏱</div>
              <div style={{ fontSize: 14 }}>No time entries yet. Clock in to start tracking.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  {['Technician', 'Job Card', 'Clock In', 'Clock Out', 'Duration', 'Notes', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const mins = e.clockOut
                    ? Math.floor((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000)
                    : elapsedMinutes(e.clockIn);
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 10px', fontWeight: 600 }}>{e.technicianName}</td>
                      <td style={{ padding: '10px 10px', color: e.jobCardNumber ? 'var(--accent)' : 'var(--muted)' }}>{e.jobCardNumber ?? '—'}</td>
                      <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12 }}>{fmt(e.clockIn)}</td>
                      <td style={{ padding: '10px 10px', fontSize: 12 }}>
                        {e.clockOut
                          ? <span style={{ color: 'var(--muted)' }}>{fmt(e.clockOut)}</span>
                          : <span style={{ color: '#4caf50', fontWeight: 700 }}>Active</span>
                        }
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 700 }}>{formatDuration(mins)}</td>
                      <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!e.clockOut && (
                            <button className="btn"
                              onMouseEnter={ev => { ev.currentTarget.style.background = '#4caf50'; ev.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = '#4caf50'; }}
                              style={{ fontSize: 11, padding: '3px 10px', background: 'transparent', color: '#4caf50', border: '2px solid #4caf50', transition: 'background .15s, color .15s' }} onClick={() => handleClockOut(e.id)}>Out</button>
                          )}
                          <button className="btn" style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(244,67,54,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => handleDelete(e.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {filtered.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>{filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}</span>
              <span style={{ fontWeight: 700 }}>
                Total: {formatDuration(
                  filtered
                    .filter(e => !!e.clockOut)
                    .reduce((s, e) => s + Math.floor((new Date(e.clockOut!).getTime() - new Date(e.clockIn).getTime()) / 60000), 0)
                )}
              </span>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
