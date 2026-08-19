'use client';

/**
 * Pay and advances.
 *
 * Two things a shop actually does: set what someone earns from a date, and
 * lend against it. Both are money, so both are visible only to people who may
 * see them — the screen hides what the capabilities withhold, and RLS is what
 * actually enforces it.
 *
 * Salary is shown as a HISTORY, not as an editable field. Changing pay adds a
 * row from a date; the old rate stays on screen because it is what somebody
 * was actually paid last month, and it is the record a person reaches for when
 * they dispute a payslip.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchSalaryHistory, fetchCurrentSalaries, setSalary,
  fetchAdvances, requestAdvance, decideAdvance, markAdvancePaid,
  outstandingFrom, PAY_TYPES,
  type PayType, type SalaryAdvance, type SalaryRecord,
} from '@/services/salaryService';
import { fetchEmployees, type Employee } from '@/services/employeeService';
import { useShop } from '@/lib/useShop';
import { PRIORITY_CURRENCIES, formatMoney, DEFAULT_CURRENCY } from '@/lib/currencies';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);

const ADVANCE_COLOR: Record<string, string> = {
  Pending:   '#d97706',
  Approved:  '#0891b2',
  Paid:      '#059669',
  Rejected:  '#dc2626',
  Cancelled: '#64748b',
};

export function PayView() {
  const { role } = useShop();
  const canManagePay = role === 'owner';

  const [tab, setTab] = useState<'salary' | 'advances'>('salary');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Salary
  const [current, setCurrent] = useState<SalaryRecord[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [showRate, setShowRate] = useState(false);
  const [rate, setRate] = useState({
    employeeId: '', effectiveFrom: today(), payType: 'Monthly' as PayType,
    amount: '', currency: DEFAULT_CURRENCY, notes: '',
  });

  // Advances
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ employeeId: '', amount: '', currency: DEFAULT_CURRENCY, reason: '' });
  const [busy, setBusy] = useState(false);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  useEffect(() => {
    fetchEmployees().then(setEmployees).catch(e => setError(errMsg(e, 'Could not load the people list.')));
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!canManagePay) return;
    try {
      setCurrent(await fetchCurrentSalaries());
    } catch (e) {
      setError(errMsg(e, 'Could not load pay rates.'));
    }
  }, [canManagePay]);

  const loadAdvances = useCallback(async () => {
    try {
      setAdvances(await fetchAdvances());
    } catch (e) {
      setError(errMsg(e, 'Could not load advances.'));
    }
  }, []);

  useEffect(() => { void loadCurrent(); }, [loadCurrent]);
  useEffect(() => { void loadAdvances(); }, [loadAdvances]);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    fetchSalaryHistory(selected)
      .then(setHistory)
      .catch(e => setError(errMsg(e, 'Could not load that history.')));
  }, [selected]);

  const nameFor = (id: string) => employees.find(e => e.id === id)?.fullName ?? 'Unknown';
  const currentFor = (id: string) => current.find(r => r.employeeId === id);

  async function saveRate() {
    const amount = Number(rate.amount);
    if (!rate.employeeId) { setError('Choose a person.'); return; }
    if (!Number.isFinite(amount) || amount < 0) { setError('Enter a pay rate.'); return; }
    setBusy(true);
    try {
      await setSalary({
        employeeId: rate.employeeId, effectiveFrom: rate.effectiveFrom,
        payType: rate.payType, amount, currency: rate.currency, notes: rate.notes,
      });
      setShowRate(false);
      setRate({ ...rate, amount: '', notes: '' });
      await loadCurrent();
      if (selected === rate.employeeId) setHistory(await fetchSalaryHistory(selected));
      // Said plainly, because it is the thing people expect to have replaced
      // the old figure rather than joined it.
      notify('Recorded — the previous rate is kept as history');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'That rate was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitAdvance() {
    const amount = Number(advanceForm.amount);
    if (!advanceForm.employeeId) { setError('Choose a person.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount.'); return; }
    setBusy(true);
    try {
      await requestAdvance({
        employeeId: advanceForm.employeeId, amount,
        currency: advanceForm.currency, reason: advanceForm.reason,
      });
      setShowAdvance(false);
      setAdvanceForm({ employeeId: '', amount: '', currency: DEFAULT_CURRENCY, reason: '' });
      await loadAdvances();
      notify('Advance requested');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'The request was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function decide(advance: SalaryAdvance, decision: 'Approved' | 'Rejected') {
    try {
      await decideAdvance(advance.id, decision);
      await loadAdvances();
      notify(decision === 'Approved' ? 'Approved — mark it paid when the money is handed over' : 'Rejected');
    } catch (e) {
      setError(errMsg(e, 'That decision was not saved.'));
    }
  }

  async function pay(advance: SalaryAdvance) {
    if (!confirm('Record ' + formatMoney(advance.amount, advance.currency) + ' as paid to ' + nameFor(advance.employeeId) + '?')) return;
    try {
      await markAdvancePaid(advance.id);
      await loadAdvances();
      notify('Recorded as paid — payroll will deduct it');
    } catch (e) {
      setError(errMsg(e, 'That was not recorded.'));
    }
  }

  const outstanding = outstandingFrom(advances);
  const pending = advances.filter(a => a.status === 'Pending');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Pay &amp; Advances</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['salary', 'advances'] as const).map(t => (
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
              {t === 'advances' && pending.length > 0 ? ' (' + pending.length + ')' : ''}
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

      {tab === 'salary' && (
        <>
          {!canManagePay ? (
            <Panel title="Your pay">
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                Only the owner can see or set pay rates for other people. Your own record is visible
                to you — choose your name below if it is listed.
              </div>
            </Panel>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={() => setShowRate(v => !v)}>
                {showRate ? 'Cancel' : '+ Set a pay rate'}
              </button>
            </div>
          )}

          {showRate && canManagePay && (
            <Panel title="Set a pay rate">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                This adds a rate starting on the date you choose. The previous one is kept — it is
                what the person was actually paid before that date.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Person</label>
                  <select className="input" value={rate.employeeId} onChange={e => setRate({ ...rate, employeeId: e.target.value })}>
                    <option value="">— choose —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Starts from</label>
                  <input type="date" className="input" value={rate.effectiveFrom}
                    onChange={e => setRate({ ...rate, effectiveFrom: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Paid</label>
                  <select className="input" value={rate.payType}
                    onChange={e => setRate({ ...rate, payType: e.target.value as PayType })}>
                    {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Amount</label>
                  <input className="input" inputMode="decimal" value={rate.amount}
                    onChange={e => setRate({ ...rate, amount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Currency</label>
                  <select className="input" value={rate.currency} onChange={e => setRate({ ...rate, currency: e.target.value })}>
                    {PRIORITY_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Note</label>
                  <input className="input" value={rate.notes} onChange={e => setRate({ ...rate, notes: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary" disabled={busy} onClick={saveRate}>
                  {busy ? 'Saving…' : 'Record rate'}
                </button>
              </div>
            </Panel>
          )}

          {canManagePay && (
            <Panel title="Current rates">
              {employees.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No people yet — add them in Employees first.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {employees.map(employee => {
                    const rec = currentFor(employee.id);
                    return (
                      <div key={employee.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                          borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                        }}>
                        <div style={{ fontWeight: 600, minWidth: 160 }}>{employee.fullName}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {rec ? formatMoney(rec.amount, rec.currency) : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>no rate set</span>}
                        </div>
                        {rec && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rec.payType} · from {rec.effectiveFrom}</div>}
                        <button className="btn" style={{ fontSize: 12, marginLeft: 'auto' }}
                          onClick={() => setSelected(selected === employee.id ? '' : employee.id)}>
                          {selected === employee.id ? 'Hide history' : 'History'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {selected && (
            <Panel title={'Pay history — ' + nameFor(selected)}>
              {history.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No rates recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.map((h, i) => (
                    <div key={h.id} style={{
                      display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px',
                      borderRadius: 8, border: '1px solid var(--border)',
                      opacity: i === 0 ? 1 : 0.65,
                    }}>
                      <div style={{ fontWeight: 600, minWidth: 120 }}>{formatMoney(h.amount, h.currency)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.payType}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>from {h.effectiveFrom}</div>
                      {i === 0 && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>CURRENT</span>}
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{h.notes}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      {tab === 'advances' && (
        <>
          {outstanding.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              {outstanding.map(o => (
                <div key={o.currency} className="card card-hero" style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Outstanding {o.currency}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{formatMoney(o.amount, o.currency)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowAdvance(v => !v)}>
              {showAdvance ? 'Cancel' : '+ Request an advance'}
            </button>
          </div>

          {showAdvance && (
            <Panel title="New advance request">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Person</label>
                  <select className="input" value={advanceForm.employeeId}
                    onChange={e => setAdvanceForm({ ...advanceForm, employeeId: e.target.value })}>
                    <option value="">— choose —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Amount</label>
                  <input className="input" inputMode="decimal" value={advanceForm.amount}
                    onChange={e => setAdvanceForm({ ...advanceForm, amount: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Currency</label>
                  <select className="input" value={advanceForm.currency}
                    onChange={e => setAdvanceForm({ ...advanceForm, currency: e.target.value })}>
                    {PRIORITY_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Reason</label>
                  <input className="input" value={advanceForm.reason}
                    onChange={e => setAdvanceForm({ ...advanceForm, reason: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary" disabled={busy} onClick={submitAdvance}>
                  {busy ? 'Saving…' : 'Submit request'}
                </button>
              </div>
            </Panel>
          )}

          <Panel title={'Advances' + (pending.length > 0 ? ' — ' + pending.length + ' waiting' : '')}>
            {advances.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No advances have been requested.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {advances.map(advance => (
                  <div key={advance.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                  }}>
                    <div style={{ fontWeight: 600, minWidth: 150 }}>{nameFor(advance.employeeId)}</div>
                    <div style={{ fontWeight: 600, minWidth: 110 }}>{formatMoney(advance.amount, advance.currency)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 100 }}>{advance.requestedOn}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>{advance.reason}</div>
                    {advance.status === 'Paid' && advance.repaidAmount > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {formatMoney(advance.repaidAmount, advance.currency)} repaid
                      </div>
                    )}
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                      color: ADVANCE_COLOR[advance.status],
                      border: '1px solid ' + ADVANCE_COLOR[advance.status],
                    }}>
                      {advance.status}
                    </span>
                    {canManagePay && advance.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" style={{ fontSize: 12, color: '#059669', borderColor: '#059669' }}
                          onClick={() => decide(advance, 'Approved')}>Approve</button>
                        <button className="btn" style={{ fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}
                          onClick={() => decide(advance, 'Rejected')}>Reject</button>
                      </div>
                    )}
                    {canManagePay && advance.status === 'Approved' && (
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => pay(advance)}>
                        Mark paid
                      </button>
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
