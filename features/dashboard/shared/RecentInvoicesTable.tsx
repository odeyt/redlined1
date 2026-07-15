'use client';

import { Panel } from '@/components/Panel';
import { formatMoney } from '@/services/invoiceService';
import { STATUS_COLOR } from './types';
import type { RecentInvoice } from './types';

export function RecentInvoicesTable({ invoices, onNav: nav }: { invoices: RecentInvoice[]; onNav: (module: string) => void }) {
  return (
    <Panel title="Recent Invoices" hint="Latest 6 invoices — click any row to open Invoices">
      {invoices.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No invoices yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Invoice</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Customer</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Total</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.number} className="dash-row" style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => nav('invoices')}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{inv.number}</td>
                <td style={{ padding: '8px', color: 'var(--muted)' }}>{inv.customer}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(inv.total, inv.currency)}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: (STATUS_COLOR[inv.status] || '#888') + '22', color: STATUS_COLOR[inv.status] || '#888' }}>{inv.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
