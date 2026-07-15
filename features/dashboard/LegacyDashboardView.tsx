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

// Owners see billing/subscriptions/settings tiles; all other roles don't
const OWNER_TILE_EXCLUDE   = new Set(['dashboard', 'system-health', 'disaster-recovery', 'testing-dashboard']);
const STAFF_TILE_EXCLUDE   = new Set(['dashboard', 'billing', 'subscriptions', 'settings', 'system-health', 'disaster-recovery', 'testing-dashboard']);

const CATEGORIES: { key: string; label: string; emoji: string; ids: string[] }[] = [
  { key: 'all',          label: 'All Modules',    emoji: '⚡', ids: [] },
  { key: 'intake',       label: 'Intake',         emoji: '🚗', ids: ['triage', 'customers', 'vehicles', 'appointments'] },
  { key: 'jobs',         label: 'Jobs & Work',    emoji: '🔧', ids: ['job-cards', 'inspections', 'scheduling', 'repair-orders', 'technicians', 'time-tracking', 'job-archive'] },
  { key: 'parts',        label: 'Parts',          emoji: '📦', ids: ['parts', 'parts-estimates', 'parts-orders', 'parts-received'] },
  { key: 'diagnostics',  label: 'Diagnostics',    emoji: '🔬', ids: ['vin', 'dtc', 'diagnostics', 'ai', 'repair-intelligence'] },
  { key: 'comms',        label: 'Communication',  emoji: '💬', ids: ['communication'] },
  { key: 'admin',        label: 'Admin',          emoji: '⚙️', ids: ['settings', 'billing', 'subscriptions'] },
];

// Rich per-module color palettes: [accent, glow60, glow25]
const MODULE_PALETTE: Record<string, [string, string, string]> = {
  triage:               ['#22d3ee', '#22d3ee99', '#22d3ee40'],
  customers:            ['#34d399', '#34d39999', '#34d39940'],
  vehicles:             ['#fbbf24', '#fbbf2499', '#fbbf2440'],
  appointments:         ['#f472b6', '#f472b699', '#f472b640'],
  'job-cards':          ['#2dd4bf', '#2dd4bf99', '#2dd4bf40'],
  inspections:          ['#4ade80', '#4ade8099', '#4ade8040'],
  scheduling:           ['#c084fc', '#c084fc99', '#c084fc40'],
  'repair-orders':      ['#f87171', '#f8717199', '#f8717140'],
  technicians:          ['#fb7185', '#fb718599', '#fb718540'],
  'time-tracking':      ['#fbbf24', '#fbbf2499', '#fbbf2440'],
  'job-archive':        ['#94a3b8', '#94a3b899', '#94a3b840'],
  parts:                ['#a78bfa', '#a78bfa99', '#a78bfa40'],
  'parts-estimates':    ['#818cf8', '#818cf899', '#818cf840'],
  'parts-orders':       ['#60a5fa', '#60a5fa99', '#60a5fa40'],
  'parts-received':     ['#38bdf8', '#38bdf899', '#38bdf840'],
  communication:        ['#38bdf8', '#38bdf899', '#38bdf840'],
  vin:                  ['#22d3ee', '#22d3ee99', '#22d3ee40'],
  dtc:                  ['#fb923c', '#fb923c99', '#fb923c40'],
  diagnostics:          ['#60a5fa', '#60a5fa99', '#60a5fa40'],
  ai:                   ['#e879f9', '#e879f999', '#e879f940'],
  'repair-intelligence':['#86efac', '#86efac99', '#86efac40'],
  billing:              ['#f59e0b', '#f59e0b99', '#f59e0b40'],
  subscriptions:        ['#a78bfa', '#a78bfa99', '#a78bfa40'],
  settings:             ['#94a3b8', '#94a3b899', '#94a3b840'],
};

