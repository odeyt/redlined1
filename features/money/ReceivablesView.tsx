'use client';

/**
 * What customers owe.
 *
 * Three views of the same arithmetic: an aging summary to see the shape of it,
 * a per-customer list to know who to call, and the invoices themselves.
 *
 * Nothing here is stored. Every figure is computed from invoices and payments
 * when the screen loads, so it cannot drift from the ledger it describes.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchReceivables, agingSummary, byCustomer, bucketFor, AGING_BUCKETS,
  type Receivable,
} from '@/services/receivablesService';
import { formatMoney } from '@/lib/currencies';
import { useAppDispatch } from '@/lib/store';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

/** Colour by how bad it is, not by how many buckets there are. */
const BUCKET_COLOR: Record<string, string> = {
  'Not due': '#64748b',
  '1–30':    '#0891b2',
  '31–60':   '#d97706',
  '61–90':   '#ea580c',
  '90+':     '#dc2626',
};

export function ReceivablesView() {
  const dispatch = useAppDispatch();
  const [rows, setRows] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'customers' | 'invoices'>('customers');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchReceivables());
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not work out what is owed.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const aging = agingSummary(rows);
  const customers = byCustomer(rows);
  const mismatched = rows.filter(r => r.currencyMismatches.length > 0);
  const overpaid = rows.filter(r => r.overpaid > 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>What customers owe</h1>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['customers', 'invoices'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="btn"
              style={{
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: '1px solid var(--border)', textTransform: 'capitalize',
              }}>
              By {t}
            </button>
          ))}
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Working it out…</div>
      ) : rows.length === 0 ? (
        <Panel title="Nothing outstanding">
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Every issued invoice is settled. Drafts are not counted — nobody owes an invoice that
            was never sent.
          </div>
        </Panel>
      ) : (
        <>
          {aging.map(a => (
            <Panel key={a.currency} title={'Aging — ' + a.currency + ' · ' + formatMoney(a.total, a.currency) + ' outstanding'}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                {AGING_BUCKETS.map(bucket => (
                  <div key={bucket} style={{
                    padding: 12, borderRadius: 8,
                    border: '1px solid ' + BUCKET_COLOR[bucket],
                    opacity: a.buckets[bucket] > 0 ? 1 : 0.4,
                  }}>
                    <div style={{ fontSize: 11, color: BUCKET_COLOR[bucket], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {bucket === 'Not due' ? 'Not due' : bucket + ' days'}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {formatMoney(a.buckets[bucket], a.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ))}

          {mismatched.length > 0 && (
            <Panel title="Needs a person to look">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                These invoices have payments recorded in a different currency from the invoice
                itself. Those payments are <strong>not</strong> counted towards the balance, because
                converting them would mean inventing an exchange rate. The balance shown for them is
                therefore too high until somebody corrects the record.
              </div>
              {mismatched.map(r => (
                <div key={r.invoiceNumber} style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px',
                  borderRadius: 8, border: '1px solid #d97706', marginBottom: 6, flexWrap: 'wrap',
                }}>
                  <div style={{ fontWeight: 600 }}>{r.invoiceNumber}</div>
                  <div style={{ fontSize: 13 }}>{r.customerName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    invoiced in {r.currency}, paid in{' '}
                    {r.currencyMismatches.map(m => formatMoney(m.amount, m.currency)).join(', ')}
                  </div>
                </div>
              ))}
            </Panel>
          )}

          {overpaid.length > 0 && (
            <Panel title="Paid more than the invoice">
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Either a deposit that has not been allocated to its invoice, or money to refund.
              </div>
              {overpaid.map(r => (
                <div key={r.invoiceNumber} style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px',
                  borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6,
                }}>
                  <div style={{ fontWeight: 600 }}>{r.invoiceNumber}</div>
                  <div style={{ fontSize: 13 }}>{r.customerName}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0891b2' }}>
                    {formatMoney(r.overpaid, r.currency)} over
                  </div>
                </div>
              ))}
            </Panel>
          )}

          {tab === 'customers' && (
            <Panel title="Who to call">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {customers.map(c => (
                  <div key={c.customerName + c.currency} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                  }}>
                    <div style={{ fontWeight: 600, minWidth: 180 }}>{c.customerName}</div>
                    <div style={{ fontWeight: 700, minWidth: 120 }}>
                      {formatMoney(c.balance, c.currency)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {c.invoices} invoice{c.invoices === 1 ? '' : 's'}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                      marginLeft: 'auto',
                      color: BUCKET_COLOR[bucketFor(c.oldestDays)],
                      border: '1px solid ' + BUCKET_COLOR[bucketFor(c.oldestDays)],
                    }}>
                      {c.oldestDays > 0 ? c.oldestDays + ' days overdue' : 'not yet due'}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {tab === 'invoices' && (
            <Panel title="Unpaid invoices">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 8px' }}>Invoice</th>
                      <th style={{ padding: '6px 8px' }}>Customer</th>
                      <th style={{ padding: '6px 8px' }}>Vehicle</th>
                      <th style={{ padding: '6px 8px' }}>Due</th>
                      <th style={{ padding: '6px 8px' }}>Total</th>
                      <th style={{ padding: '6px 8px' }}>Paid</th>
                      <th style={{ padding: '6px 8px' }}>Owed</th>
                      <th style={{ padding: '6px 8px' }}>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].sort((a, b) => b.daysOverdue - a.daysOverdue).map(r => (
                      <tr key={r.invoiceNumber} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: '2px 8px' }}
                            onClick={() => dispatch({ type: 'SET_MODULE', module: 'invoices' })}
                          >
                            {r.invoiceNumber}
                          </button>
                        </td>
                        <td style={{ padding: '6px 8px' }}>{r.customerName}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{r.vehicle}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{r.dueDate || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{formatMoney(r.total, r.currency)}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{formatMoney(r.paid, r.currency)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{formatMoney(r.balance, r.currency)}</td>
                        <td style={{ padding: '6px 8px', color: BUCKET_COLOR[bucketFor(r.daysOverdue)] }}>
                          {r.daysOverdue > 0 ? r.daysOverdue + 'd' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
