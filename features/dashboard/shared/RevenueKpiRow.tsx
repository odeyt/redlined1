'use client';

import { formatMoney } from '@/services/invoiceService';
import { cardClick } from './styles';
import type { DashStats } from './types';

export function RevenueKpiRow({ stats: s, onNav: nav }: { stats: DashStats; onNav: (module: string) => void }) {
  return (
    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Total Revenue</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        {Object.entries(s.revenueByCurrency).length === 0 ? (
          <div style={{ fontSize: 26, fontWeight: 800, color: '#4caf50', marginTop: 4 }}>—</div>
        ) : Object.entries(s.revenueByCurrency).map(([cur, amt]) => (
          <div key={cur} style={{ fontSize: Object.keys(s.revenueByCurrency).length > 1 ? 18 : 26, fontWeight: 800, color: '#4caf50', marginTop: 4, lineHeight: 1.2 }}>
            {formatMoney(amt, cur)}
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.paidInvoices} paid invoice{s.paidInvoices !== 1 ? 's' : ''}</div>
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Outstanding</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        {Object.entries(s.outstandingByCurrency).length === 0 ? (
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>—</div>
        ) : Object.entries(s.outstandingByCurrency).map(([cur, amt]) => (
          <div key={cur} style={{ fontSize: Object.keys(s.outstandingByCurrency).length > 1 ? 18 : 26, fontWeight: 800, color: '#f59e0b', marginTop: 4, lineHeight: 1.2 }}>
            {formatMoney(amt, cur)}
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.unpaidInvoices} unpaid invoice{s.unpaidInvoices !== 1 ? 's' : ''}</div>
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('payments')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Today's Revenue</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        {Object.entries(s.revenueTodayByCurrency).length === 0 ? (
          <div style={{ fontSize: 26, fontWeight: 800, color: '#2196f3', marginTop: 4 }}>—</div>
        ) : Object.entries(s.revenueTodayByCurrency).map(([cur, amt]) => (
          <div key={cur} style={{ fontSize: Object.keys(s.revenueTodayByCurrency).length > 1 ? 18 : 26, fontWeight: 800, color: '#2196f3', marginTop: 4, lineHeight: 1.2 }}>
            {formatMoney(amt, cur)}
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.paymentsToday} invoice{s.paymentsToday !== 1 ? 's' : ''} paid today</div>
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Draft Invoices</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: s.draftInvoices > 0 ? '#ff9800' : 'var(--text)', marginTop: 4 }}>{s.draftInvoices}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Ready to send</div>
      </div>
    </div>
  );
}
