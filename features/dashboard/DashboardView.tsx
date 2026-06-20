'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/Panel';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';

interface DashStats {
  totalCustomers: number;
  totalVehicles: number;
  openJobCards: number;
  openROs: number;
  pendingROs: number;
  draftInvoices: number;
  sentInvoices: number;
  paidInvoices: number;
  totalRevenue: number;
  outstanding: number;
  totalEstimates: number;
  approvedEstimates: number;
  paymentsToday: number;
  revenueToday: number;
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
}

interface RevenueDay {
  date: string;
  amount: number;
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

function fmtMoney(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; }

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
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('job_cards').select('status'),
        supabase.from('repair_orders').select('status, ro_number, customer_name, vehicle, labor_hours, parts_total, labor_rate, technician, opened_date').order('created_at', { ascending: false }),
        supabase.from('invoices').select('number, customer, status, subtotal, tax, discount, shop_supplies, currency').order('created_at', { ascending: false }),
        supabase.from('estimates').select('status'),
        supabase.from('payments').select('amount, payment_date, currency').order('payment_date', { ascending: false }),
        supabase.from('parts').select('id, quantity, reorder_point'),
      ]);

      // Invoice stats
      const invoices = invData ?? [];
      const paidInvs = invoices.filter(i => i.status === 'Paid');
      const sentInvs = invoices.filter(i => i.status === 'Sent');
      const draftInvs = invoices.filter(i => i.status === 'Draft');
      const calcTotal = (i: Record<string, number>) => ((i.subtotal || 0) - (i.discount || 0) + (i.tax || 0) + (i.shop_supplies || 0));
      const totalRevenue = paidInvs.reduce((s, i) => s + calcTotal(i), 0);
      const outstanding = sentInvs.reduce((s, i) => s + calcTotal(i), 0);

      // Payments today
      const pays = payData ?? [];
      const todayPays = pays.filter(p => p.payment_date && p.payment_date >= todayISO);
      const revenueToday = todayPays.reduce((s, p) => s + Number(p.amount ?? 0), 0);

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
        totalRevenue,
        outstanding,
        totalEstimates: ests.length,
        approvedEstimates: ests.filter(e => e.status === 'Approved').length,
        paymentsToday: todayPays.length,
        revenueToday,
        totalParts: parts.length,
        lowStockParts: lowStock,
      });

      // Recent invoices
      setRecentInvoices(
        invoices.slice(0, 6).map(i => ({
          number: i.number,
          customer: i.customer,
          total: calcTotal(i),
          status: i.status,
          currency: i.currency ?? 'USD',
        }))
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
        }))
      );

      // Revenue last 7 days from payments
      const days: RevenueDay[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const dayTotal = pays
          .filter(p => p.payment_date && p.payment_date >= d.toISOString() && p.payment_date < next.toISOString())
          .reduce((s, p) => s + Number(p.amount ?? 0), 0);
        days.push({ date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), amount: dayTotal });
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
            <div style={{ fontSize: 26, fontWeight: 800, color: '#4caf50', marginTop: 4 }}>{fmtMoney(s.totalRevenue)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.paidInvoices} paid invoices</div>
          </div>
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('invoices')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Outstanding</div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.outstanding > 0 ? '#f59e0b' : 'var(--text)', marginTop: 4 }}>{fmtMoney(s.outstanding)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.sentInvoices} sent invoices</div>
          </div>
          <div className="card dash-kpi" style={{ padding: 18, ...cardClick }} onClick={() => nav('payments')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Today's Revenue</div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>→</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#2196f3', marginTop: 4 }}>{fmtMoney(s.revenueToday)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.paymentsToday} payment{s.paymentsToday !== 1 ? 's' : ''} recorded</div>
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
          <div style={{ fontSize: 12, color: s.pendingROs > 0 ? '#f59e0b' : 'var(--muted)', marginTop: 4 }}>{s.pendingROs > 0 ? `⚠ ${s.pendingROs} pending action` : 'No pending'}</div>
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
        <Panel title="Revenue — Last 7 Days" hint="Payments received per day">
          {revenue7.every(d => d.amount === 0) ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>No payments recorded in the last 7 days.</p>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 140, padding: '8px 4px 0' }}>
              {revenue7.map((day, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: day.amount > 0 ? 'var(--text)' : 'var(--muted)' }}>
                    {day.amount > 0 ? '$' + (day.amount >= 1000 ? (day.amount / 1000).toFixed(1) + 'k' : day.amount.toFixed(0)) : ''}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: Math.max(4, Math.round((day.amount / maxRevDay) * 100)) + 'px',
                      background: day.amount > 0 ? 'var(--accent)' : 'var(--line)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s',
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
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(inv.total)}</td>
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
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ro.laborHours * ro.laborRate + ro.partsTotal)}</td>
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
