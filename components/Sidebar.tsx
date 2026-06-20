'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { useAppState, useAppDispatch } from '@/lib/store';
import { navItems } from '@/lib/mock-data';
import { Icon, iconColors } from './Icon';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LOGO_SRC } from '@/lib/logo';
import { fetchShopSettings, DEFAULT_ROLE_PERMISSIONS, RolePermissions, RoleKey } from '@/services/shopSettingsService';
import { usePlan } from '@/lib/usePlan';
import { canAccess } from '@/lib/planGate';
import { useShop, getBlockedModules } from '@/lib/useShop';

export function Sidebar() {
  const { activeModule } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { status: planStatus, daysLeft } = usePlan();
  const { shops, currentShop, switchShop, role, loading: roleLoading } = useShop();
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const shopMenuRef = useRef<HTMLDivElement>(null);
  const [realCounts, setRealCounts] = useState<Record<string, number>>({});
  const [companyName, setCompanyName] = useState('D1 Imports');
  const [tagline, setTagline] = useState('Service, fleet, mobile, parts');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);

  // Close shop menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (shopMenuRef.current && !shopMenuRef.current.contains(e.target as Node)) {
        setShopMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setCompanyName(s.companyName);
      setTagline(s.tagline);
      setLogoUrl(s.logoUrl);
      setHiddenModules(s.hiddenModules ?? []);
      if (s.rolePermissions) setRolePermissions(s.rolePermissions);
    }).catch(() => {});

    function onBrandingUpdate(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail.companyName !== undefined) setCompanyName(detail.companyName);
      if (detail.tagline !== undefined) setTagline(detail.tagline);
      if (detail.logoUrl !== undefined) setLogoUrl(detail.logoUrl);
      if (detail.hiddenModules !== undefined) setHiddenModules(detail.hiddenModules);
      if (detail.rolePermissions !== undefined) setRolePermissions(detail.rolePermissions);
    }
    window.addEventListener('shop-settings-updated', onBrandingUpdate);
    return () => window.removeEventListener('shop-settings-updated', onBrandingUpdate);
  }, []);

  useEffect(() => {
    async function loadCounts() {
      const { getShopId } = await import('@/lib/shopStore');
      const sid = getShopId();
      const q = (table: string) =>
        supabase.from(table).select('*', { count: 'exact', head: true }).eq('shop_id', sid);
      const pick = (r: PromiseSettledResult<{ count: number | null }>) =>
        r.status === 'fulfilled' ? (r.value.count ?? 0) : 0;

      const [
        customerR, vehicleR, jobR, invoiceR, estimateR, paymentR,
        roR, inspR, maintR, partsR, apptR, techR, commR,
      ] = await Promise.allSettled([
        q('customers'), q('vehicles'), q('job_cards'), q('invoices'),
        q('estimates'), q('payments'), q('repair_orders'), q('inspections'),
        q('maintenance_schedules'), q('parts'), q('appointments'),
        q('technicians'), q('conversations'),
      ]);

      setRealCounts({
        customers:      pick(customerR),
        vehicles:       pick(vehicleR),
        'job-cards':    pick(jobR),
        invoices:       pick(invoiceR),
        estimates:      pick(estimateR),
        payments:       pick(paymentR),
        'repair-orders': pick(roR),
        inspections:    pick(inspR),
        scheduling:     pick(maintR),
        parts:          pick(partsR),
        appointments:   pick(apptR),
        technicians:    pick(techR),
        communication:  pick(commR),
        dashboard: 0, diagnostics: 0, ai: 0,
      });
    }
    loadCounts();
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push('/login');
    router.refresh();
  }

  function getCount(id: string, mockCount: string) {
    if (id in realCounts) return String(realCounts[id]);
    return mockCount;
  }

  // Use owner-configured permissions for non-owner roles; fallback to hardcoded defaults
  const blockedForRole = (() => {
    if (role === 'owner') return [];
    if (!role) return getBlockedModules(''); // loading / unknown
    const allowed = rolePermissions[role as RoleKey];
    if (allowed && allowed.length > 0) {
      return navItems.map(([id]) => id).filter(id => !allowed.includes(id));
    }
    return getBlockedModules(role);
  })();
  // hiddenModules = owner's personal sidebar config; only applies when logged in as owner
  const visibleNav = navItems.filter(([id]) => {
    if (blockedForRole.includes(id)) return false;
    if (role === 'owner' && hiddenModules.includes(id)) return false;
    return true;
  });

  return (
    <aside className="sidebar">
      <div className="brand">
        {logoUrl
          ? <Image src={logoUrl} alt="Logo" width={38} height={38} style={{ objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3 }} unoptimized />
          : <img src={LOGO_SRC} alt="Redlined1" style={{ height: 38, width: 'auto', objectFit: 'contain', mixBlendMode: 'normal' }} />
        }
        <div>
          <strong>{companyName}</strong>
          <span>{tagline}</span>
        </div>
      </div>

      {/* Shop switcher — only shown when user has access to multiple shops */}
      {shops.length > 1 && (
        <div ref={shopMenuRef} style={{ position: 'relative', margin: '4px 10px 0' }}>
          <button
            onClick={() => setShopMenuOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 11px', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: '#ccc', fontSize: 12, cursor: 'pointer', gap: 8,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 14 }}>🏢</span>
              <span style={{ fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                {currentShop?.name ?? 'Select shop'}
              </span>
            </span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>{shopMenuOpen ? '▲' : '▼'}</span>
          </button>

          {shopMenuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, zIndex: 999, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{ padding: '6px 11px 4px', fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
                Switch Location
              </div>
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => { setShopMenuOpen(false); switchShop(shop.id); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 11px', background: shop.id === currentShop?.id ? 'rgba(192,57,43,0.15)' : 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: shop.id === currentShop?.id ? '#e74c3c' : '#ccc',
                    fontSize: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{shop.id === currentShop?.id ? '✓' : '○'}</span>
                  <span style={{ fontWeight: shop.id === currentShop?.id ? 600 : 400 }}>{shop.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Trial / free plan banner */}
      {planStatus === 'trial' && daysLeft !== null && daysLeft <= 3 && (
        <div style={{ margin: '8px 10px', padding: '8px 10px', background: 'rgba(255,193,7,0.15)', border: '1px solid rgba(255,193,7,0.4)', borderRadius: 8, fontSize: 11, color: '#ffc107', textAlign: 'center' }}>
          ⏳ {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in trial
        </div>
      )}
      {planStatus === 'free' && (
        <div style={{ margin: '8px 10px', padding: '8px 10px', background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, fontSize: 11, color: '#ff6b6b', textAlign: 'center' }}>
          Free Plan · <a href="/signup" style={{ color: '#ff6b6b', fontWeight: 700 }}>Upgrade</a>
        </div>
      )}

      <nav className="nav">
        {roleLoading && (
          <div style={{ padding: '20px 16px', color: '#444', fontSize: 12, textAlign: 'center' }}>Loading…</div>
        )}
        {!roleLoading && visibleNav.map(([id, icon, label, count]) => {
          const locked = !canAccess(id, planStatus);
          return (
            <button
              key={id}
              className={activeModule === id ? 'active' : ''}
              title={locked ? `${label} — Upgrade to unlock` : label}
              style={{ '--icon-color': locked ? '#555' : (iconColors[id] || '#9eb2c2'), opacity: locked ? 0.5 : 1 } as React.CSSProperties}
              onClick={() => locked ? null : dispatch({ type: 'SET_MODULE', module: id })}
            >
              <Icon name={icon} style={{ color: locked ? '#555' : (iconColors[id] || '#9eb2c2') }} />
              <span className="label">{label}</span>
              {locked ? <span className="count" style={{ background: '#333' }}>🔒</span> : count && <span className="count">{getCount(id, count)}</span>}
            </button>
          );
        })}
        </nav>
      <a
        href="/help"
        target="_blank"
        style={{
          marginTop: 'auto', padding: '10px 16px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#666',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          textDecoration: 'none', marginBottom: 8,
        }}
      >
        <span>❓</span> Help & Manual
      </a>
      <button
        onClick={handleSignOut}
        style={{
          padding: '12px 16px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#aaa',
          cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        }}
      >
        <span>⏻</span> Sign Out
      </button>
    </aside>
  );
}
