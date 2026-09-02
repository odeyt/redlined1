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
  // Tracks whether we got a real profile row vs a fallback — used by AppShell
  // to avoid showing the hard lock screen when the DB read simply failed.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // True when the DB row explicitly has plan='free' (Free Forever), meaning
  // the 'free' status is intentional — not an expired trial downgrade.
  const [isFreeForever, setIsFreeForever] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        let { data, error } = await supabase
          .from('profiles')
          .select('plan, trial_ends_at, shop_id')
          .eq('id', user.id)
          .single();

        // Settle an unsettled plan before reading it.
        //
        // ensureInitialPlan runs in /auth/callback and /api/provision. The
        // callback fires on email-confirmation links but NOT on password
        // sign-in, and /api/provision is only called when a user has no shop —
        // so an existing account signing in normally hit neither, and its plan
        // was never settled. That left accounts stuck as 'free' with a future
        // trial date the app ignores, losing the paid modules a trial should
        // include.
        //
        // Two states need settling, and only these two:
        //   plan null            — no plan recorded at all
        //   'free' + future end  — the contradictory row a signup trigger writes
        //
        // A spent trial is 'free' with a NULL end date and is deliberately not
        // matched, so signing in again can never grant a second trial. Settled
        // accounts make no extra request.
        const needsSettling = !error && data
          && (data.plan == null
              || (data.plan === 'free'
                  && data.trial_ends_at != null
                  && new Date(data.trial_ends_at) > new Date()));

        if (needsSettling) {
          try {
            const res = await fetch('/api/provision', { method: 'POST' });
            if (res.ok) {
              ({ data, error } = await supabase
                .from('profiles')
                .select('plan, trial_ends_at, shop_id')
                .eq('id', user.id)
                .single());
            }
          } catch {
            // Leave the plan as read — the next load retries.
          }
        }

        if (data && !error) {
          setProfileLoaded(true);
          const s = getPlanStatus(data.plan, data.trial_ends_at);

          /**
           * Internal D1 shops are always 'pro'.
           *
           * This used to read `profiles.shop_id`, which NOTHING WRITES — it is
           * null on 16 of 17 profiles, including every D1 account — so the
           * bypass had never once fired. It went unnoticed because those
           * accounts carry plan='pro' anyway and took the ordinary paid path,
           * which is the only reason a dead safety net looked like a working
           * one.
           *
           * `shop_users` is the real membership record, and the only one that
           * can answer for someone in two shops — which every D1 account is,
           * and which a single `profiles.shop_id` could never represent.
           *
           * Checked only when the plan has NOT already granted pro: that is
           * exactly when the bypass matters, and it keeps the extra query off
           * the path every paying customer takes.
           */
          if (s !== 'pro') {
            const { data: memberships } = await supabase
              .from('shop_users')
              .select('shop_id')
              .eq('user_id', user.id);
            const internal = (memberships ?? []).some(
              (m: { shop_id: string }) => INTERNAL_SHOP_IDS.has(m.shop_id));
            if (internal) {
              setStatus('pro');
              setLoading(false);
              return;
            }
          }

          setStatus(s);
          if (s === 'trial') setDaysLeft(trialDaysLeft(data.trial_ends_at));
          // plan='free' means the user was explicitly provisioned as Free Forever,
          // not an expired trial. The hard lock and watermark must not show for them.
          if (data.plan === 'free') setIsFreeForever(true);
        } else {
          // Profile row missing or DB read failed (e.g. RLS policy misconfiguration).
          // Never hard-lock the user — give a grace trial so they can still access
          // their data and reach billing/support. AppShell checks profileLoaded
          // before showing the full lock screen.
          setStatus('trial');
          setDaysLeft(14);
        }
      } catch {
        // Network / unexpected error — same grace fallback
        setStatus('trial');
        setDaysLeft(14);
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { status, daysLeft, loading, profileLoaded, isFreeForever };
}
