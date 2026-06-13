'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { getShopId, setShopId } from './shopStore';

export interface Shop {
  id: string;
  name: string;
}

// Modules managers cannot access
export const MANAGER_BLOCKED: string[] = [
  'invoices', 'payments', 'estimates', 'reports', 'campaigns', 'settings',
  'subscriptions', 'access',
];

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
