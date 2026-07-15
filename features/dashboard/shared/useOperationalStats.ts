import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { DashStats, RecentInvoice, RecentRO, RevenueDay, MonthRevenue } from './types';

/**
 * Verbatim extraction of the operational-stats load() logic that used to
 * live inline in DashboardView.tsx. No logic changes — only the currency-
 * aware calcInvEffective math and its callers moved, unchanged, into a hook
 * so both the legacy Dashboard and the Command Center's Operational Metrics
 * section can share one implementation instead of duplicating it.
 */
export function useOperationalStats() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [recentROs, setRecentROs] = useState<RecentRO[]>([]);
  const [revenue7, setRevenue7] = useState<RevenueDay[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use local date string (YYYY-MM-DD) for all date comparisons to avoid UTC offset issues
      const localDateStr = (d: string | null | undefined): string => {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in local time
      };
      const todayStr = new Date().toLocaleDateString('en-CA');

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
      const todayPays = pays.filter(p => localDateStr(p.payment_date) === todayStr);

      // Today's revenue = invoices marked Paid today, grouped by effective currency
      const paidTodayInvs = paidInvs.filter(i => localDateStr(i.paid_date) === todayStr);
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

      // Revenue last 7 days from paid invoices grouped by currency (local date comparison)
      const days: RevenueDay[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD local
        const dayInvs = paidInvs.filter(inv => localDateStr(inv.paid_date as string) === dayStr);
        const byCurrency: Record<string, number> = {};
        for (const inv of dayInvs) {
          const { amount, currency } = calcInvEffective(inv);
          byCurrency[currency] = (byCurrency[currency] ?? 0) + amount;
        }
        const amount = Object.values(byCurrency).reduce((s, v) => s + v, 0);
        days.push({ date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), amount, byCurrency });
      }
      setRevenue7(days);

      // Monthly revenue — last 12 months, grouped by currency
      const monthMap: Record<string, Record<string, number>> = {};
      for (const inv of paidInvs) {
        const pd = inv.paid_date as string;
        if (!pd) continue;
        const dt = new Date(pd);
        const key = dt.toLocaleDateString('en-CA').slice(0, 7); // 'YYYY-MM'
        if (!monthMap[key]) monthMap[key] = {};
        const { amount, currency } = calcInvEffective(inv);
        monthMap[key][currency] = (monthMap[key][currency] ?? 0) + amount;
      }
      // Sort months descending, keep last 12
      const sortedMonths = Object.keys(monthMap).sort().reverse().slice(0, 12);
      setMonthlyRevenue(sortedMonths.map(key => {
        const [yr, mo] = key.split('-');
        const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return { key, label, byCurrency: monthMap[key] };
      }));
    } catch (e) {
      console.error('Dashboard load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, recentInvoices, recentROs, revenue7, monthlyRevenue, loading, reload: load };
}
