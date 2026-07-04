'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getPlanStatus, trialDaysLeft, PlanStatus } from './planGate';

export function usePlan() {
  const [status, setStatus] = useState<PlanStatus>('trial');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('plan, trial_ends_at')
        .eq('id', user.id)
        .single();
      if (data) {
        const s = getPlanStatus(data.plan, data.trial_ends_at);
        setStatus(s);
        if (s === 'trial') setDaysLeft(trialDaysLeft(data.trial_ends_at));
      }
      // If no profiles row exists, status stays 'trial' (default) — user is not plan-locked.
      setLoading(false);
    }
    void load();
  }, []);

  return { status, daysLeft, loading };
}
