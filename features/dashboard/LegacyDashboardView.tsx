'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchShopSettings, DEFAULT_ROLE_PERMISSIONS } from '@/services/shopSettingsService';
import type { RoleKey } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { navItems } from '@/lib/mock-data';
import { Icon, iconColors } from '@/components/Icon';
import { useOperationalStats } from './shared/useOperationalStats';
import { dashStyle } from './shared/styles';
import { RevenueKpiRow } from './shared/RevenueKpiRow';
import { OperationalKpiRow } from './shared/OperationalKpiRow';
import { RevenueChart } from './shared/RevenueChart';
import { InvoiceStatusPanel } from './shared/InvoiceStatusPanel';
import { RevenueByMonthTable } from './shared/RevenueByMonthTable';
import { RecentInvoicesTable } from './shared/RecentInvoicesTable';
import { RecentRepairOrdersTable } from './shared/RecentRepairOrdersTable';

const MODULE_TILE_EXCLUDE = new Set(['dashboard', 'billing', 'subscriptions', 'settings', 'system-health', 'disaster-recovery', 'testing-dashboard']);

function RoleDashboard({ role, allowedModules }: { role: string; allowedModules: string[] }) {
  const dispatch = useAppDispatch();
  const tiles = navItems.filter(([id]) => allowedModules.includes(id) && !MODULE_TILE_EXCLUDE.has(id));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          {role.charAt(0).toUpperCase() + role.slice(1)} — Quick Access
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
          Select a module to get started
        </p>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 14,
      }}>
        {tiles.map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => dispatch({ type: 'SET_MODULE', module: id })}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '22px 12px',
              background: 'var(--card-bg, rgba(255,255,255,0.04))',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 12, cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
              color: iconColors[id] || '#9eb2c2',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.09)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg, rgba(255,255,255,0.04))';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.09)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'none';
            }}
          >
            <Icon name={icon} style={{ color: iconColors[id] || '#9eb2c2', width: 28, height: 28 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ccc', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LegacyDashboardView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const isFinancialRole = role === 'owner' || role === 'manager';

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }

  const { stats, recentInvoices, recentROs, revenue7, monthlyRevenue, loading } = useOperationalStats();
  const [companyName, setCompanyName] = useState('Redlined1');
  const [userEmail, setUserEmail] = useState<string>('');
  const [allowedModules, setAllowedModules] = useState<string[]>([]);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setCompanyName(s.companyName);
      if (role && role !== 'owner' && role !== 'manager') {
        const saved = s.rolePermissions?.[role as RoleKey];
        setAllowedModules(saved?.length ? saved : DEFAULT_ROLE_PERMISSIONS[role as RoleKey] ?? []);
      }
    }).catch(() => {});
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, [role]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
      Loading dashboard…
    </div>
  );

  const greeting = (() => {
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = userEmail ? userEmail.split('@')[0] : '';
    return `${timeGreeting}${name ? `, ${name}` : ''} · ${companyName} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  })();

  // Non-financial roles (advisor, technician, unknown) get the module tile grid
  if (!isFinancialRole) {
    return (
      <>
        <style>{dashStyle}</style>
        <RoleDashboard role={role || 'staff'} allowedModules={allowedModules} />
        <div style={{ marginTop: 24, textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
          {greeting}
        </div>
      </>
    );
  }

  const s = stats!;

  return (
    <>
      <style>{dashStyle}</style>
      <RevenueKpiRow stats={s} onNav={nav} />
      <OperationalKpiRow stats={s} onNav={nav} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <RevenueChart revenue7={revenue7} onNav={nav} />
        <InvoiceStatusPanel stats={s} onNav={nav} />
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
      <div style={{ marginTop: 20, textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
        {greeting}
      </div>
    </>
  );
}
