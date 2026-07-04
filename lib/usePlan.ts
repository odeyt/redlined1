'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getShopId } from './shopStore';
import { getPlanStatus, trialDaysLeft, PlanStatus } from './planGate';

export function usePlan() {
  const [status, setStatus] = useState<PlanStatus>('trial');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Staff members (non-owners) inherit the shop owner's plan.
      // Look up who owns the current shop and use their profile for the plan check.
      let planUserId = user.id;
      const shopId = getShopId();
      if (shopId) {
        const { data: ownerRow } = await supabase
          .from('shop_users')
          .select('user_id')
          .eq('shop_id', shopId)
          .eq('role', 'owner')
          .maybeSingle();
        if (ownerRow?.user_id) planUserId = ownerRow.user_id;
      }

      const { data } = await supabase
        .from('profiles')
        .select('plan, trial_ends_at')
        .eq('id', planUserId)
        .single();
      if (data) {
        const s = getPlanStatus(data.plan, data.trial_ends_at);
        setStatus(s);
        if (s === 'trial') setDaysLeft(trialDaysLeft(data.trial_ends_at));
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { status, daysLeft, loading };
}
