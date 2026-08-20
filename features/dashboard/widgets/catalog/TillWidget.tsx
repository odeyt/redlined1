'use client';

/**
 * Whether the till has been counted, and how it has been running.
 *
 * Two things an owner wants from a glance: is yesterday closed, and are the
 * counts coming out square. A run of small differences in the same direction
 * says something a single day's variance never does.
 */

import { useEffect, useState } from 'react';
import { fetchCashDays, fetchCashDayLines, type CashDay, type CashDayLine } from '@/services/cashDayService';
import { formatMoney } from '@/lib/currencies';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function TillWidget({ onNav }: WidgetProps) {
  const [days, setDays] = useState<CashDay[] | null>(null);
  const [lines, setLines] = useState<Record<string, CashDayLine[]>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchCashDays(daysAgo(7), today())
      .then(async d => {
        setDays(d);
        // Only the closed ones have figures worth showing.
        const closed = d.filter(x => x.status === 'Closed').slice(0, 7);
        const loaded: Record<string, CashDayLine[]> = {};
        for (const day of closed) loaded[day.id] = await fetchCashDayLines(day.id);
        setLines(loaded);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Could not load the daily cash record.</div>;
  }
  if (!days) return null;

  const yesterday = daysAgo(1);
  const yesterdayClosed = days.some(d => d.businessDate === yesterday && d.status === 'Closed');
  const closedCount = days.filter(d => d.status === 'Closed').length;

  // Variances across the week, per currency. A persistent shortfall in one
  // currency is the pattern worth surfacing.
  const drift = new Map<string, number>();
  for (const ls of Object.values(lines)) {
    for (const l of ls) {
      if (l.variance === null) continue;
      drift.set(l.currency, (drift.get(l.currency) ?? 0) + l.variance);
    }
  }
  const drifts = [...drift.entries()].filter(([, v]) => v !== 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: yesterdayClosed ? '#059669' : '#d97706',
        }}>
          {yesterdayClosed ? 'Yesterday closed' : 'Yesterday not closed'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {closedCount} of the last 7 days counted
        </div>
      </div>

      {drifts.length === 0 ? (
        <div style={{ fontSize: 12, color: '#059669' }}>
          {closedCount > 0 ? 'Every count square this week' : 'No counts yet this week'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Running difference this week</div>
          {drifts.map(([currency, total]) => (
            <div key={currency} style={{ fontSize: 13, fontWeight: 600, color: total < 0 ? '#dc2626' : '#0891b2' }}>
              {(total > 0 ? '+' : '') + formatMoney(total, currency)} {currency}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => onNav('cash-day')}>
          {yesterdayClosed ? 'Close the day' : 'Count yesterday'}
        </button>
      </div>
    </div>
  );
}
