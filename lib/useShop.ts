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

      const { data: suRows, error: suErr } = await supabase
        .from('shop_users')
        .select('shop_id')
        .eq('user_id', user.id);

      console.log('[useShop] user.id:', user.id);
      console.log('[useShop] shop_users rows:', suRows, 'error:', suErr);

      const shopIds = (suRows ?? []).map((r: Record<string, unknown>) => r.shop_id as string).filter(Boolean);

      const { data: shopRows, error: shErr } = shopIds.length > 0
        ? await supabase.from('shops').select('id, name').in('id', shopIds)
        : { data: [], error: null };

      console.log('[useShop] shops rows:', shopRows, 'error:', shErr);

      const data = shopRows ?? [];

      if (data && data.length > 0) {
        const list: Shop[] = data as Shop[];
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
