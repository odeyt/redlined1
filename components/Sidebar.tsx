'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAppState, useAppDispatch } from '@/lib/store';
import { navItems } from '@/lib/mock-data';
import { Icon, iconColors } from './Icon';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { usePlan } from '@/lib/usePlan';
import { canAccess } from '@/lib/planGate';

export function Sidebar() {
  const { activeModule } = useAppState();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { status: planStatus, daysLeft } = usePlan();
  const [realCounts, setRealCounts] = useState<Record<string, number>>({});
  const [companyName, setCompanyName] = useState('Redlined1');
  const [tagline, setTagline] = useState('Service, fleet, mobile, parts');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setCompanyName(s.companyName);
      setTagline(s.tagline);
      setLogoUrl(s.logoUrl);
      setHiddenModules(s.hiddenModules ?? []);
    }).catch(() => {});

    function onBrandingUpdate(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail.companyName !== undefined) setCompanyName(detail.companyName);
      if (detail.tagline !== undefined) setTagline(detail.tagline);
      if (detail.logoUrl !== undefined) setLogoUrl(detail.logoUrl);
      if (detail.hiddenModules !== undefined) setHiddenModules(detail.hiddenModules);
    }
    window.addEventListener('shop-settings-updated', onBrandingUpdate);
    return () => window.removeEventListener('shop-settings-updated', onBrandingUpdate);
  }, []);

  useEffect(() => {
    async function loadCounts() {
      const [
        { count: customerCount }, { count: vehicleCount }, { count: jobCount },
        { count: invoiceCount }, { count: estimateCount }, { count: paymentCount },
        { count: roCount },
        { count: inspCount },
        { count: maintCount },
      ] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
        supabase.from('job_cards').select('*', { count: 'exact', head: true }),
        supabase.from('invoices').select('*', { count: 'exact', head: true }),
        supabase.from('estimates').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('*', { count: 'exact', head: true }),
        supabase.from('repair_orders').select('*', { count: 'exact', head: true }),
        supabase.from('inspections').select('*', { count: 'exact', head: true }),
        supabase.from('maintenance_schedules').select('*', { count: 'exact', head: true }),
      ]);
      setRealCounts({
        customers: customerCount ?? 0,
        vehicles: vehicleCount ?? 0,
        'job-cards': jobCount ?? 0,
        invoices: invoiceCount ?? 0,
        estimates: estimateCount ?? 0,
        payments: paymentCount ?? 0,
        'repair-orders': roCount ?? 0,
        inspections: inspCount ?? 0,
        scheduling: maintCount ?? 0,
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

  // Always show settings + dashboard regardless of hidden list
  const ALWAYS_VISIBLE = ['dashboard', 'settings'];
  const visibleNav = navItems.filter(([id]) => ALWAYS_VISIBLE.includes(id) || !hiddenModules.includes(id));

  return (
    <aside className="sidebar">
      <div className="brand">
        {logoUrl
          ? <Image src={logoUrl} alt="Logo" width={38} height={38} style={{ objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3 }} unoptimized />
          : <div className="brand-mark">{companyName.slice(0, 2).toUpperCase()}</div>
        }
        <div>
          <strong>{companyName}</strong>
          <span>{tagline}</span>
        </div>
      </div>
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
        {visibleNav.map(([id, icon, label, count]) => {
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
