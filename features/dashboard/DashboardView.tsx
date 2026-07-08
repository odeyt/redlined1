'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/Panel';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { getShopId } from '@/lib/shopStore';
import { formatMoney, CURRENCIES } from '@/services/invoiceService';

interface DashStats {
  totalCustomers: number;
  totalVehicles: number;
  openJobCards: number;
  openROs: number;
  pendingROs: number;
  draftInvoices: number;
  sentInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
  revenueByCurrency: Record<string, number>;
  outstanding: number;
  outstandingByCurrency: Record<string, number>;
  totalEstimates: number;
  approvedEstimates: number;
  paymentsToday: number;
  revenueToday: number;
  revenueTodayByCurrency: Record<string, number>;
  totalParts: number;
  lowStockParts: number;
}

interface RecentInvoice {
  number: string;
  customer: string;
  total: number;
  status: string;
  currency: string;
}

interface RecentRO {
  roNumber: string;
  customerName: string;
  vehicle: string;
  status: string;
  laborHours: number;
  laborRate: number;
  partsTotal: number;
  technician: string;
  openedDate: string;
  currency: string;
}

interface RevenueDay {
  date: string;
  amount: number;
  byCurrency: Record<string, number>;
}

const STATUS_COLOR: Record<string, string> = {
  'Draft': '#888',
  'Sent': '#2196f3',
  'Paid': '#4caf50',
  'Void': '#f44336',
  'Open': '#2196f3',
  'In Progress': '#ff9800',
  'Complete': '#4caf50',
  'Closed': '#9e9e9e',
  'Pending Parts': '#9c27b0',
  'Pending Approval': '#f59e0b',
};


const cardClick: React.CSSProperties = {
  cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
};

const dashStyle = `
  .dash-kpi:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.13);
    background: var(--surface-soft) !important;
  }
  .dash-row:hover {
    background: var(--surface-soft) !important;
  }
  .dash-parts:hover {
    background: var(--surface-soft) !important;
  }
  .dash-bar:hover {
    filter: brightness(1.25);
    transform: scaleY(1.04);
    transform-origin: bottom;
  }
`;

