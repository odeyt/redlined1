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

// Manager: operational visibility only — no money, no admin, no pricing
export const MANAGER_BLOCKED: string[] = [
  'invoices', 'payments', 'estimates', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide',
];

// Technician: shop floor only — repairs and parts only
export const TECHNICIAN_BLOCKED: string[] = [
  'dashboard', 'customers', 'vehicles', 'appointments', 'scheduling',
  'estimates', 'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide',
  'communication', 'vin', 'dtc', 'ai', 'diagnostics',
];

// Service Advisor: customer-facing intake only — no financials, no admin
export const ADVISOR_BLOCKED: string[] = [
  'invoices', 'payments', 'estimates', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide',
  'technicians', 'parts', 'repair-orders',
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
