'use client';

import { Panel } from '@/components/Panel';
import { formatMoney, CURRENCIES } from '@/services/invoiceService';
import type { RevenueDay } from './types';

export function RevenueChart({ revenue7, onNav: nav }: { revenue7: RevenueDay[]; onNav: (module: string) => void }) {
  const maxRevDay = Math.max(...revenue7.map(d => d.amount), 1);

  return (
    <Panel title="Revenue — Last 7 Days" hint="Payments received per day — click any bar to view payments">
      {revenue7.every(d => d.amount === 0) ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>No payments recorded in the last 7 days.</p>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 140, padding: '8px 4px 0' }}>
          {revenue7.map((day, i) => (
            <div
              key={i}
              onClick={() => day.amount > 0 && nav('payments')}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: day.amount > 0 ? 'pointer' : 'default' }}
              title={day.amount > 0 ? `${day.date} — ${Object.entries(day.byCurrency).map(([c, a]) => formatMoney(a, c)).join(' + ')} · Click to view payments` : undefined}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: day.amount > 0 ? 'var(--text)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.3 }}>
                {day.amount > 0 ? Object.entries(day.byCurrency).map(([cur, amt]) => {
                  const sym = CURRENCIES.find(c => c.code === cur)?.symbol ?? cur;
                  return sym + (amt >= 1000 ? (amt / 1000).toFixed(1) + 'k' : Math.round(amt).toLocaleString());
                }).join('\n') : ''}
              </div>
              <div
                className={day.amount > 0 ? 'dash-bar' : ''}
                style={{
                  width: '100%',
                  height: Math.max(4, Math.round((day.amount / maxRevDay) * 100)) + 'px',
                  background: day.amount > 0 ? 'var(--accent)' : 'var(--line)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s, filter 0.15s, transform 0.15s',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.3 }}>
                {day.date.split(',')[0]}
                <br />{day.date.split(', ')[1] ?? ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