const ROLE_DASH_STYLES = `
  /* ── dark (default) ── */
  .rd-wrap { display:flex; gap:0; min-height:520px; background:#0a0a0f; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.06); }
  .rd-sidebar { width:200px; flex-shrink:0; background:#0d0d14; border-right:1px solid rgba(255,255,255,0.06); padding:20px 10px; display:flex; flex-direction:column; gap:2px; }
  .rd-sidebar-label { font-size:10px; font-weight:800; color:#e74c3c; text-transform:uppercase; letter-spacing:0.12em; padding:0 10px 14px; }
  .rd-cat-btn { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; border:none; cursor:pointer; background:transparent; color:#6b7280; font-size:12.5px; font-weight:500; text-align:left; width:100%; transition:all 0.15s; border-left:2px solid transparent; }
  .rd-cat-btn:hover { background:rgba(255,255,255,0.06); color:#94a3b8; }
  .rd-cat-btn.active { background:rgba(231,76,60,0.14); color:#e74c3c; font-weight:700; border-left:2px solid #e74c3c; }
  .rd-cat-emoji { font-size:14px; line-height:1; }
  .rd-main { flex:1; padding:24px; display:flex; flex-direction:column; }
  .rd-header { margin-bottom:20px; }
  .rd-header h2 { font-size:11px; font-weight:800; color:#6b7280; text-transform:uppercase; letter-spacing:0.12em; margin:0 0 3px; }
  .rd-header p { font-size:12px; color:#4b5563; margin:0; }
  .rd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; }
  .rd-tile { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:22px 10px 18px; background:#111118; border:1px solid rgba(255,255,255,0.07); border-radius:14px; cursor:pointer; position:relative; overflow:hidden; transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
  .rd-tile:hover { transform:translateY(-4px) scale(1.03); }
  .rd-tile.tile-active { background:#13131f; }
  .rd-icon-wrap { width:52px; height:52px; border-radius:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .rd-label { font-size:11px; font-weight:600; color:#94a3b8; text-align:center; line-height:1.35; letter-spacing:0.01em; }
  .rd-tile.tile-active .rd-label { color:#e2e8f0; }
  .rd-accent-bar { position:absolute; bottom:0; left:15%; right:15%; height:2px; border-radius:2px; }
  .rd-glow-blob { position:absolute; top:-30px; left:50%; transform:translateX(-50%); width:100px; height:100px; border-radius:50%; pointer-events:none; }

  /* ── light mode overrides ── */
  [data-theme="light"] .rd-wrap { background:#f4f6f9; border:1px solid #e2e8f0; }
  [data-theme="light"] .rd-sidebar { background:#ffffff; border-right:1px solid #e2e8f0; }
  [data-theme="light"] .rd-cat-btn { color:#6b7280; }
  [data-theme="light"] .rd-cat-btn:hover { background:rgba(0,0,0,0.04); color:#374151; }
  [data-theme="light"] .rd-cat-btn.active { background:rgba(204,0,0,0.08); color:#cc0000; border-left-color:#cc0000; }
  [data-theme="light"] .rd-sidebar-label { color:#cc0000; }
  [data-theme="light"] .rd-header h2 { color:#6b7280; }
  [data-theme="light"] .rd-header p { color:#9ca3af; }
  [data-theme="light"] .rd-tile { background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  [data-theme="light"] .rd-tile.tile-active { background:#fef2f2; border-color:#fca5a5; }
  [data-theme="light"] .rd-label { color:#374151; }
  [data-theme="light"] .rd-tile.tile-active .rd-label { color:#111111; }
`;

