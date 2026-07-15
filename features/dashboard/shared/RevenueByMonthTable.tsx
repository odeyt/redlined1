'use client';

import { Panel } from '@/components/Panel';
import { formatMoney } from '@/services/invoiceService';
import type { MonthRevenue } from './types';

export function RevenueByMonthTable({ monthlyRevenue }: { monthlyRevenue: MonthRevenue[] }) {
  return (
    <Panel title="Revenue by Month" hint="Paid invoices grouped by month and currency — most recent first">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Month</th>
              <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRevenue.map(m => (
              <tr key={m.key} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.label}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  {Object.entries(m.byCurrency).map(([cur, amt]) => (
                    <div key={cur} style={{ fontWeight: 700, color: '#4caf50' }}>{formatMoney(amt, cur)}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
