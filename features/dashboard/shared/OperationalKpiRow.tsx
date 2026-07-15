'use client';

import { cardClick } from './styles';
import type { DashStats } from './types';

export function OperationalKpiRow({ stats: s, onNav: nav }: { stats: DashStats; onNav: (module: string) => void }) {
  return (
    <div className="grid cols-4" style={{ marginBottom: 16 }}>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('customers')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Customers</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{s.totalCustomers}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.totalVehicles} vehicles on file</div>
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('job-cards')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Active Job Cards</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#2196f3', marginTop: 4 }}>{s.openJobCards}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>In progress</div>
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('repair-orders')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Open Repair Orders</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: s.openROs > 0 ? '#ff9800' : 'var(--text)', marginTop: 4 }}>{s.openROs}</div>
        {s.pendingROs > 0 ? (
          <button
            onClick={e => {
              e.stopPropagation();
              nav('repair-orders');
              setTimeout(() => window.dispatchEvent(new CustomEvent('filter-ro-status', { detail: { status: 'Pending' } })), 80);
            }}
            style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 4, display: 'block', textAlign: 'left' }}>
            ⚠ {s.pendingROs} pending action →
          </button>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>No pending</div>
        )}
      </div>
      <div className="card card-hero dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('estimates')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Estimates</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{s.totalEstimates}</div>
        <div style={{ fontSize: 12, color: s.approvedEstimates > 0 ? '#4caf50' : 'var(--muted)', marginTop: 4 }}>{s.approvedEstimates} approved</div>
      </div>
    </div>
  );
}
