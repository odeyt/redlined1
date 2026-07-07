'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { getShopId, setShopId } from './shopStore';

export interface Shop {
  id: string;
  name: string;
}

// Role → blocked module list
// Owner has no restrictions.

// Owner: full access — no restrictions.

// Manager: sees operations end-to-end but cannot touch financial records,
// admin settings, subscriptions, or access control.
export const MANAGER_BLOCKED: string[] = [
  'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide', 'system-health', 'disaster-recovery', 'testing-dashboard',
];

// Technician: shop-floor only.
// Can see job cards, repair orders, inspections, parts, time tracking, and
// the tools (VIN/DTC/diagnostics). Cannot access customer financials,
// admin, or communication blasts.
export const TECHNICIAN_BLOCKED: string[] = [
  'customers', 'vehicles', 'appointments', 'scheduling',
  'estimates', 'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide', 'system-health', 'disaster-recovery', 'testing-dashboard',
  'communication', 'vin', 'dtc', 'ai', 'diagnostics', 'job-archive',
];

// Service Advisor: customer-facing + operational.
// Handles intake (customers, vehicles, appointments), job cards, inspections,
// estimates, parts sourcing (parts + parts-orders), and repair-order visibility.
// Cannot access invoicing, payments, financial reports, admin, or labor-guide.
export const ADVISOR_BLOCKED: string[] = [
  'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide', 'system-health', 'disaster-recovery', 'testing-dashboard',
];

// Every non-dashboard module — used to block unverified/loading roles
const ALL_NON_DASHBOARD = [
  'customers','vehicles','appointments','scheduling','job-cards','inspections',
  'estimates','repair-orders','technicians','parts','invoices','payments',
  'communication','vin','dtc','diagnostics','ai','reports','labor-guide',
  'access','subscriptions','settings',
];

export function getBlockedModules(role: string): string[] {
  switch (role) {
    case 'owner':      return [];
    case 'manager':    return MANAGER_BLOCKED;
    case 'technician': return TECHNICIAN_BLOCKED;
    case 'advisor':    return ADVISOR_BLOCKED;
    default:           return ALL_NON_DASHBOARD; // unknown/loading = block everything
  }
}

export function useShop() {
  const [shopId, setLocalShopId] = useState<string>(getShopId());
  const [shops, setShops] = useState<Shop[]>([]);
  const [role, setRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: suRows } = await supabase
        .from('shop_users')
        .select('shop_id, role')
        .eq('user_id', user.id);

      const shopIds = (suRows ?? []).map((r: Record<string, unknown>) => r.shop_id as string).filter(Boolean);

      const { data: shopRows } = shopIds.length > 0
        ? await supabase.from('shops').select('id, name').in('id', shopIds)
        : { data: [] };

      const data = shopRows ?? [];

      if (data && data.length > 0) {
        const list: Shop[] = data as Shop[];
        setShops(list);

        const current = getShopId();
        const isValid = list.some(s => s.id === current);
        if (!isValid) {
          setShopId(list[0].id);
          window.location.reload();
          return;
        }
        setLocalShopId(current);

        const activeRow = (suRows ?? []).find(
          (r: Record<string, unknown>) => r.shop_id === current
        );
        // Never default to owner — if no row found, role stays '' (blocked)
        const resolvedRole = (activeRow as Record<string, unknown>)?.role as string ?? '';
        setRole(resolvedRole);
      }
      setLoading(false);
    }
    load();
  }, []);

  const switchShop = useCallback((id: string) => {
    setShopId(id);
    setLocalShopId(id);
    window.location.reload();
  }, []);

  return {
    shopId,
    shops,
    role,
    loading,
    switchShop,
    currentShop: shops.find(s => s.id === shopId) ?? null,
  };
}
