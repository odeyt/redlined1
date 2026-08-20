'use client';

/**
 * Payroll.
 *
 * A run is a draft until somebody finalises it. The draft is calculated from
 * attendance and the rate that applied during the period, and every figure it
 * produces is editable — because the calculation is a proposal and the person
 * approving the run is the one who decides.
 *
 * The inputs are shown beside each line on purpose: days worked, paid leave,
 * absences, hours. A payroll screen that shows only a total asks somebody to
 * approve a number they cannot check.
 *
 * Totals are per currency and never added together. This shop pays in USD, THB
 * and LAK, and one combined figure would be meaningless.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchPayrollRuns, fetchPayrollLines, createPayrollRun, savePayrollLines,
  finalisePayrollRun, markPayrollPaid, deletePayrollDraft,
  calculateLine, netOf, totalsByCurrency,
  type PayrollLine, type PayrollRun,
} from '@/services/payrollService';
import { fetchEmployees, type Employee } from '@/services/employeeService';
import { fetchSalaryHistory } from '@/services/salaryService';
import { fetchAttendance } from '@/services/attendanceService';
import { formatMoney } from '@/lib/currencies';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

const STATUS_COLOR: Record<string, string> = {
  Draft:     '#d97706',
  Finalised: '#0891b2',
  Paid:      '#059669',
};

function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function lastOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function PayrollView() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openRun, setOpenRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ periodStart: firstOfMonth(), periodEnd: lastOfMonth(), label: '' });

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 5000);
  }

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await fetchPayrollRuns());
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load payroll.'));
    }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => {
    fetchEmployees().then(setEmployees).catch(() => {});
  }, []);

  const nameFor = (id: string) => employees.find(e => e.id === id)?.fullName ?? 'Unknown';

  async function open(run: PayrollRun) {
    setOpenRun(run);
    try {
      setLines(await fetchPayrollLines(run.id));
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load that run.'));
    }
  }

  async function create() {
    setBusy(true);
    try {
      const run = await createPayrollRun(form.periodStart, form.periodEnd, form.label);
      setShowNew(false);
      await loadRuns();
      await open(run);
      notify('Draft created — recalculate to fill it from attendance');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'That run was not created.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Rebuild every line from attendance and salary history.
   *
   * Reads each person's salary history separately rather than a single current
   * rate, because the rate that applied during the period is not necessarily
   * the one that applies today.
   */
  async function recalculate() {
    if (!openRun) return;
    setBusy(true);
    try {
      const days = await fetchAttendance(openRun.periodStart, openRun.periodEnd);
      const histories = await Promise.all(
        employees.map(async e => ({ id: e.id, history: await fetchSalaryHistory(e.id) })),
      );

      const calculated = employees.map(employee => {
        const history = histories.find(h => h.id === employee.id)?.history ?? [];
        const theirDays = days.filter(d => d.employeeId === employee.id);
        const c = calculateLine(employee.id, history, theirDays, openRun.periodEnd);
        // Deductions are NOT carried over from a previous calculation: they are
        // entered per run, and silently reapplying last time's would recover an
        // advance twice.
        return {
          employeeId: c.employeeId, currency: c.currency, payType: c.payType,
          rateAmount: c.rateAmount, salaryRecordId: c.salaryRecordId,
          daysWorked: c.daysWorked, daysLeavePaid: c.daysLeavePaid,
          daysAbsent: c.daysAbsent, hoursWorked: c.hoursWorked,
          gross: c.gross, advanceDeducted: 0, otherDeduction: 0,
          net: c.gross, notes: c.notes,
        };
      });

      setLines(await savePayrollLines(openRun.id, calculated));
      notify('Recalculated from attendance — check the figures before finalising');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not recalculate.'));
    } finally {
      setBusy(false);
    }
  }

  function editLine(id: string, field: 'gross' | 'advanceDeducted' | 'otherDeduction', value: string) {
    const amount = Number(value);
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, [field]: Number.isFinite(amount) ? amount : 0 };
      return { ...next, net: netOf(next.gross, next.advanceDeducted, next.otherDeduction) };
    }));
  }

  async function saveEdits() {
    if (!openRun) return;
    setBusy(true);
    try {
      const saved = await savePayrollLines(openRun.id, lines.map(l => ({
        employeeId: l.employeeId, currency: l.currency, payType: l.payType,
        rateAmount: l.rateAmount, salaryRecordId: l.salaryRecordId,
        daysWorked: l.daysWorked, daysLeavePaid: l.daysLeavePaid,
        daysAbsent: l.daysAbsent, hoursWorked: l.hoursWorked,
        gross: l.gross, advanceDeducted: l.advanceDeducted,
        otherDeduction: l.otherDeduction, net: l.net, notes: l.notes,
      })));
      setLines(saved);
      notify('Saved');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Those changes were not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function finalise() {
    if (!openRun) return;
    const totals = totalsByCurrency(lines);
    const summary = totals.map(t => formatMoney(t.net, t.currency)).join(' + ');
    if (!confirm(
      'Finalise this run?\n\n' + summary + ' across ' + lines.length + ' people.\n\n' +
      'Advances will be recovered and the lines can no longer be changed.'
    )) return;

    setBusy(true);
    try {
      const result = await finalisePayrollRun(openRun.id);
      await loadRuns();
      const runs = await fetchPayrollRuns();
      const updated = runs.find(r => r.id === openRun.id);
      if (updated) { setOpenRun(updated); setLines(await fetchPayrollLines(updated.id)); }
      notify(
        result.recoveredAdvances > 0
          ? 'Finalised — ' + result.recoveredAdvances + ' advance(s) recovered, ' + result.totalRecovered + ' total'
          : 'Finalised',
      );
      setError('');
    } catch (e) {
      // The database refuses rather than pay out a figure nobody can explain —
      // deducting more than someone owes, most often. Show it as it came.
      setError(errMsg(e, 'That run was not finalised.'));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!openRun) return;
    if (!confirm('Record this run as paid? This says the money has gone out.')) return;
    try {
      await markPayrollPaid(openRun.id);
      await loadRuns();
      setOpenRun({ ...openRun, status: 'Paid' });
      notify('Recorded as paid');
    } catch (e) {
      setError(errMsg(e, 'That was not recorded.'));
    }
  }

  async function discard(run: PayrollRun) {
    if (!confirm('Delete this draft? Nothing has been paid from it.')) return;
    try {
      await deletePayrollDraft(run.id);
      if (openRun?.id === run.id) { setOpenRun(null); setLines([]); }
      await loadRuns();
      notify('Draft deleted');
    } catch (e) {
      setError(errMsg(e, 'That draft was not deleted.'));
    }
  }

  const totals = totalsByCurrency(lines);
  const isDraft = openRun?.status === 'Draft';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Payroll</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(v => !v)}>
          {showNew ? 'Cancel' : '+ New run'}
        </button>
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

      {showNew && (
        <Panel title="New payroll run">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>From</label>
              <input type="date" className="input" value={form.periodStart}
                onChange={e => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>To</label>
              <input type="date" className="input" value={form.periodEnd} min={form.periodStart}
                onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Label</label>
              <input className="input" placeholder="August 2026" value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Runs">
        {runs.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>No payroll runs yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runs.map(run => (
              <div key={run.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 8, border: '1px solid var(--border)',
                background: openRun?.id === run.id ? 'var(--panel-2, transparent)' : 'transparent',
                flexWrap: 'wrap',
              }}>
                <div style={{ fontWeight: 600, minWidth: 140 }}>{run.label || run.periodStart}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{run.periodStart} → {run.periodEnd}</div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                  color: STATUS_COLOR[run.status], border: '1px solid ' + STATUS_COLOR[run.status],
                }}>{run.status}</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => open(run)}>Open</button>
                  {run.status === 'Draft' && (
                    <button className="btn" style={{ fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}
                      onClick={() => discard(run)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {openRun && (
        <Panel title={'Lines — ' + (openRun.label || openRun.periodStart) + ' (' + openRun.status + ')'}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {isDraft && (
              <>
                <button className="btn" disabled={busy} onClick={recalculate}>
                  {busy ? 'Working…' : 'Recalculate from attendance'}
                </button>
                <button className="btn" disabled={busy || lines.length === 0} onClick={saveEdits}>Save changes</button>
                <button className="btn btn-primary" disabled={busy || lines.length === 0} onClick={finalise}>
                  Finalise
                </button>
              </>
            )}
            {openRun.status === 'Finalised' && (
              <button className="btn btn-primary" onClick={pay}>Mark paid</button>
            )}
          </div>

          {totals.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
              {totals.map(t => (
                <div key={t.currency} className="card card-hero" style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Net {t.currency}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(t.net, t.currency)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>gross {formatMoney(t.gross, t.currency)}</div>
                </div>
              ))}
            </div>
          )}

          {lines.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              No lines yet — use <strong>Recalculate from attendance</strong>.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '6px 8px' }}>Person</th>
                    <th style={{ padding: '6px 8px' }}>Rate</th>
                    <th style={{ padding: '6px 8px' }}>Worked</th>
                    <th style={{ padding: '6px 8px' }}>Leave</th>
                    <th style={{ padding: '6px 8px' }}>Absent</th>
                    <th style={{ padding: '6px 8px' }}>Hours</th>
                    <th style={{ padding: '6px 8px' }}>Gross</th>
                    <th style={{ padding: '6px 8px' }}>Advance</th>
                    <th style={{ padding: '6px 8px' }}>Other</th>
                    <th style={{ padding: '6px 8px' }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                        {nameFor(l.employeeId)}
                        {l.notes && (
                          <div style={{ fontSize: 11, color: '#d97706', fontWeight: 400 }}>{l.notes}</div>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>
                        {formatMoney(l.rateAmount, l.currency)} · {l.payType}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{l.daysWorked}</td>
                      <td style={{ padding: '6px 8px' }}>{l.daysLeavePaid}</td>
                      <td style={{ padding: '6px 8px', color: l.daysAbsent > 0 ? '#dc2626' : undefined }}>{l.daysAbsent}</td>
                      <td style={{ padding: '6px 8px' }}>{l.hoursWorked}</td>
                      {(['gross', 'advanceDeducted', 'otherDeduction'] as const).map(field => (
                        <td key={field} style={{ padding: '6px 8px' }}>
                          {isDraft ? (
                            <input className="input" inputMode="decimal" style={{ width: 90 }}
                              value={String(l[field])}
                              onChange={e => editLine(l.id, field, e.target.value)} />
                          ) : formatMoney(l[field], l.currency)}
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{formatMoney(l.net, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {openRun.status !== 'Draft' && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
              This run is {openRun.status.toLowerCase()}. Its lines cannot be changed — they are the record
              of what each person was owed for this period.
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
