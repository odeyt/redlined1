'use client';

/**
 * What the reminder screens need to know about the person using them: who
 * they are, whether they manage this shop, what the plan allows, and — only
 * when they may assign to others — who they could assign to.
 *
 * All of it is presentation. The database decides; this only avoids offering
 * a choice that would be refused.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { useShop } from '@/lib/useShop';
import { authedFetch } from '@/lib/apiClient';
import { fetchReminderTier, type ReminderTier } from '@/services/reminderService';
import { reminderEntitlements, type ReminderEntitlements } from '@/lib/reminders/entitlements';

export interface ShopMember {
  userId: string;
  email: string;
  role: string;
}

export interface ReminderSetup {
  loading: boolean;
  userId: string | null;
  role: string;
  isManager: boolean;
  /** Null until known; the form then offers self-assignment only. */
  entitlements: ReminderEntitlements | null;
  members: ShopMember[];
  /** Short display name for a user id: the part of their email before the @. */
  nameFor: (userId: string | null) => string;
}

export function useReminderSetup(): ReminderSetup {
  const { role, loading: roleLoading } = useShop();
  const [userId, setUserId] = useState<string | null>(null);
  const [tier, setTier] = useState<ReminderTier | null>(null);
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [loading, setLoading] = useState(true);

  const isManager = role === 'owner' || role === 'manager';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data }, t] = await Promise.all([
          supabase.auth.getUser(),
          fetchReminderTier().catch(() => null),
        ]);
        if (cancelled) return;
        setUserId(data.user?.id ?? null);
        setTier(t);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // The roster is only fetched when it could be used: a manager on a plan with
  // team assignment. Everyone else assigns to themselves or nobody.
  useEffect(() => {
    if (roleLoading || !isManager || tier !== 'team') return;
    let cancelled = false;
    authedFetch(`/api/members?shopId=${encodeURIComponent(getShopId())}`)
      .then(r => (r.ok ? r.json() : { members: [] }))
      .then((json: { members?: ShopMember[] }) => { if (!cancelled) setMembers(json.members ?? []); })
      .catch(() => { /* self-assignment still works */ });
    return () => { cancelled = true; };
  }, [roleLoading, isManager, tier]);

  function nameFor(id: string | null): string {
    if (!id) return 'Unassigned';
    if (id === userId) return 'You';
    const email = members.find(m => m.userId === id)?.email ?? '';
    return email ? email.split('@')[0] : 'A team member';
  }

  return {
    loading: loading || roleLoading,
    userId,
    role,
    isManager,
    entitlements: tier ? reminderEntitlements(tier) : null,
    members,
    nameFor,
  };
}
