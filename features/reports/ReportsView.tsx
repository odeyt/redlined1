'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Panel } from '@/components/Panel';
import { fetchShopSettings } from '@/services/shopSettingsService';

interface ReportData {
  // Revenue
  totalRevenuePaid: number;
  totalOutstanding: number;
  totalVoid: number;
  avgInvoiceValue: number;
  invoiceCount: number;
  paidCount: number;
  sentCount: number;
  // Payments
  totalPayments: number;
  paymentCount: number;
  methodBreakdown: { method: string; total: number; count: number }[];
  // Repair Orders
  totalROValue: number;
  totalLaborValue: number;
  totalPartsValue: number;
  roCount: number;
  completedROCount: number;
  avgLaborHours: number;
  // Customers
  totalCustomers: number;
  totalVehicles: number;
  // Estimates
  totalEstimates: number;
  approvedEstimates: number;
  declinedEstimates: number;
  convertedEstimates: number;
  estimateConvertRate: number;
  // Monthly revenue (last 6 months)
  monthlyRevenue: { month: string; revenue: number; payments: number }[];
  // Top customers
  topCustomers: { name: string; invoiceCount: number; totalSpend: number }[];
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ReportsView() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'repairs' | 'customers' | 'payments'>('overview');
  const [shopName, setShopName] = useState('Redlined1');
  const [toast, setToast] = useState('');

  useEffect(() => {
    load();
    fetchShopSettings().then(s => setShopName(s.companyName)).catch(() => {});
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function load() {
    setLoading(true);
    try {
      const [
        { data: invData },
        { data: payData },
        { data: roData },
        { count: custCount },
        { count: vehCount },
        { data: estData },
      ] = await Promise.all([
        supabase.from('invoices').select('number, customer, status, subtotal, tax, discount, shop_supplies, currency, created_at'),
        supabase.from('payments').select('amount, method, payment_date, currency, status'),
        supabase.from('repair_orders').select('status, labor_hours, parts_total, labor_rate, customer_name, created_at'),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('estimates').select('status'),
      ]);

      const invoices = invData ?? [];
      const pays = payData ?? [];
      const ros = roData ?? [];
      const ests = estData ?? [];

      const calcInvTotal = (i: Record<string, number>) =>
        (i.subtotal || 0) - (i.discount || 0) + (i.tax || 0) + (i.shop_supplies || 0);

      const paidInvs = invoices.filter(i => i.status === 'Paid');
      const sentInvs = invoices.filter(i => i.status === 'Sent');

      // Revenue = actual cash collected — exclude Void and Refunded to match Payments module
      const collectedPays = pays.filter((p: Record<string, unknown>) => p.status !== 'Void' && p.status !== 'Refunded');
      const totalPaymentsCollected = collectedPays.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
      // Invoice-based totals (for Revenue tab breakdown)
      const totalInvoicedPaid = paidInvs.reduce((s, i) => s + calcInvTotal(i), 0);
      const totalOutstanding = sentInvs.reduce((s, i) => s + calcInvTotal(i), 0);
      const totalVoid = invoices.filter(i => i.status === 'Void').reduce((s, i) => s + calcInvTotal(i), 0);
      // Avg: use payment average (actual collected transactions)
      const avgInvoiceValue = collectedPays.length > 0 ? totalPaymentsCollected / collectedPays.length
        : paidInvs.length > 0 ? totalInvoicedPaid / paidInvs.length : 0;

      // Payments by method — only collected (exclude Void/Refunded)
      const methodMap: Record<string, { total: number; count: number }> = {};
      for (const p of collectedPays) {
        const m = (p.method as string) || 'Unknown';
        if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 };
        methodMap[m].total += Number(p.amount ?? 0);
        methodMap[m].count += 1;
      }
      const methodBreakdown = Object.entries(methodMap)
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.total - a.total);

      // RO stats
      const nonVoidROs = ros.filter(r => r.status !== 'Void');
      const totalLaborValue = nonVoidROs.reduce((s, r) => s + (Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0)), 0);
      const totalPartsValue = nonVoidROs.reduce((s, r) => s + Number(r.parts_total ?? 0), 0);
      const avgLaborHours = nonVoidROs.length > 0
        ? nonVoidROs.reduce((s, r) => s + Number(r.labor_hours ?? 0), 0) / nonVoidROs.length
        : 0;

      // Monthly revenue — last 6 months
      const now = new Date();
      const monthlyRevenue: { month: string; revenue: number; payments: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const label = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
        // Revenue = payments collected in this month (exclude Void/Refunded)
        const rev = collectedPays
          .filter((p: Record<string, unknown>) => p.payment_date && (p.payment_date as string) >= d.toISOString() && (p.payment_date as string) < next.toISOString())
          .reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0);
        // Invoiced = paid invoices created this month (secondary view)
        const pymt = paidInvs
          .filter(inv => inv.created_at && inv.created_at >= d.toISOString() && inv.created_at < next.toISOString())
          .reduce((s, inv) => s + calcInvTotal(inv), 0);
        monthlyRevenue.push({ month: label, revenue: rev, payments: pymt });
      }

