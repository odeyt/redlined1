'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getPlanStatus, trialDaysLeft, PlanStatus } from './planGate';

// Internal D1 shop IDs are always treated as paid — never show billing gate
const INTERNAL_SHOP_IDS = new Set([
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
]);

export function usePlan() {
  const [status, setStatus] = useState<PlanStatus>('free');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('plan, trial_ends_at, shop_id')
        .eq('id', user.id)
        .single();
      if (data) {
        // Internal D1 shops are always 'pro' — bypass all plan/trial checks
        if (data.shop_id && INTERNAL_SHOP_IDS.has(data.shop_id)) {
          setStatus('pro');
          setLoading(false);
          return;
        }
        const s = getPlanStatus(data.plan, data.trial_ends_at);
        setStatus(s);
        if (s === 'trial') setDaysLeft(trialDaysLeft(data.trial_ends_at));
      } else {
        // No profile row yet — trigger may not have fired for this account.
        // Give trial access so they are never locked out due to a missing row.
        setStatus('trial');
        setDaysLeft(7);
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { status, daysLeft, loading };
}
