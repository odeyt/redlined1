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
import { fetchShopSettings, RolePermissions, RoleKey } from '@/services/shopSettingsService';
import { getShopId } from '@/lib/shopStore';
import { usePlan } from '@/lib/usePlan';
import { canAccess } from '@/lib/planGate';
import { useShop, getBlockedModules } from '@/lib/useShop';
import { useNotifications } from '@/lib/useNotifications';

export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { activeModule } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { notifications, unreadCount, markAllRead, dismiss, clearAll, STATUS_EMOJI } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { status: planStatus, daysLeft, loading: planLoading, profileLoaded } = usePlan();
  const { shops, currentShop, switchShop, role, loading: roleLoading, mirrorShopIds } = useShop();
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const shopMenuRef = useRef<HTMLDivElement>(null);
  const [mirrorToggles, setMirrorToggles] = useState<Record<string, boolean>>({});

  // Sync mirror state from useShop into local toggle map
  useEffect(() => {
    const map: Record<string, boolean> = {};
    mirrorShopIds.forEach(id => { map[id] = true; });
    setMirrorToggles(map);
  }, [mirrorShopIds]);

  async function toggleMirror(targetShopId: string) {
    if (!currentShop) return;
    const isOn = mirrorToggles[targetShopId];
    const next = { ...mirrorToggles, [targetShopId]: !isOn };
    setMirrorToggles(next);
    if (isOn) {
      await supabase.from('shop_mirrors').delete()
        .eq('shop_id', currentShop.id).eq('mirror_shop_id', targetShopId);
    } else {
      await supabase.from('shop_mirrors').upsert(
        { shop_id: currentShop.id, mirror_shop_id: targetShopId },
        { onConflict: 'shop_id,mirror_shop_id' }
      );
    }
    window.location.reload();
  }
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);

  function toggleCollapse() {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }

  function showTooltip(e: React.MouseEvent<HTMLElement>, label: string) {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2 });
  }

  function hideTooltip() {
    setTooltip(null);
  }
  const [realCounts, setRealCounts] = useState<Record<string, number>>({});
  const [companyName, setCompanyName] = useState('My Shop');
  const [tagline, setTagline] = useState('Auto repair & services');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [featureFlags, setFeatureFlags] = useState({ enableJobArchive: true, enableTimeTracking: true });
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  // Start empty; settingsLoaded stays false until /api/role-permissions resolves.
  // While loading, non-owners see nothing (safe default). Once loaded the saved
  // allowlist from shop_settings is authoritative.
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({ manager: [], advisor: [], technician: [] });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('redlined1-theme') as 'dark' | 'light') ?? 'dark';
  });

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('redlined1-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  // Close shop menu / notification panel when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (shopMenuRef.current && !shopMenuRef.current.contains(e.target as Node)) setShopMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
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
      setFeatureFlags({ enableJobArchive: s.enableJobArchive ?? true, enableTimeTracking: s.enableTimeTracking ?? true });
      // role_permissions is now readable by all shop members via RLS SELECT policy
      if (s.rolePermissions && Object.values(s.rolePermissions).some(arr => arr.length > 0)) {
        setRolePermissions(s.rolePermissions);
      }
    }).catch(() => {}).finally(() => setSettingsLoaded(true));

    function onBrandingUpdate(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail.companyName !== undefined) setCompanyName(detail.companyName);
      if (detail.tagline !== undefined) setTagline(detail.tagline);
      if (detail.logoUrl !== undefined) setLogoUrl(detail.logoUrl);
      if (detail.hiddenModules !== undefined) setHiddenModules(detail.hiddenModules);
      if (detail.enableJobArchive !== undefined || detail.enableTimeTracking !== undefined)
        setFeatureFlags(f => ({ ...f, ...(detail.enableJobArchive !== undefined ? { enableJobArchive: detail.enableJobArchive } : {}), ...(detail.enableTimeTracking !== undefined ? { enableTimeTracking: detail.enableTimeTracking } : {}) }));
      if (detail.rolePermissions !== undefined) setRolePermissions(detail.rolePermissions);
    }
    window.addEventListener('shop-settings-updated', onBrandingUpdate);
    return () => window.removeEventListener('shop-settings-updated', onBrandingUpdate);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email?.toLowerCase() ?? '';
      if (!email) return;
      setCurrentUserEmail(email);
      // Primary: server-side authoritative check
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token;
        if (token) {
          fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d?.isPlatformOwner === true) { setIsPlatformOwner(true); return; }
              // Fallback: compare against known owner email directly
              const ownerRaw = process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com';
              const owners = ownerRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
              setIsPlatformOwner(owners.includes(email));
            })
            .catch(() => {
              const ownerRaw = process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com';
              const owners = ownerRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
              setIsPlatformOwner(owners.includes(email));
            });
        } else {
          const ownerRaw = process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com';
          const owners = ownerRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
          setIsPlatformOwner(owners.includes(email));
        }
      });
    });
  }, []);

  useEffect(() => {
    async function loadCounts() {
      const { getShopId } = await import('@/lib/shopStore');
      const sid = getShopId();
      if (!sid) return;

      // Count rows for a table — catches records saved with the correct shop_id,
      // with an empty-string shop_id (inserted before shop was configured),
      // or with null shop_id. Sums correct + legacy so sidebar matches the page.
      async function count(table: string): Promise<number> {
        // Primary: correct shop
        const r1 = await supabase
          .from(table).select('*', { count: 'exact', head: true }).eq('shop_id', sid);
        const c1 = (!r1.error && r1.count != null) ? r1.count : 0;

        // Legacy: rows saved with no shop_id (null or empty string)
        const r2 = await supabase
          .from(table).select('*', { count: 'exact', head: true })
          .or('shop_id.is.null,shop_id.eq.');
        const c2 = (!r2.error && r2.count != null) ? r2.count : 0;

        return c1 + c2;
      }

      // Appointments: unfiltered matches page behavior (service falls back to no-filter)
      async function countAppts(): Promise<number> {
        const r = await supabase.from('appointments').select('*', { count: 'exact', head: true });
        if (!r.error && r.count != null) return r.count;
        return count('appointments');
      }

      // Vehicles: strict shop_id match + exclude Archived, mirrors fetchVehicles() exactly
      async function countVehicles(): Promise<number> {
        const r = await supabase
          .from('vehicles').select('*', { count: 'exact', head: true })
          .eq('shop_id', sid).neq('status', 'Archived');
        return (!r.error && r.count != null) ? r.count : 0;
      }

      async function countReceived(): Promise<number> {
        const r = await supabase
          .from('parts_orders').select('*', { count: 'exact', head: true })
          .eq('shop_id', sid).eq('status', 'Received');
        return (!r.error && r.count != null) ? r.count : 0;
      }

      const [
        customers, vehicles, jobCards, invoices, estimates, payments,
        repairOrders, inspections, schedules, parts, partsOrders, partsReceived,
        partsEstimates, technicians, conversations, appointments,
      ] = await Promise.all([
        count('customers'), countVehicles(), count('job_cards'),
        count('invoices'), count('estimates'), count('payments'),
        count('repair_orders'), count('inspections'), count('maintenance_schedules'),
        count('parts'), count('parts_orders'), countReceived(),
        count('parts_estimates'),
        count('technicians'), count('conversations'),
        countAppts(),
      ]);

      setRealCounts({
        customers, vehicles,
        'job-cards':       jobCards,
        invoices, estimates, payments,
        'repair-orders':   repairOrders,
        inspections,
        scheduling:        schedules,
        parts,
        'parts-orders':    partsOrders,
        'parts-received':  partsReceived,
        'parts-estimates': partsEstimates,
        technicians,
        communication:     conversations,
        appointments,
        dashboard: 0, diagnostics: 0, ai: 0,
      });
    }
    loadCounts();
  }, [currentShop]);

  async function handleSignOut() {
    await signOut();
    router.push('/login');
    router.refresh();
  }

  function getCount(id: string, mockCount: string) {
    if (id in realCounts) return String(realCounts[id]);
    return mockCount;
  }

  // Use owner-configured permissions for non-owner roles; fallback to hardcoded defaults.
  // Block everything for non-owners until /api/role-permissions has resolved so that
  // the empty initial state never leaks through as "show all".
  const blockedForRole = (() => {
    if (role === 'owner') return [];
    if (!role || roleLoading) return getBlockedModules(''); // role genuinely unknown — block all
    if (!settingsLoaded) return getBlockedModules(role);   // role known, DB perms still loading — use hardcoded defaults
    const allowed = rolePermissions[role as RoleKey];
    if (allowed && allowed.length > 0) {
      // Saved allowlist is authoritative — block everything not explicitly permitted.
      return navItems.map(([id]) => id).filter(id => !allowed.includes(id));
    }
    return getBlockedModules(role);
  })();
  // hiddenModules = owner's personal sidebar config; only applies when logged in as owner
  const featureHidden = [
    ...(featureFlags.enableJobArchive ? [] : ['job-archive']),
    ...(featureFlags.enableTimeTracking ? [] : ['time-tracking']),
  ];
  // billing and subscriptions always visible for owners only
  const ALWAYS_SHOW = role === 'owner' ? new Set(['billing', 'subscriptions']) : new Set<string>();
  // Plan gating — mirrors AppShell, which bounces plan-blocked modules to the
  // dashboard. Without this the sidebar advertised paid modules (Parts
  // Inventory, AI Copilot, Reports) to free accounts as dead links.
  // Only applied once the plan is resolved from a real profile row: if the read
  // failed (profileLoaded false) nothing is hidden, so a billing/RLS problem
  // can never strip a paying shop's navigation.
  const planGated = (!planLoading && profileLoaded)
    ? navItems.map(([id]) => id).filter(id => !canAccess(id, planStatus))
    : [];

  const visibleNav = navItems.filter(([id]) => {
    if (ALWAYS_SHOW.has(id)) return true;
    if (blockedForRole.includes(id)) return false;
    if (planGated.includes(id)) return false;
    if (featureHidden.includes(id)) return false;
    if (role === 'owner' && hiddenModules.includes(id)) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop — closes drawer when tapping outside on mobile */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop visible"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} style={{ position: 'relative' }}>
      {/* Collapse toggle — upper-right corner */}
      <button
        onClick={toggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          position: 'absolute', top: 14, right: 10, zIndex: 20,
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 7, cursor: 'pointer', padding: 0,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.28)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M9 2L4 7L9 12" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13 2L8 7L13 12" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="brand" style={{ cursor: 'pointer' }} onClick={() => dispatch({ type: 'SET_MODULE', module: (role === 'owner' || role === 'manager') ? 'command-center' : 'dashboard' })} title="Home">
        {logoUrl
          ? <Image src={logoUrl} alt="Logo" width={38} height={38} style={{ objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3, flexShrink: 0 }} unoptimized />
          : <img src={LOGO_SRC} alt="Redlined1" style={{ height: 38, width: 'auto', objectFit: 'contain', mixBlendMode: 'normal', flexShrink: 0 }} />
        }
        {!collapsed && (
          <div>
            <strong>{companyName}</strong>
            <span>{tagline}</span>
          </div>
        )}
      </div>

      {/* Shop switcher — only shown when user has access to multiple shops and sidebar is expanded */}
      {shops.length > 1 && !collapsed && (
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
              {shops.map(shop => {
                const isActive = shop.id === currentShop?.id;
                const isMirrored = !isActive && mirrorToggles[shop.id];
                return (
                  <div key={shop.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      onClick={() => { setShopMenuOpen(false); switchShop(shop.id); }}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 11px', background: isActive ? 'rgba(192,57,43,0.15)' : isMirrored ? 'rgba(34,197,94,0.08)' : 'transparent',
                        border: 'none', color: isActive ? '#e74c3c' : isMirrored ? '#22c55e' : '#ccc',
                        fontSize: 12, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{isActive ? '✓' : isMirrored ? '⇄' : '○'}</span>
                      <span style={{ fontWeight: isActive ? 600 : 400 }}>{shop.name}</span>
                      {isMirrored && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 'auto' }}>Mirrored</span>}
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => toggleMirror(shop.id)}
                        title={mirrorToggles[shop.id] ? 'Remove mirror' : 'Mirror this shop\'s data'}
                        style={{
                          padding: '9px 10px', background: 'transparent', border: 'none',
                          color: mirrorToggles[shop.id] ? '#22c55e' : '#555', cursor: 'pointer', fontSize: 14,
                        }}
                      >
                        ⇄
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Trial / free plan banner — hidden when collapsed */}
      {!collapsed && planStatus === 'trial' && daysLeft !== null && daysLeft <= 3 && (
        <div style={{ margin: '8px 10px', padding: '8px 10px', background: 'rgba(255,193,7,0.15)', border: '1px solid rgba(255,193,7,0.4)', borderRadius: 8, fontSize: 11, color: '#ffc107', textAlign: 'center' }}>
          ⏳ {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in trial
        </div>
      )}
      {!collapsed && planStatus === 'free' && (
        <div style={{ margin: '8px 10px', padding: '8px 10px', background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 8, fontSize: 11, color: '#ff6b6b', textAlign: 'center' }}>
          Free Plan · <a href="/signup" style={{ color: '#ff6b6b', fontWeight: 700 }}>Upgrade</a>
        </div>
      )}

      <nav className="nav">
        {roleLoading && (
          <div style={{ padding: '20px 16px', color: '#444', fontSize: 12, textAlign: 'center' }}>Loading…</div>
        )}
        {!roleLoading && visibleNav.map(([id, icon, label, count]) => {
          // Plan locks only apply to the shop owner.
          // Staff with a valid role (technician, advisor, manager, etc.) are never plan-locked —
          // they are covered by role-based access control instead.
          const locked = (role === 'owner' || !role) && !canAccess(id, planStatus);
          const tipLabel = locked ? `${label} — Upgrade to unlock` : label;
          return (
            <button
              key={id}
              className={activeModule === id ? 'active' : ''}
              title={tipLabel}
              style={{ '--icon-color': locked ? '#555' : (iconColors[id] || '#9eb2c2'), opacity: locked ? 0.5 : 1 } as React.CSSProperties}
              onClick={() => { if (locked) return; dispatch({ type: 'SET_MODULE', module: id }); onClose?.(); }}
              onMouseEnter={e => showTooltip(e, tipLabel)}
              onMouseLeave={hideTooltip}
            >
              <Icon name={icon} style={{ color: locked ? '#555' : (iconColors[id] || '#9eb2c2') }} />
              {!collapsed && <span className="label">{label}</span>}
              {!collapsed && (locked ? <span className="count" style={{ background: '#333' }}>🔒</span> : (count || id in realCounts) ? <span className="count">{getCount(id, count)}</span> : null)}
            </button>
          );
        })}
        </nav>

      {/* ── Notification Bell ── */}
      <div ref={notifRef} style={{ position: 'relative', margin: '4px 10px 6px' }}>
        <button
          onClick={() => { setNotifOpen(o => !o); if (!notifOpen) markAllRead(); }}
          title="Notifications"
          onMouseEnter={e => showTooltip(e, 'Notifications')}
          onMouseLeave={hideTooltip}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
            padding: '9px 12px', background: unreadCount > 0 ? 'rgba(220,38,38,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${unreadCount > 0 ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, color: unreadCount > 0 ? '#fca5a5' : '#888', cursor: 'pointer', fontSize: 13,
            position: 'relative',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>🔔</span>
            {!collapsed && <span style={{ fontWeight: unreadCount > 0 ? 700 : 400 }}>Notifications</span>}
          </span>
          {unreadCount > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 800, position: collapsed ? 'absolute' : 'static', top: collapsed ? 4 : undefined, right: collapsed ? 4 : undefined }}>{unreadCount}</span>
          )}
        </button>

        {notifOpen && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10, zIndex: 999, boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
            maxHeight: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#eee' }}>RO Status Changes</span>
              {notifications.length > 0 && (
                <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: 0 }}>Clear all</button>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>No notifications yet.<br />Status changes on Repair Orders will appear here.</div>
              )}
              {notifications.map(n => (
                <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: n.read ? 'transparent' : 'rgba(220,38,38,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#eee', marginBottom: 2 }}>{n.roNumber}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.customer}{n.vehicle ? ` · ${n.vehicle}` : ''}</div>
                      <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: '#666' }}>{STATUS_EMOJI[n.oldStatus] ?? '•'} {n.oldStatus}</span>
                        <span style={{ color: '#555' }}>→</span>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>{STATUS_EMOJI[n.newStatus] ?? '•'} {n.newStatus}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{new Date(n.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          dispatch({ type: 'SET_MODULE', module: 'repair-orders' });
                          window.dispatchEvent(new CustomEvent('open-ro', { detail: { roId: n.roId, roNumber: n.roNumber } }));
                          setNotifOpen(false);
                        }}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.12)', color: '#fca5a5', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Open RO →
                      </button>
                      <button onClick={() => dismiss(n.id)} style={{ background: 'none', border: 'none', color: '#555', fontSize: 10, cursor: 'pointer', padding: 0, textAlign: 'center' }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

{isPlatformOwner && (
        <a
          href="/admin/billing-health"
          title="Billing Health"
          onMouseEnter={e => showTooltip(e, 'Billing Health')}
          onMouseLeave={hideTooltip}
          style={{
            padding: '10px 16px', background: 'transparent',
            border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, color: '#818cf8',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            textDecoration: 'none', marginBottom: 8,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <span>📊</span>{!collapsed && ' Billing Health'}
        </a>
      )}
      <a
        href="/help"
        target="_blank"
        title="Help & Manual"
        onMouseEnter={e => showTooltip(e, 'Help & Manual')}
        onMouseLeave={hideTooltip}
        style={{
          padding: '10px 16px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#666',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          textDecoration: 'none', marginBottom: 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <span>❓</span>{!collapsed && ' Help & Manual'}
      </a>
      {currentUserEmail && (
        <div
          title={`${currentUserEmail}${role ? ` · ${role}` : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', marginBottom: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, overflow: 'hidden',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
          }}>
            {currentUserEmail[0]}
          </div>
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <span style={{ fontSize: 12, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUserEmail}
              </span>
              {role && (
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: role === 'owner' ? '#dc2626' : role === 'manager' ? '#d97706' : role === 'advisor' ? '#2196f3' : '#6b7280',
                  marginTop: 2,
                }}>
                  {role}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        onMouseEnter={e => { showTooltip(e, theme === 'dark' ? 'Light Mode' : 'Dark Mode'); (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'; }}
        onMouseLeave={e => { hideTooltip(); (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
        style={{
          padding: '10px 16px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          color: theme === 'dark' ? '#fbbf24' : '#818cf8',
          cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          marginBottom: 8, justifyContent: collapsed ? 'center' : 'flex-start',
          transition: 'color 0.2s, border-color 0.2s',
        }}
      >
        <span style={{ fontSize: 15 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
        {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
      </button>
      <button
        onClick={handleSignOut}
        title="Sign Out"
        onMouseEnter={e => showTooltip(e, 'Sign Out')}
        onMouseLeave={hideTooltip}
        style={{
          padding: '12px 16px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#aaa',
          cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <span>⏻</span>{!collapsed && ' Sign Out'}
      </button>

      {/* Fixed-position tooltip — escapes sidebar overflow clipping */}
      {collapsed && tooltip && (
        <div style={{
          position: 'fixed',
          left: 72,
          top: tooltip.y,
          transform: 'translateY(-50%)',
          background: '#1a1a2e',
          color: '#eee',
          padding: '6px 12px',
          borderRadius: 7,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          {tooltip.label}
        </div>
      )}
    </aside>
    </>
  );
}