      // Top customers by total spend
      const custMap: Record<string, { invoiceCount: number; totalSpend: number }> = {};
      for (const inv of invoices.filter(i => i.status === 'Paid')) {
        const name = inv.customer || 'Unknown';
        if (!custMap[name]) custMap[name] = { invoiceCount: 0, totalSpend: 0 };
        custMap[name].invoiceCount += 1;
        custMap[name].totalSpend += calcInvTotal(inv);
      }
      const topCustomers = Object.entries(custMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 8);

      const convertedEsts = ests.filter(e => e.status === 'Converted').length;
      const approvedEsts = ests.filter(e => e.status === 'Approved').length;
      const declinedEsts = ests.filter(e => e.status === 'Declined').length;
      const convertRate = ests.length > 0 ? (convertedEsts / ests.length) * 100 : 0;

      setData({
        totalRevenuePaid: totalPaymentsCollected,   // payments table = source of truth
        totalOutstanding,
        totalVoid,
        avgInvoiceValue,
        invoiceCount: invoices.length,
        paidCount: paidInvs.length,
        sentCount: sentInvs.length,
        totalPayments: totalPaymentsCollected,
        paymentCount: collectedPays.length,
        methodBreakdown,
        totalROValue: totalLaborValue + totalPartsValue,
        totalLaborValue,
        totalPartsValue,
        roCount: ros.length,
        completedROCount: ros.filter(r => r.status === 'Complete' || r.status === 'Closed').length,
        avgLaborHours,
        totalCustomers: custCount ?? 0,
        totalVehicles: vehCount ?? 0,
        totalEstimates: ests.length,
        approvedEstimates: approvedEsts,
        declinedEstimates: declinedEsts,
        convertedEstimates: convertedEsts,
        estimateConvertRate: convertRate,
        monthlyRevenue,
        topCustomers,
      });
    } catch (e) {
      console.error('Reports load error', e);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    notify(`${filename} downloaded.`);
  }

  function exportRevenueSummary() {
    if (!data) return;
    exportCSV(
      [
        ['Report', 'Value'],
        ['Total Revenue (Paid)', fmtMoney(data.totalRevenuePaid)],
        ['Total Outstanding', fmtMoney(data.totalOutstanding)],
        ['Total Payments Collected', fmtMoney(data.totalPayments)],
        ['Avg Invoice Value', fmtMoney(data.avgInvoiceValue)],
        ['Total Invoices', String(data.invoiceCount)],
        ['Paid Invoices', String(data.paidCount)],
        ['Sent / Unpaid', String(data.sentCount)],
        ['', ''],
        ['Month', 'Revenue (Paid Inv)', 'Payments Recorded'],
        ...data.monthlyRevenue.map(m => [m.month, fmtMoney(m.revenue), fmtMoney(m.payments)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Revenue-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportROReport() {
    if (!data) return;
    exportCSV(
      [
        ['Metric', 'Value'],
        ['Total ROs', String(data.roCount)],
        ['Completed / Closed', String(data.completedROCount)],
        ['Total Labor Value', fmtMoney(data.totalLaborValue)],
        ['Total Parts Value', fmtMoney(data.totalPartsValue)],
        ['Total RO Value', fmtMoney(data.totalROValue)],
        ['Avg Labor Hours / RO', data.avgLaborHours.toFixed(2)],
      ],
      `${shopName.replace(/\s+/g, '-')}-RepairOrders-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportCustomerReport() {
    if (!data) return;
    exportCSV(
      [
        ['Customer', 'Paid Invoices', 'Total Spend'],
        ...data.topCustomers.map(c => [c.name, String(c.invoiceCount), fmtMoney(c.totalSpend)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Customers-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function exportPaymentReport() {
    if (!data) return;
    exportCSV(
      [
        ['Method', 'Count', 'Total'],
        ...data.methodBreakdown.map(m => [m.method, String(m.count), fmtMoney(m.total)]),
      ],
      `${shopName.replace(/\s+/g, '-')}-Payments-Report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'revenue', label: '💵 Revenue' },
    { id: 'repairs', label: '🔧 Repair Orders' },
    { id: 'payments', label: '💳 Payments' },
    { id: 'customers', label: '👥 Customers' },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
      Loading reports…
    </div>
  );

  const d = data!;
  const maxMonth = Math.max(...d.monthlyRevenue.map(m => Math.max(m.revenue, m.payments)), 1);
  const maxMethod = Math.max(...d.methodBreakdown.map(m => m.total), 1);
  const maxCust = Math.max(...d.topCustomers.map(c => c.totalSpend), 1);

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--line)', background: activeTab === t.id ? 'var(--accent)' : 'var(--surface-soft)', color: activeTab === t.id ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Revenue', value: fmtMoney(d.totalRevenuePaid), sub: `${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''} collected`, color: '#4caf50' },
              { label: 'Outstanding', value: fmtMoney(d.totalOutstanding), sub: `${d.sentCount} unpaid invoice${d.sentCount !== 1 ? 's' : ''}`, color: d.totalOutstanding > 0 ? '#f59e0b' : 'var(--text)' },
              { label: 'Total Invoiced', value: fmtMoney(d.totalOutstanding + d.totalRevenuePaid), sub: `${d.invoiceCount} invoice${d.invoiceCount !== 1 ? 's' : ''} (excl. void)`, color: 'var(--text)' },
              { label: 'Avg per Transaction', value: fmtMoney(d.avgInvoiceValue), sub: d.paymentCount > 0 ? `across ${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''}` : 'No payments yet', color: 'var(--text)' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Repair Orders', value: String(d.roCount), sub: `${d.completedROCount} completed`, color: 'var(--text)' },
              { label: 'Total RO Value', value: fmtMoney(d.totalROValue), sub: 'Labor + Parts', color: 'var(--text)' },
              { label: 'Customers', value: String(d.totalCustomers), sub: `${d.totalVehicles} vehicles`, color: 'var(--text)' },
              { label: 'Estimate Conversion', value: fmtPct(d.estimateConvertRate), sub: `${d.convertedEstimates} of ${d.totalEstimates}`, color: d.estimateConvertRate > 50 ? '#4caf50' : 'var(--text)' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* 6-Month Revenue Chart */}
          <Panel title="Monthly Revenue — Last 6 Months" hint="Paid invoices vs payments recorded per month">
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 140, padding: '8px 4px 0', marginBottom: 8 }}>
              {d.monthlyRevenue.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center', height: 110 }}>
                    {/* Revenue bar */}
                    <div title={`Revenue: ${fmtMoney(m.revenue)}`}
                      style={{ flex: 1, height: Math.max(3, Math.round((m.revenue / maxMonth) * 100)) + 'px', background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
                    {/* Payments bar */}
                    <div title={`Payments: ${fmtMoney(m.payments)}`}
                      style={{ flex: 1, height: Math.max(3, Math.round((m.payments / maxMonth) * 100)) + 'px', background: '#2196f3', borderRadius: '3px 3px 0 0', opacity: 0.7 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>{m.month}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />Revenue Collected (Payments)</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2196f3', borderRadius: 2, marginRight: 4, opacity: 0.7 }} />Paid Invoices (Invoice Date)</span>
            </div>
          </Panel>
        </>
      )}

      {/* ── REVENUE ── */}
      {activeTab === 'revenue' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportRevenueSummary}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Revenue Collected', value: fmtMoney(d.totalRevenuePaid), color: '#4caf50', sub: `${d.paymentCount} payment${d.paymentCount !== 1 ? 's' : ''} recorded` },
              { label: 'Outstanding (Unpaid)', value: fmtMoney(d.totalOutstanding), color: '#f59e0b', sub: `${d.sentCount} sent invoice${d.sentCount !== 1 ? 's' : ''}` },
              { label: 'Voided Invoices', value: fmtMoney(d.totalVoid), color: '#f44336', sub: 'Excluded from revenue' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <Panel title="Monthly Revenue Breakdown" hint="Last 6 months — paid invoices vs payments recorded">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Revenue Collected</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>Paid Invoices</th>
                  <th style={{ padding: '8px 10px' }} />
                </tr>
              </thead>
              <tbody>
                {d.monthlyRevenue.map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px' }}>{m.month}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: m.revenue > 0 ? '#4caf50' : 'var(--muted)' }}>{fmtMoney(m.revenue)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: m.payments > 0 ? '#2196f3' : 'var(--muted)' }}>{fmtMoney(m.payments)}</td>
                    <td style={{ padding: '10px', width: 160 }}>
                      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(m.revenue / maxMonth) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {/* ── REPAIR ORDERS ── */}
      {activeTab === 'repairs' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportROReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total RO Value', value: fmtMoney(d.totalROValue), sub: 'Labor + Parts', color: 'var(--text)' },
              { label: 'Total Labor Value', value: fmtMoney(d.totalLaborValue), sub: 'All non-void ROs', color: '#2196f3' },
              { label: 'Total Parts Value', value: fmtMoney(d.totalPartsValue), sub: 'All non-void ROs', color: '#ff9800' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Repair Orders', value: String(d.roCount), color: 'var(--text)' },
              { label: 'Completed / Closed', value: String(d.completedROCount), color: '#4caf50' },
              { label: 'Avg Labor Hours / RO', value: d.avgLaborHours.toFixed(1) + ' hrs', color: 'var(--text)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Labor vs Parts Split">
            <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ flex: d.totalLaborValue, background: '#2196f3' }} title={`Labor: ${fmtMoney(d.totalLaborValue)}`} />
              <div style={{ flex: d.totalPartsValue, background: '#ff9800' }} title={`Parts: ${fmtMoney(d.totalPartsValue)}`} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2196f3', borderRadius: 2, marginRight: 4 }} />Labor {fmtMoney(d.totalLaborValue)}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ff9800', borderRadius: 2, marginRight: 4 }} />Parts {fmtMoney(d.totalPartsValue)}</span>
            </div>
          </Panel>
        </>
      )}

      {/* ── PAYMENTS ── */}
      {activeTab === 'payments' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportPaymentReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Total Collected</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#4caf50', marginTop: 6 }}>{fmtMoney(d.totalPayments)}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Transactions</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{d.paymentCount}</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>Payment Methods</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{d.methodBreakdown.length}</div>
            </div>
          </div>

          <Panel title="Revenue by Payment Method">
            {d.methodBreakdown.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No payments recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.methodBreakdown.map(m => (
                  <div key={m.method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.method}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                        <span style={{ color: 'var(--muted)' }}>{m.count} txn{m.count !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 700 }}>{fmtMoney(m.total)}</span>
                      </div>
                    </div>
                    <div style={{ height: 10, background: 'var(--line)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.total / maxMethod) * 100}%`, background: 'var(--accent)', borderRadius: 5, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── CUSTOMERS ── */}
      {activeTab === 'customers' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={exportCustomerReport}>⬇ Export CSV</button>
          </div>

          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Customers', value: String(d.totalCustomers), color: 'var(--text)' },
              { label: 'Total Vehicles', value: String(d.totalVehicles), color: 'var(--text)' },
              { label: 'Estimates', value: String(d.totalEstimates), color: 'var(--text)' },
              { label: 'Convert Rate', value: fmtPct(d.estimateConvertRate), color: d.estimateConvertRate > 50 ? '#4caf50' : 'var(--text)' },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.07em' }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 6 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Top Customers by Revenue" hint="Based on paid invoices only">
            {d.topCustomers.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No paid invoices yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.topCustomers.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? 'var(--accent)' : 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#fff' : 'var(--muted)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <span style={{ color: 'var(--muted)' }}>{c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}</span>
                          <span style={{ fontWeight: 700, color: '#4caf50' }}>{fmtMoney(c.totalSpend)}</span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(c.totalSpend / maxCust) * 100}%`, background: i === 0 ? 'var(--accent)' : '#4caf50', borderRadius: 4, opacity: Math.max(0.4, 1 - i * 0.1) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Estimate Pipeline" hint="Approval and conversion funnel">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Estimates', value: d.totalEstimates, color: '#888' },
                { label: 'Approved', value: d.approvedEstimates, color: '#4caf50' },
                { label: 'Declined', value: d.declinedEstimates, color: '#f44336' },
                { label: 'Converted', value: d.convertedEstimates, color: '#2196f3' },
              ].map(e => (
                <div key={e.label} style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: 16, background: 'var(--surface-soft)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: e.color }}>{e.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{e.label}</div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
