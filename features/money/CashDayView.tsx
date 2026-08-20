'use client';

/**
 * Closing the day.
 *
 * The screen's job is to make the target achievable and the difference
 * explainable. It shows where the expected figure came from — opening float,
 * cash in, cash out — because a reconciliation that shows only a total asks
 * somebody to match a number they cannot check, and that control gets ignored.
 *
 * A difference never blocks the close. It has to be explained, which is the
 * control that improves the record rather than corrupting it.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchCashDays, fetchCashDayLines, openCashDay, saveCashDayLines,
  closeCashDay, reopenCashDay, expectedCashFor, varianceOf, blockersFor,
  type CashDay, type CashDayLine,
} from '@/services/cashDayService';
import { fetchPayments } from '@/services/paymentService';
import { fetchExpenses } from '@/services/expenseService';
import { useShop } from '@/lib/useShop';
import { formatMoney } from '@/lib/currencies';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Draft = CashDayLine & { countedText: string };

export function CashDayView() {
  const { shopId } = useShop();
  const [days, setDays] = useState<CashDay[]>([]);
  const [day, setDay] = useState<CashDay | null>(null);
  const [lines, setLines] = useState<Draft[]>([]);
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 5000);
  }

  const loadDays = useCallback(async () => {
    try {
      setDays(await fetchCashDays(daysAgo(30), today()));
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load the daily cash record.'));
    }
  }, []);

  useEffect(() => { void loadDays(); }, [loadDays]);

  const toDraft = (l: CashDayLine): Draft => ({
    ...l, countedText: l.countedCash === null ? '' : String(l.countedCash),
  });

  /**
   * Open (or reopen the view of) a day and work out what should be in the till.
   *
   * The expected figures are recomputed every time this runs, right up until
   * the day is closed — at which point they are frozen by the save.
   */
  const openAndCalculate = useCallback(async (businessDate: string) => {
    if (!shopId) { setError('No shop selected.'); return; }
    setBusy(true);
    try {
      const d = await openCashDay(businessDate);
      setDay(d);

      const existing = await fetchCashDayLines(d.id);

      // Yesterday's counted cash is today's float. Carried forward rather than
      // typed again, because a float re-entered by hand is a float eventually
      // entered wrongly.
      const previous = days.find(x => x.businessDate < businessDate && x.status === 'Closed');
      const floats: Record<string, number> = {};
      if (previous) {
        for (const l of await fetchCashDayLines(previous.id)) {
          if (l.countedCash !== null) floats[l.currency] = l.countedCash;
        }
      }
      // An already-entered float wins: somebody may have corrected it.
      for (const l of existing) floats[l.currency] = l.openingFloat;

      const [payments, expenses] = await Promise.all([fetchPayments(), fetchExpenses({ from: businessDate, to: businessDate })]);
      const expected = expectedCashFor(payments, expenses, businessDate, shopId, floats);

      const merged: Draft[] = expected.map(e => {
        const prior = existing.find(l => l.currency === e.currency);
        return toDraft({
          id: prior?.id ?? 'new-' + e.currency,
          dayId: d.id,
          currency: e.currency,
          openingFloat: floats[e.currency] ?? 0,
          cashIn: e.cashIn,
          cashOut: e.cashOut,
          expectedCash: e.expected,
          countedCash: prior?.countedCash ?? null,
          variance: varianceOf(prior?.countedCash ?? null, e.expected),
          notes: prior?.notes ?? '',
        });
      });

      setLines(merged);
      setError('');
      if (merged.length === 0) {
        notify('No cash moved on ' + businessDate + ' — nothing to reconcile.');
      }
    } catch (e) {
      setError(errMsg(e, 'Could not open that day.'));
    } finally {
      setBusy(false);
    }
  }, [shopId, days]);

  function editCount(currency: string, text: string) {
    setLines(prev => prev.map(l => {
      if (l.currency !== currency) return l;
      const counted = text.trim() === '' ? null : Number(text);
      const valid = counted === null || Number.isFinite(counted);
      return {
        ...l,
        countedText: text,
        countedCash: valid ? counted : l.countedCash,
        variance: valid ? varianceOf(counted, l.expectedCash) : l.variance,
      };
    }));
  }

  function editNote(currency: string, notes: string) {
    setLines(prev => prev.map(l => (l.currency === currency ? { ...l, notes } : l)));
  }

  async function save() {
    if (!day) return;
    setBusy(true);
    try {
      const saved = await saveCashDayLines(day.id, lines.map(l => ({
        currency: l.currency, openingFloat: l.openingFloat,
        cashIn: l.cashIn, cashOut: l.cashOut, expectedCash: l.expectedCash,
        countedCash: l.countedCash, variance: l.variance, notes: l.notes,
      })));
      setLines(saved.map(toDraft));
      notify('Count saved');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'The count was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!day) return;
    const stopping = blockersFor(lines);
    if (stopping.length > 0) { setError(stopping.join(' ')); return; }

    setBusy(true);
    try {
      // Saved first: the close reads what is in the database, not what is on
      // screen, and closing an unsaved count would freeze the wrong figures.
      await saveCashDayLines(day.id, lines.map(l => ({
        currency: l.currency, openingFloat: l.openingFloat,
        cashIn: l.cashIn, cashOut: l.cashOut, expectedCash: l.expectedCash,
        countedCash: l.countedCash, variance: l.variance, notes: l.notes,
      })));
      const result = await closeCashDay(day.id);
      await loadDays();
      setDay({ ...day, status: 'Closed' });
      setLines(await fetchCashDayLines(day.id).then(ls => ls.map(toDraft)));
      notify(
        result.totalVariance === 0
          ? 'Day closed — every currency counted square'
          : 'Day closed — ' + result.currencies + ' currencies, ' + result.totalVariance + ' total difference',
      );
      setError('');
    } catch (e) {
      setError(errMsg(e, 'The day was not closed.'));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!day) return;
    const reason = prompt('Why are you reopening ' + day.businessDate + '?');
    if (!reason || !reason.trim()) return;
    try {
      await reopenCashDay(day.id, reason);
      await loadDays();
      setDay({ ...day, status: 'Open' });
      notify('Reopened — the original close is kept on the record');
    } catch (e) {
      setError(errMsg(e, 'That day was not reopened.'));
    }
  }

  const stopping = day?.status === 'Open' ? blockersFor(lines) : [];
  const isOpen = day?.status === 'Open';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Closing the day</h1>
        <input type="date" className="input" value={date} max={today()}
          style={{ width: 170, marginLeft: 'auto' }}
          onChange={e => setDate(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={() => openAndCalculate(date)}>
          {busy ? 'Working…' : 'Count this day'}
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

      {day && (
        <Panel title={day.businessDate + ' — ' + day.status}>
          {day.reopenedAt && (
            <div style={{ fontSize: 12, color: '#d97706', marginBottom: 10 }}>
              This day was reopened. Reason: {day.reopenReason}
            </div>
          )}

          {lines.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              No cash moved on this day, and no float was carried forward — there is nothing to count.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '6px 8px' }}>Currency</th>
                    <th style={{ padding: '6px 8px' }}>Opening float</th>
                    <th style={{ padding: '6px 8px' }}>Cash in</th>
                    <th style={{ padding: '6px 8px' }}>Cash out</th>
                    <th style={{ padding: '6px 8px' }}>Should be there</th>
                    <th style={{ padding: '6px 8px' }}>Counted</th>
                    <th style={{ padding: '6px 8px' }}>Difference</th>
                    <th style={{ padding: '6px 8px' }}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.currency} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{l.currency}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{formatMoney(l.openingFloat, l.currency)}</td>
                      <td style={{ padding: '6px 8px', color: '#059669' }}>+{formatMoney(l.cashIn, l.currency)}</td>
                      <td style={{ padding: '6px 8px', color: '#dc2626' }}>−{formatMoney(l.cashOut, l.currency)}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{formatMoney(l.expectedCash, l.currency)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {isOpen ? (
                          <input className="input" inputMode="decimal" style={{ width: 110 }}
                            placeholder="count it"
                            value={l.countedText}
                            onChange={e => editCount(l.currency, e.target.value)} />
                        ) : l.countedCash === null ? '—' : formatMoney(l.countedCash, l.currency)}
                      </td>
                      <td style={{
                        padding: '6px 8px', fontWeight: 700,
                        color: l.variance === null ? 'var(--muted)'
                          : l.variance === 0 ? '#059669' : '#dc2626',
                      }}>
                        {l.variance === null ? '—'
                          : (l.variance > 0 ? '+' : '') + formatMoney(l.variance, l.currency)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {isOpen ? (
                          <input className="input" style={{ width: 200 }}
                            placeholder={l.variance !== null && l.variance !== 0 ? 'required' : ''}
                            value={l.notes}
                            onChange={e => editNote(l.currency, e.target.value)} />
                        ) : (l.notes || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stopping.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#d97706' }}>
              {stopping.map(s => <div key={s}>{s}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {isOpen && lines.length > 0 && (
              <>
                <button className="btn" disabled={busy} onClick={save}>Save count</button>
                <button className="btn btn-primary" disabled={busy || stopping.length > 0} onClick={close}>
                  Close the day
                </button>
              </>
            )}
            {day.status === 'Closed' && (
              <button className="btn" onClick={reopen}>Reopen</button>
            )}
          </div>

          {day.status === 'Closed' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Closed. These figures are the record of what was in the till — reopening keeps the
              original close on file.
            </div>
          )}
        </Panel>
      )}

      <Panel title="Last 30 days">
        {days.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>No days have been closed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {days.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 600, minWidth: 110 }}>{d.businessDate}</div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
                  color: d.status === 'Closed' ? '#059669' : '#d97706',
                  border: '1px solid ' + (d.status === 'Closed' ? '#059669' : '#d97706'),
                }}>{d.status}</span>
                {d.reopenedAt && (
                  <span style={{ fontSize: 11, color: '#d97706' }}>reopened</span>
                )}
                <button className="btn" style={{ fontSize: 12, marginLeft: 'auto' }}
                  onClick={() => { setDate(d.businessDate); void openAndCalculate(d.businessDate); }}>
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
