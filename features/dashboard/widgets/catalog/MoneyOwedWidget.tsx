'use client';

/**
 * What customers owe, as an aging summary.
 *
 * Derived live from invoices and payments — see lib/domain/receivables. There
 * is nothing stored to go stale, and nothing here that the Money Owed screen
 * does not also show.
 *
 * Per currency, because there is no such thing as a combined total across LAK,
 * THB and USD.
 */

import { useEffect, useState } from 'react';
import { fetchReceivables, agingSummary, type Receivable } from '@/services/receivablesService';
import { formatMoney } from '@/lib/currencies';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

const BUCKET_COLOR: Record<string, string> = {
  'Not due': '#64748b',
  '1–30':    '#0891b2',
  '31–60':   '#d97706',
  '61–90':   '#ea580c',
  '90+':     '#dc2626',
};

export function MoneyOwedWidget({ onNav }: WidgetProps) {
  const [rows, setRows] = useState<Receivable[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchReceivables()
      .then(setRows)
      // A widget that cannot load must not take the dashboard down with it.
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Could not work out what is owed.</div>;
  }
  if (!rows) return null;

  const aging = agingSummary(rows);
  if (aging.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Nothing outstanding. Every issued invoice is settled.
      </div>
    );
  }

  const worst = rows.reduce((n, r) => Math.max(n, r.daysOverdue), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {aging.map(a => (
        <div key={a.currency}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(a.total, a.currency)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{a.currency} outstanding</span>
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--border)' }}>
            {(['Not due', '1–30', '31–60', '61–90', '90+'] as const).map(bucket => {
              const share = a.total > 0 ? (a.buckets[bucket] / a.total) * 100 : 0;
              if (share === 0) return null;
              return (
                <div key={bucket} title={bucket + ': ' + formatMoney(a.buckets[bucket], a.currency)}
                  style={{ width: share + '%', background: BUCKET_COLOR[bucket] }} />
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 12, color: worst > 60 ? '#dc2626' : 'var(--muted)', marginTop: 'auto' }}>
        {worst > 0 ? 'Oldest is ' + worst + ' days overdue' : 'Nothing overdue yet'}
        {' · '}
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => onNav('receivables')}>See who</button>
      </div>
    </div>
  );
}
