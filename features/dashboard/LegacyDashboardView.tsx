'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { useOperationalStats } from './shared/useOperationalStats';
import { dashStyle } from './shared/styles';
import { RevenueKpiRow } from './shared/RevenueKpiRow';
import { OperationalKpiRow } from './shared/OperationalKpiRow';
import { RevenueChart } from './shared/RevenueChart';
import { InvoiceStatusPanel } from './shared/InvoiceStatusPanel';
import { RevenueByMonthTable } from './shared/RevenueByMonthTable';
import { RecentInvoicesTable } from './shared/RecentInvoicesTable';
import { RecentRepairOrdersTable } from './shared/RecentRepairOrdersTable';

export function LegacyDashboardView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const isTech = role === 'technician' || role === 'advisor';

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }

  const { stats, recentInvoices, recentROs, revenue7, monthlyRevenue, loading } = useOperationalStats();
  const [companyName, setCompanyName] = useState('Redlined1');
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    fetchShopSettings().then(s => setCompanyName(s.companyName)).catch(() => {});
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

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
      {!isTech && <RevenueKpiRow stats={s} onNav={nav} />}

      {/* ── KPI Row 2 ── */}
      <OperationalKpiRow stats={s} onNav={nav} />

      {!isTech && <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <RevenueChart revenue7={revenue7} onNav={nav} />
        <InvoiceStatusPanel stats={s} onNav={nav} />
      </div>}

      {!isTech && monthlyRevenue.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <RevenueByMonthTable monthlyRevenue={monthlyRevenue} />
        </div>
      )}

      {!isTech && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <RecentInvoicesTable invoices={recentInvoices} onNav={nav} />
        <RecentRepairOrdersTable ros={recentROs} onNav={nav} />
      </div>}

      {/* Shop greeting footer */}
      <div style={{ marginTop: 20, textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
        {(() => {
          const hour = new Date().getHours();
          const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
          const name = userEmail ? userEmail.split('@')[0] : '';
          return `${timeGreeting}${name ? `, ${name}` : ''} · ${companyName} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        })()}
      </div>
    </>
  );
}
