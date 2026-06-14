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
export const MANAGER_BLOCKED: string[] = [
  'invoices', 'payments', 'estimates', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide',
];

// Technician: shop floor only — no money, no admin, no comms
export const TECHNICIAN_BLOCKED: string[] = [
  'invoices', 'payments', 'estimates', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'communication',
  'appointments', 'vin', 'dtc', 'ai', 'labor-guide',
];

// Service Advisor: customer-facing — no financials or admin
export const ADVISOR_BLOCKED: string[] = [
  'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide',
];

export function getBlockedModules(role: string): string[] {
  switch (role) {
    case 'manager':    return MANAGER_BLOCKED;
    case 'technician': return TECHNICIAN_BLOCKED;
    case 'advisor':    return ADVISOR_BLOCKED;
    default:           return []; // owner
  }
}

export function useShop() {
  const [shopId, setLocalShopId] = useState<string>(getShopId());
  const [shops, setShops] = useState<Shop[]>([]);
  const [role, setRole] = useState<string>('owner');
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
        setRole((activeRow as Record<string, unknown>)?.role as string ?? 'owner');
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