export function DashboardView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const isTech = role === 'technician';

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }
  const [stats, setStats] = useState<DashStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [recentROs, setRecentROs] = useState<RecentRO[]>([]);
  const [revenue7, setRevenue7] = useState<RevenueDay[]>([]);
  const [companyName, setCompanyName] = useState('Redlined1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    fetchShopSettings().then(s => setCompanyName(s.companyName)).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const [
        { count: custCount },
        { count: vehCount },
        { data: jobData },
        { data: roData },
        { data: invData },
        { data: estData },
        { data: payData },
        { data: partsData },
      ] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('shop_id', getShopId()),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('shop_id', getShopId()),
        supabase.from('job_cards').select('status').eq('shop_id', getShopId()),
        supabase.from('repair_orders').select('status, ro_number, customer_name, vehicle, labor_hours, parts_total, labor_rate, technician, opened_date, currency').eq('shop_id', getShopId()).order('created_at', { ascending: false }),
        supabase.from('invoices').select('number, customer, status, lines, discount, shop_supplies, tax_rate, currency, paid_date').eq('shop_id', getShopId()).order('created_at', { ascending: false }),
        supabase.from('estimates').select('status').eq('shop_id', getShopId()),
        supabase.from('payments').select('amount, payment_date, currency').eq('shop_id', getShopId()).order('payment_date', { ascending: false }),
        supabase.from('parts').select('id, quantity, reorder_point').eq('shop_id', getShopId()),
      ]);

      // Invoice stats — compute effective total from lines (same logic as getEffectiveTotal)
      const invoices = invData ?? [];
      const paidInvs = invoices.filter(i => i.status === 'Paid');
      const sentInvs = invoices.filter(i => i.status === 'Sent');
      const draftInvs = invoices.filter(i => i.status === 'Draft');
      const unpaidInvs = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Void');

      // Returns { amount, currency } — mirrors getEffectiveTotal in invoiceService
      function calcInvEffective(inv: Record<string, unknown>): { amount: number; currency: string } {
        const lines = Array.isArray(inv.lines) ? inv.lines as { qty: number; rate: number; currency?: string }[] : [];
        const currency = (inv.currency as string) || 'USD';
        const discount = Number(inv.discount ?? 0);
        const shopSupplies = Number(inv.shop_supplies ?? 0);
        const taxRate = Number(inv.tax_rate ?? 0);
        const byCur: Record<string, number> = {};
        for (const l of lines) {
          const lc = l.currency || currency;
          byCur[lc] = (byCur[lc] ?? 0) + (l.qty || 0) * (l.rate || 0);
        }
        const baseSub = byCur[currency] ?? 0;
        const foreignCurs = Object.keys(byCur).filter(c => c !== currency);
        if (baseSub === 0 && foreignCurs.length === 1) {
          const fc = foreignCurs[0];
          return { amount: Math.max(byCur[fc] - discount, 0) + shopSupplies, currency: fc };
        }
        const taxable = Math.max(baseSub - discount, 0) + shopSupplies;
        return { amount: taxable + taxable * taxRate, currency };
      }

      // Group totals by currency for revenue and outstanding
      const revenueByCurrency: Record<string, number> = {};
      for (const inv of paidInvs) {
        const { amount, currency } = calcInvEffective(inv);
        revenueByCurrency[currency] = (revenueByCurrency[currency] ?? 0) + amount;
      }
      const outstandingByCurrency: Record<string, number> = {};
      for (const inv of unpaidInvs) {
        const { amount, currency } = calcInvEffective(inv);
        outstandingByCurrency[currency] = (outstandingByCurrency[currency] ?? 0) + amount;
      }
      const totalRevenue = Object.values(revenueByCurrency).reduce((s, v) => s + v, 0);
      const outstanding = Object.values(outstandingByCurrency).reduce((s, v) => s + v, 0);

      // Payments today (used for payment count only)
      const pays = payData ?? [];
      const todayPays = pays.filter(p => p.payment_date && p.payment_date >= todayISO);

      // Today's revenue = invoices marked Paid today, grouped by effective currency
      const paidTodayInvs = paidInvs.filter(i => i.paid_date && i.paid_date >= todayISO);
      const revenueTodayByCurrency: Record<string, number> = {};
      for (const inv of paidTodayInvs) {
        const { amount, currency } = calcInvEffective(inv);
        revenueTodayByCurrency[currency] = (revenueTodayByCurrency[currency] ?? 0) + amount;
      }
      const revenueToday = Object.values(revenueTodayByCurrency).reduce((s, v) => s + v, 0);

      // Parts low stock
      const parts = partsData ?? [];
      const lowStock = parts.filter(p => Number(p.quantity ?? 0) <= Number(p.reorder_point ?? 5)).length;

      // RO stats
      const ros = roData ?? [];
      const openROs = ros.filter(r => r.status === 'Open' || r.status === 'In Progress').length;
      const pendingROs = ros.filter(r => r.status === 'Pending Parts' || r.status === 'Pending Approval').length;

      // Estimates
      const ests = estData ?? [];

      setStats({
        totalCustomers: custCount ?? 0,
        totalVehicles: vehCount ?? 0,
        openJobCards: (jobData ?? []).filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length,
        openROs,
        pendingROs,
        draftInvoices: draftInvs.length,
        sentInvoices: sentInvs.length,
        paidInvoices: paidInvs.length,
        unpaidInvoices: unpaidInvs.length,
        totalRevenue,
        revenueByCurrency,
        outstanding,
        outstandingByCurrency,
        totalEstimates: ests.length,
        approvedEstimates: ests.filter(e => e.status === 'Approved').length,
        paymentsToday: paidTodayInvs.length,
        revenueToday,
        revenueTodayByCurrency,
        totalParts: parts.length,
        lowStockParts: lowStock,
      });

      // Recent invoices
      setRecentInvoices(
        invoices.slice(0, 6).map(i => {
          const eff = calcInvEffective(i);
          return { number: i.number, customer: i.customer, total: eff.amount, status: i.status, currency: eff.currency };
        })
      );

      // Recent ROs
      setRecentROs(
        ros.slice(0, 6).map(r => ({
          roNumber: r.ro_number,
          customerName: r.customer_name,
          vehicle: r.vehicle,
          status: r.status,
          laborHours: Number(r.labor_hours ?? 0),
          laborRate: Number(r.labor_rate ?? 0),
          partsTotal: Number(r.parts_total ?? 0),
          technician: r.technician ?? '',
          openedDate: r.opened_date ?? '',
          currency: (r.currency as string) || 'USD',
        }))
      );

      // Revenue last 7 days from paid invoices grouped by currency
      const days: RevenueDay[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const dayInvs = paidInvs.filter(inv => {
          const pd = inv.paid_date as string;
          return pd && pd >= d.toISOString() && pd < next.toISOString();
        });
        const byCurrency: Record<string, number> = {};
        for (const inv of dayInvs) {
          const { amount, currency } = calcInvEffective(inv);
          byCurrency[currency] = (byCurrency[currency] ?? 0) + amount;
        }
        const amount = Object.values(byCurrency).reduce((s, v) => s + v, 0);
        days.push({ date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), amount, byCurrency });
      }
      setRevenue7(days);
    } catch (e) {
      console.error('Dashboard load error', e);
    } finally {
      setLoading(false);
    }
  }

  const maxRevDay = Math.max(...revenue7.map(d => d.amount), 1);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
      Loading dashboard…
    </div>
  );

  const s = stats!;

  return (
    <>
      <style>{dashStyle}</style>
      {/* ── KPI Row 1 — financial (owner/manager only) ── */}
      {!isTech && (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
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
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
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
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('payments')}>
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
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Draft Invoices</div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.draftInvoices > 0 ? '#ff9800' : 'var(--text)', marginTop: 4 }}>{s.draftInvoices}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Ready to send</div>
          </div>
        </div>
      )}

      {/* ── KPI Row 2 ── */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('customers')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Customers</div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{s.totalCustomers}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.totalVehicles} vehicles on file</div>
        </div>
        <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('job-cards')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Active Job Cards</div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#2196f3', marginTop: 4 }}>{s.openJobCards}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>In progress</div>
        </div>
        <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('repair-orders')}>
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
        <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('estimates')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Estimates</div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{s.totalEstimates}</div>
          <div style={{ fontSize: 12, color: s.approvedEstimates > 0 ? '#4caf50' : 'var(--muted)', marginTop: 4 }}>{s.approvedEstimates} approved</div>
        </div>
      </div>

      {!isTech && <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Revenue Bar Chart */}
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

        {/* Invoice Status Breakdown */}
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
      </div>}

      {!isTech && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent Invoices */}
        <Panel title="Recent Invoices" hint="Latest 6 invoices — click any row to open Invoices">
          {recentInvoices.length === 0 ? (
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
                {recentInvoices.map(inv => (
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

        {/* Active Repair Orders */}
        <Panel title="Active Repair Orders" hint="Latest open / in-progress ROs — click any row to open Repair Orders">
          {recentROs.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No repair orders yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>RO #</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Customer</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Total</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentROs.map(ro => (
                  <tr key={ro.roNumber} className="dash-row" style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => nav('repair-orders')}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{ro.roNumber}</td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ color: 'var(--text)' }}>{ro.customerName}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ro.vehicle}</div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(ro.laborHours * ro.laborRate + ro.partsTotal, ro.currency)}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: (STATUS_COLOR[ro.status] || '#888') + '22', color: STATUS_COLOR[ro.status] || '#888' }}>{ro.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>}

      {/* Shop greeting footer */}
      <div style={{ marginTop: 20, textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
        {companyName} · Dashboard · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </>
  );
}
