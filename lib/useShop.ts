'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { getShopId, setShopId } from './shopStore';

export interface Shop {
  id: string;
  name: string;
}

export function useShop() {
  const [shopId, setLocalShopId] = useState<string>(getShopId());
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('shop_users')
        .select('shop_id, shop:shops(id, name)')
        .eq('user_id', user.id)
        .order('created_at');

      if (data && data.length > 0) {
        const list: Shop[] = data
          .map((r: Record<string, unknown>) => r.shop as Shop)
          .filter(Boolean);
        setShops(list);

        const current = getShopId();
        const isValid = list.some(s => s.id === current);
        if (!isValid) {
          // First visit or stale ID — pick shop 1 and reload so all services start with correct ID
          setShopId(list[0].id);
          window.location.reload();
          return;
        }
        setLocalShopId(current);
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
    loading,
    switchShop,
    currentShop: shops.find(s => s.id === shopId) ?? null,
  };
}
