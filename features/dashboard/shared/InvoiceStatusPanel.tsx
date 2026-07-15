'use client';

import { Panel } from '@/components/Panel';
import type { DashStats } from './types';

export function InvoiceStatusPanel({ stats: s, onNav: nav }: { stats: DashStats; onNav: (module: string) => void }) {
  return (
    <Panel title="Invoice Status" hint="Overview of all invoices by status">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
        {[
          { label: 'Paid', count: s.paidInvoices, color: '#4caf50', total: s.paidInvoices + s.sentInvoices + s.draftInvoices },
          { label: 'Sent / Unpaid', count: s.sentInvoices, color: '#2196f3', total: s.paidInvoices + s.sentInvoices + s.draftInvoices },
          { label: 'Draft', count: s.draftInvoices, color: '#ff9800', total: s.paidInvoices + s.sentInvoices + s.draftInvoices },
        ].map(({ label, count, color, total }) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
            </div>
            <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: total > 0 ? `${(count / total) * 100}%` : '0%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="dash-parts" onClick={() => nav('parts')} style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)', cursor: 'pointer', borderRadius: 8, padding: '14px 8px 4px', transition: 'background 0.15s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Parts Inventory</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{s.totalParts}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Parts on file</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.lowStockParts > 0 ? '#f44336' : '#4caf50' }}>{s.lowStockParts}</div>
            <div style={{ fontSize: 11, color: s.lowStockParts > 0 ? '#f44336' : 'var(--muted)' }}>Low stock {s.lowStockParts > 0 ? '⚠' : '✓'}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