function RoleDashboard({ role, allowedModules, activeModule }: { role: string; allowedModules: string[]; activeModule: string }) {
  const dispatch = useAppDispatch();
  const [activeCategory, setActiveCategory] = useState('all');

  const excludeSet = (role === 'owner' || role === 'manager') ? OWNER_TILE_EXCLUDE : STAFF_TILE_EXCLUDE;
  const allTiles = navItems.filter(([id]) => allowedModules.includes(id) && !excludeSet.has(id));
  const visibleCategories = CATEGORIES.filter(c => c.key === 'all' || c.ids.some(id => allTiles.some(([tid]) => tid === id)));
  const tiles = activeCategory === 'all'
    ? allTiles
    : allTiles.filter(([id]) => CATEGORIES.find(c => c.key === activeCategory)?.ids.includes(id));

  const roleLabel = role === 'advisor' ? 'Service Advisor'
    : role === 'technician' ? 'Technician'
    : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div>
      <style>{ROLE_DASH_STYLES}</style>
      <div className="rd-wrap">
        {/* ── Tile grid ── */}
        <div className="rd-main">
          <div className="rd-header">
            <h2>{roleLabel}</h2>
            <p>Click a module to open it</p>
          </div>
          <div className="rd-grid">
            {tiles.map(([id, icon, label]) => {
              const [accent, glow60, glow25] = MODULE_PALETTE[id] ?? ['#9eb2c2', '#9eb2c299', '#9eb2c240'];
              const isActive = activeModule === id;
              return (
                <button
                  key={id}
                  className={`rd-tile${isActive ? ' tile-active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_MODULE', module: id })}
                  style={{
                    borderColor: isActive ? `${accent}55` : undefined,
                    boxShadow: isActive ? `0 0 24px ${glow25}, inset 0 1px 0 rgba(255,255,255,0.06)` : undefined,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
                    el.style.borderColor = isDark ? `${accent}77` : `${accent}99`;
                    el.style.boxShadow = isDark
                      ? `0 0 32px ${glow25}, 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`
                      : `0 4px 16px ${glow25}`;
                    el.style.background = isDark
                      ? `linear-gradient(160deg, ${glow25} 0%, #111118 60%)`
                      : `linear-gradient(160deg, ${glow25} 0%, #ffffff 70%)`;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = isActive ? `${accent}55` : '';
                    el.style.boxShadow = isActive ? `0 0 24px ${glow25}, inset 0 1px 0 rgba(255,255,255,0.06)` : '';
                    el.style.background = '';
                  }}
                >
                  {/* ambient glow blob behind icon */}
                  <div className="rd-glow-blob" style={{ background: `radial-gradient(circle, ${glow25} 0%, transparent 70%)` }} />

                  {/* icon container */}
                  <div className="rd-icon-wrap" style={{
                    background: `linear-gradient(135deg, ${glow25} 0%, rgba(255,255,255,0.04) 100%)`,
                    border: `1px solid ${accent}44`,
                    boxShadow: `0 0 16px ${glow25}, inset 0 1px 0 rgba(255,255,255,0.1)`,
                  }}>
                    <Icon name={icon} style={{ color: accent, width: 26, height: 26 }} />
                  </div>

                  <span className="rd-label">{label}</span>

                  {/* active bottom accent */}
                  {isActive && (
                    <div className="rd-accent-bar" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
                  )}
                </button>
              );
            })}
          </div>
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
      if (role === 'owner' || role === 'manager') {
        // Owners/managers get all modules as tiles
        setAllowedModules(navItems.map(([id]) => id));
      } else if (role) {
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

  // All roles: tile grid first
  // Owner/manager: also show financial intel panels below
  return (
    <>
      <style>{dashStyle}</style>

      {/* ── Module tile grid — all roles ── */}
      <RoleDashboard role={role || 'staff'} allowedModules={allowedModules} activeModule={activeModule} />

      {/* ── Financial Intelligence — owner / manager only ── */}
      {isFinancialRole && stats && (() => {
        const s = stats;
        return (
          <>
            <div className="dash-fin-head">
              <span className="dash-fin-head-label">Financial Intelligence</span>
              <div className="dash-fin-head-line" />
            </div>
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
          </>
        );
      })()}

      <div style={{ marginTop: 24, textAlign: 'center', padding: '14px 0', color: 'var(--muted)', fontSize: 13 }}>
        {greeting}
      </div>
    </>
  );
}
