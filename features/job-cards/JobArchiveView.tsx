'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { TechPill } from '@/components/TechPill';
import { Panel } from '@/components/Panel';
import { useAppDispatch } from '@/lib/store';

interface ArchivedJob {
  id: string;
  customer: string;
  vehicle: string;
  technicians: string[];
  status: string;
  serviceType: string;
  checkIn: string;
  closed: string | null;
  daysOpen: number;
  laborHours: number;
  partsTotal: number;
  ro: string | null;
  invoice: string | null;
  repairStage: string;
  notes: string;
}

type Period = 'month' | 'quarter' | 'year' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time',
};

const STATUS_COLOR: Record<string, string> = {
  Complete: '#4caf50', Closed: '#22c55e', Invoiced: '#2196f3',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function JobArchiveView() {
  const dispatch = useAppDispatch();
  const [jobs, setJobs] = useState<ArchivedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('job_cards')
        .select('id, customer, vehicle, technicians, status, service_type, check_in_date, closed_date, labor_hours, parts_total, ro, invoice, notes')
        .eq('shop_id', getShopId())
        .in('status', ['Complete', 'Closed', 'Invoiced'])
        .order('closed_date', { ascending: false, nullsFirst: false });
      if (err) throw err;

      const now = Date.now();
      const rows: ArchivedJob[] = (data ?? []).map((r: Record<string, unknown>) => {
        const checkIn = r.check_in_date as string;
        const closed = r.closed_date as string | null;
        const end = closed ? new Date(closed).getTime() : now;
        const daysOpen = checkIn ? Math.round((end - new Date(checkIn).getTime()) / 86400000) : 0;
        return {
          id: r.id as string,
          customer: (r.customer as string) || '—',
          vehicle: (r.vehicle as string) || '—',
          technicians: (r.technicians as string[]) ?? [],
          status: (r.status as string) || '',
          serviceType: (r.service_type as string) || '',
          checkIn,
          closed,
          daysOpen,
          laborHours: Number(r.labor_hours ?? 0),
          partsTotal: Number(r.parts_total ?? 0),
          ro: (r.ro as string) || null,
          invoice: (r.invoice as string) || null,
          repairStage: '',
          notes: (r.notes as string) || '',
        };
      });
      setJobs(rows);
    } catch (e: unknown) {
      setError((e as Record<string, unknown>)?.message as string ?? 'Failed to load archive');
    } finally {
      setLoading(false);
    }
  }

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function handleReturnJob(j: ArchivedJob) {
    dispatch({
      type: 'OPEN_NEW_JOB_CARD',
      prefill: {
        customerName: j.customer,
        vehicle: j.vehicle,
        notes: `↩ RETURN JOB — Original: ${j.ro || j.id} closed ${j.closed ? new Date(j.closed).toLocaleDateString() : ''}. Original issue: ${j.notes || ''}`.trim(),
      },
    });
  }

  // Period cutoff
  const periodStart = (() => {
    const n = new Date();
    if (period === 'month')   return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
    if (period === 'quarter') return new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1).getTime();
    if (period === 'year')    return new Date(n.getFullYear(), 0, 1).getTime();
    return 0;
  })();

  const filtered = jobs.filter(j => {
    if (periodStart > 0 && j.closed) {
      if (new Date(j.closed).getTime() < periodStart) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        j.customer.toLowerCase().includes(q) ||
        j.vehicle.toLowerCase().includes(q) ||
        j.technicians.some(t => t.toLowerCase().includes(q)) ||
        (j.ro ?? '').toLowerCase().includes(q) ||
        (j.invoice ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Summary stats on filtered set
  const totalLaborHours  = filtered.reduce((s, j) => s + j.laborHours, 0);
  const totalPartsValue  = filtered.reduce((s, j) => s + j.partsTotal, 0);
  const avgDays = filtered.filter(j => j.closed).length > 0
    ? filtered.filter(j => j.closed).reduce((s, j) => s + j.daysOpen, 0) / filtered.filter(j => j.closed).length
    : 0;

  function exportCSV() {
    const rows = [
      ['Customer','Vehicle','Technicians','Status','Service Type','Check-In','Closed','Days','Labor h','Parts $','RO #','Invoice #'],
      ...filtered.map(j => [
        j.customer, j.vehicle, j.technicians.join('; ') || 'Unassigned',
        j.status, j.serviceType,
        fmtDate(j.checkIn), fmtDate(j.closed),
        String(j.daysOpen), j.laborHours.toFixed(1),
        ('$' + j.partsTotal.toFixed(2)),
        j.ro ?? '', j.invoice ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `Job-Archive-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    notify('CSV downloaded.');
  }

  const inputStyle: React.CSSProperties = {
    padding: '9px 14px', borderRadius: 8, border: '1px solid var(--line)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%',
  };

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Job Archive</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Permanent record of all completed, closed, and invoiced jobs
          </p>
        </div>
        <button className="btn btn-primary" onClick={exportCSV} disabled={filtered.length === 0}>
          ⬇ Export CSV
        </button>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, vehicle, tech, RO #, invoice #…"
          style={{ ...inputStyle, width: 320, flex: '0 0 auto' }}
        />
        {/* Period pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${period === p ? 'var(--accent)' : 'var(--line)'}`, cursor: 'pointer', fontSize: 12, fontWeight: period === p ? 700 : 400, background: period === p ? 'rgba(204,0,0,0.1)' : 'var(--surface-soft)', color: period === p ? 'var(--accent)' : 'var(--muted)' }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {(search || period !== 'all') && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} of {jobs.length} jobs</span>
        )}
      </div>

      {/* ── Summary stats ── */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Archived Jobs', value: String(filtered.length), sub: 'Completed / Closed / Invoiced', color: 'var(--text)' },
          { label: 'Avg Days to Close', value: avgDays > 0 ? avgDays.toFixed(1) + 'd' : '—', sub: 'From check-in to close', color: avgDays > 7 ? '#f44336' : avgDays > 3 ? '#f59e0b' : '#4caf50' },
          { label: 'Total Labor Hours', value: totalLaborHours.toFixed(1) + ' h', sub: 'Across filtered jobs', color: '#2196f3' },
          { label: 'Total Parts Value', value: '$' + totalPartsValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), sub: 'Across filtered jobs', color: '#ff9800' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Archive table ── */}
      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
          Loading archive…
        </div>
      ) : filtered.length === 0 ? (
        <Panel title="No Records Found">
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            {jobs.length === 0
              ? 'No completed, closed, or invoiced job cards yet. Completed jobs appear here automatically.'
              : 'No jobs match your current filter. Try a different time period or clear the search.'}
          </p>
        </Panel>
      ) : (
        <Panel title={`${filtered.length} Archived Job${filtered.length !== 1 ? 's' : ''}`} hint="Click any row to expand full details">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  {['Customer', 'Vehicle', 'Technician(s)', 'Status', 'Check-In', 'Closed', 'Days', 'Labor h', 'RO / Invoice', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(j => {
                  const sc = STATUS_COLOR[j.status] ?? '#888';
                  const isExpanded = expandedId === j.id;
                  return (
                    <>
                      <tr key={j.id}
                        style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--line)', cursor: 'pointer', background: isExpanded ? 'rgba(204,0,0,0.03)' : undefined }}
                        onClick={() => setExpandedId(isExpanded ? null : j.id)}>
                        <td style={{ padding: '11px 10px', fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.customer}</td>
                        <td style={{ padding: '11px 10px', color: 'var(--muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.vehicle}</td>
                        <td style={{ padding: '11px 10px', maxWidth: 130 }}>
                          {j.technicians.length > 0
                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{j.technicians.map(t => <TechPill key={t} name={t} />)}</div>
                            : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Unassigned</span>
                          }
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: `${sc}18`, color: sc, borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{j.status}</span>
                        </td>
                        <td style={{ padding: '11px 10px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(j.checkIn)}</td>
                        <td style={{ padding: '11px 10px', color: '#4caf50', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(j.closed)}</td>
                        <td style={{ padding: '11px 10px', fontWeight: 700, color: j.daysOpen > 7 ? '#f44336' : j.daysOpen > 3 ? '#f59e0b' : 'var(--text)' }}>{j.daysOpen}d</td>
                        <td style={{ padding: '11px 10px', color: 'var(--muted)' }}>{j.laborHours > 0 ? j.laborHours.toFixed(1) : '—'}</td>
                        <td style={{ padding: '11px 10px', fontSize: 12 }}>
                          {j.ro && <div style={{ color: 'var(--muted)' }}>RO: {j.ro}</div>}
                          {j.invoice && <div style={{ color: '#2196f3' }}>INV: {j.invoice}</div>}
                        </td>
                        <td style={{ padding: '11px 10px', color: 'var(--muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</td>
                      </tr>

                      {isExpanded && (
                        <tr key={j.id + '-detail'} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td colSpan={10} style={{ padding: '0 0 16px 0', background: 'var(--surface-soft)' }}>
                            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

                              {/* Vehicle & Job info */}
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Job Details</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                                  <div><span style={{ color: 'var(--muted)' }}>Customer: </span><strong>{j.customer}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Vehicle: </span><strong>{j.vehicle}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Service Type: </span>{j.serviceType || '—'}</div>
                                  {j.repairStage && <div><span style={{ color: 'var(--muted)' }}>Repair Stage: </span>{j.repairStage.replace(/_/g, ' ')}</div>}
                                  {j.notes && <div><span style={{ color: 'var(--muted)' }}>Notes: </span>{j.notes}</div>}
                                </div>
                              </div>

                              {/* Timeline */}
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Timeline</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                                  <div><span style={{ color: 'var(--muted)' }}>Checked In: </span><strong>{fmtDate(j.checkIn)}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Closed: </span><strong style={{ color: '#4caf50' }}>{fmtDate(j.closed)}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Total Days: </span><strong style={{ color: j.daysOpen > 7 ? '#f44336' : j.daysOpen > 3 ? '#f59e0b' : '#4caf50' }}>{j.daysOpen} day{j.daysOpen !== 1 ? 's' : ''}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Technicians: </span>
                                    {j.technicians.length > 0 ? j.technicians.join(', ') : 'Unassigned'}
                                  </div>
                                </div>
                              </div>

                              {/* Financials */}
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Financials & References</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                                  <div><span style={{ color: 'var(--muted)' }}>Labor Hours: </span><strong style={{ color: '#2196f3' }}>{j.laborHours > 0 ? j.laborHours.toFixed(1) + ' h' : '—'}</strong></div>
                                  <div><span style={{ color: 'var(--muted)' }}>Parts Total: </span><strong style={{ color: '#ff9800' }}>${j.partsTotal.toFixed(2)}</strong></div>
                                  {j.ro && <div><span style={{ color: 'var(--muted)' }}>Repair Order: </span><strong>{j.ro}</strong></div>}
                                  {j.invoice && <div><span style={{ color: 'var(--muted)' }}>Invoice: </span><strong style={{ color: '#2196f3' }}>{j.invoice}</strong></div>}
                                  <div style={{ marginTop: 4 }}>
                                    <span style={{ background: `${STATUS_COLOR[j.status] ?? '#888'}18`, color: STATUS_COLOR[j.status] ?? '#888', borderRadius: 5, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                                      {j.status}
                                    </span>
                                  </div>
                                  <div style={{ marginTop: 10 }}>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleReturnJob(j); }}
                                      style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      ↩ Return Job
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
