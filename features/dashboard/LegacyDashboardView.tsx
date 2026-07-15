'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchShopSettings, DEFAULT_ROLE_PERMISSIONS } from '@/services/shopSettingsService';
import type { RoleKey } from '@/services/shopSettingsService';
import { useShop } from '@/lib/useShop';
import { useAppDispatch, useAppState } from '@/lib/store';
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

const CATEGORIES: { key: string; label: string; emoji: string; ids: string[] }[] = [
  { key: 'all',          label: 'All Modules',    emoji: '⚡', ids: [] },
  { key: 'intake',       label: 'Intake',         emoji: '🚗', ids: ['triage', 'customers', 'vehicles', 'appointments'] },
  { key: 'jobs',         label: 'Jobs & Work',    emoji: '🔧', ids: ['job-cards', 'inspections', 'scheduling', 'repair-orders', 'technicians', 'time-tracking', 'job-archive'] },
  { key: 'parts',        label: 'Parts',          emoji: '📦', ids: ['parts', 'parts-estimates', 'parts-orders', 'parts-received'] },
  { key: 'diagnostics',  label: 'Diagnostics',    emoji: '🔬', ids: ['vin', 'dtc', 'diagnostics', 'ai', 'repair-intelligence'] },
  { key: 'comms',        label: 'Communication',  emoji: '💬', ids: ['communication'] },
];

// Rich per-module color palettes: [from, to, glow]
const MODULE_PALETTE: Record<string, [string, string, string]> = {
  triage:          ['#0ea5e9', '#06b6d4', '#0ea5e940'],
  customers:       ['#10b981', '#059669', '#10b98140'],
  vehicles:        ['#f59e0b', '#d97706', '#f59e0b40'],
  appointments:    ['#ec4899', '#db2777', '#ec489940'],
  'job-cards':     ['#14b8a6', '#0d9488', '#14b8a640'],
  inspections:     ['#22c55e', '#16a34a', '#22c55e40'],
  scheduling:      ['#a855f7', '#9333ea', '#a855f740'],
  'repair-orders': ['#ef4444', '#dc2626', '#ef444440'],
  technicians:     ['#f43f5e', '#e11d48', '#f43f5e40'],
  'time-tracking': ['#f59e0b', '#b45309', '#f59e0b40'],
  'job-archive':   ['#64748b', '#475569', '#64748b40'],
  parts:           ['#8b5cf6', '#7c3aed', '#8b5cf640'],
  'parts-estimates':['#6366f1','#4f46e5','#6366f140'],
  'parts-orders':  ['#3b82f6', '#2563eb', '#3b82f640'],
  'parts-received':['#0ea5e9', '#0284c7', '#0ea5e940'],
  communication:   ['#0ea5e9', '#0284c7', '#0ea5e940'],
  vin:             ['#06b6d4', '#0891b2', '#06b6d440'],
  dtc:             ['#f97316', '#ea580c', '#f9731640'],
  diagnostics:     ['#3b82f6', '#1d4ed8', '#3b82f640'],
  ai:              ['#9b5de5', '#7c3aed', '#9b5de540'],
  'repair-intelligence': ['#4caf50', '#388e3c', '#4caf5040'],
};

function RoleDashboard({ role, allowedModules, activeModule }: { role: string; allowedModules: string[]; activeModule: string }) {
  const dispatch = useAppDispatch();
  const [activeCategory, setActiveCategory] = useState('all');

  const allTiles = navItems.filter(([id]) => allowedModules.includes(id) && !MODULE_TILE_EXCLUDE.has(id));
  const visibleCategories = CATEGORIES.filter(c => c.key === 'all' || c.ids.some(id => allTiles.some(([tid]) => tid === id)));
  const tiles = activeCategory === 'all'
    ? allTiles
    : allTiles.filter(([id]) => CATEGORIES.find(c => c.key === activeCategory)?.ids.includes(id));

  const roleLabel = role === 'advisor' ? 'Service Advisor'
    : role === 'technician' ? 'Technician'
    : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 500 }}>
      {/* ── Category sidebar ── */}
      <div style={{
        width: 180, flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 8px 8px' }}>
          {roleLabel}
        </div>
        {visibleCategories.map(cat => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: isActive ? 'rgba(192,57,43,0.18)' : 'transparent',
                color: isActive ? '#e74c3c' : '#888',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                textAlign: 'left', width: '100%',
                transition: 'background 0.15s, color 0.15s',
                borderLeft: isActive ? '3px solid #e74c3c' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15 }}>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tile grid ── */}
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.09em', margin: 0 }}>
            {visibleCategories.find(c => c.key === activeCategory)?.label ?? 'All Modules'}
          </h2>
          <p style={{ fontSize: 11, color: '#555', margin: '3px 0 0' }}>Click a module to open it</p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: 12,
        }}>
          {tiles.map(([id, icon, label]) => {
            const palette = MODULE_PALETTE[id] ?? ['#9eb2c2', '#7a9bb5', '#9eb2c220'];
            const [from, to, glow] = palette;
            const isActive = activeModule === id;
            return (
              <button
                key={id}
                onClick={() => dispatch({ type: 'SET_MODULE', module: id })}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: '24px 10px 20px',
                  background: isActive
                    ? `linear-gradient(145deg, ${from}33, ${to}22)`
                    : 'rgba(255,255,255,0.03)',
                  border: isActive ? `1.5px solid ${from}88` : '1.5px solid rgba(255,255,255,0.07)',
                  borderRadius: 14, cursor: 'pointer',
                  boxShadow: isActive ? `0 0 18px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                  transition: 'all 0.18s ease',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = `linear-gradient(145deg, ${from}28, ${to}18)`;
                  el.style.borderColor = `${from}66`;
                  el.style.boxShadow = `0 0 22px ${glow}, 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`;
                  el.style.transform = 'translateY(-3px) scale(1.02)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = isActive ? `linear-gradient(145deg, ${from}33, ${to}22)` : 'rgba(255,255,255,0.03)';
                  el.style.borderColor = isActive ? `${from}88` : 'rgba(255,255,255,0.07)';
                  el.style.boxShadow = isActive ? `0 0 18px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none';
                  el.style.transform = 'none';
                }}
              >
                {/* Icon glow blob */}
                <div style={{
                  position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
                  width: 80, height: 80, borderRadius: '50%',
                  background: `radial-gradient(circle, ${from}18 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `linear-gradient(135deg, ${from}22, ${to}18)`,
                  border: `1px solid ${from}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 10px ${glow}`,
                }}>
                  <Icon name={icon} style={{ color: from, width: 24, height: 24 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#ccc', textAlign: 'center', lineHeight: 1.35, letterSpacing: '0.01em' }}>
                  {label}
                </span>
                {isActive && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 2,
                    background: `linear-gradient(90deg, transparent, ${from}, transparent)`,
                    borderRadius: 2,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LegacyDashboardView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const { activeModule } = useAppState();
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
        <RoleDashboard role={role || 'staff'} allowedModules={allowedModules} activeModule={activeModule} />
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
