'use client';

import { useOperationalStats } from '@/features/dashboard/shared/useOperationalStats';
import { dashStyle } from '@/features/dashboard/shared/styles';
import { RevenueKpiRow } from '@/features/dashboard/shared/RevenueKpiRow';
import { OperationalKpiRow } from '@/features/dashboard/shared/OperationalKpiRow';
import { RevenueChart } from '@/features/dashboard/shared/RevenueChart';
import { InvoiceStatusPanel } from '@/features/dashboard/shared/InvoiceStatusPanel';
import { RevenueByMonthTable } from '@/features/dashboard/shared/RevenueByMonthTable';
import { RecentInvoicesTable } from '@/features/dashboard/shared/RecentInvoicesTable';
import { RecentRepairOrdersTable } from '@/features/dashboard/shared/RecentRepairOrdersTable';

/**
 * Reuses the exact same widget components as the (legacy, flag-off) Dashboard
 * — same shared/ implementation, one more consumer, not a copy. This is the
 * "move Dashboard's operational content into Command Center" half of the
 * refactor; the components themselves live in features/dashboard/shared/
 * and are imported here, never duplicated.
 */
export function OperationalMetricsSection({ onNav: nav }: { onNav: (module: string) => void }) {
  const { stats, recentInvoices, recentROs, revenue7, monthlyRevenue, loading } = useOperationalStats();

  if (loading || !stats) {
    return <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading operational metrics…</p>;
  }

  return (
    <>
      <style>{dashStyle}</style>
      <div style={{ marginBottom: 16 }}>
        <RevenueKpiRow stats={stats} onNav={nav} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <OperationalKpiRow stats={stats} onNav={nav} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <RevenueChart revenue7={revenue7} onNav={nav} />
        <InvoiceStatusPanel stats={stats} onNav={nav} />
      </div>
      {monthlyRevenue.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <RevenueByMonthTable monthlyRevenue={monthlyRevenue} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <RecentInvoicesTable invoices={recentInvoices} onNav={nav} />
        <RecentRepairOrdersTable ros={recentROs} onNav={nav} />
      </div>
    </>
  );
}
