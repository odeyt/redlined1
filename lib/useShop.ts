'use client';
import { useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getShopId, setShopId, setMirrorShopIds, getMirrorShopIds, assertShopOwner } from './shopStore';

export interface Shop {
  id: string;
  name: string;
}

// Role → blocked module list
// Owner has no restrictions.

// Owner: full access — no restrictions.

// Manager: sees operations end-to-end but cannot touch financial records,
// admin settings, subscriptions, or access control.
export const MANAGER_BLOCKED: string[] = [
  'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide', 'system-health', 'disaster-recovery', 'testing-dashboard',
  'billing',
];

// Technician: shop-floor only.
// Can see job cards, repair orders, inspections, parts, time tracking, and
// the tools (VIN/DTC/diagnostics). Cannot access customer financials,
// admin, or communication blasts.
export const TECHNICIAN_BLOCKED: string[] = [
  'customers', 'vehicles', 'appointments', 'scheduling',
  'estimates', 'invoices', 'payments', 'reports', 'campaigns',
  'settings', 'subscriptions', 'access', 'labor-guide', 'system-health', 'disaster-recovery', 'testing-dashboard',
  'communication', 'vin', 'dtc', 'ai', 'diagnostics', 'job-archive',
  'billing', 'command-center',
];

// Service Advisor: customer-facing + operational.
// Handles intake (customers, vehicles, appointments), job cards, inspections,
// estimates, parts sourcing (parts + parts-orders), and repair-order visibility.
// Cannot access invoicing, payments, financial reports, admin, or labor-guide.
// This fallback is intentionally restrictive — the owner's saved role_permissions
// from shop_settings override this list when loaded via /api/role-permissions.
export const ADVISOR_BLOCKED: string[] = [
  'command-center',
  'job-archive', 'time-tracking',
  'repair-orders', 'technicians',
  'parts-estimates', 'parts-orders', 'parts-received',
  'invoices', 'payments',
  'repair-intelligence', 'reports', 'labor-guide',
  'access', 'billing', 'subscriptions',
  'settings', 'system-health', 'disaster-recovery', 'testing-dashboard',
  'campaigns',
];

// Every non-dashboard module — used to block unverified/loading roles
const ALL_NON_DASHBOARD = [
  'customers','vehicles','appointments','scheduling','job-cards','inspections',
  'estimates','repair-orders','technicians','parts','invoices','payments',
  'communication','vin','dtc','diagnostics','ai','reports','labor-guide',
  'access','subscriptions','settings','billing',
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
  const [mirrorShopIds, setLocalMirrorIds] = useState<string[]>(getMirrorShopIds());

  useEffect(() => {
    let cancelled = false;

    /**
     * Resolves the signed-in user, waiting for auth to settle first.
     *
     * getUser() can answer "no user" on a cold start simply because the
     * session has not been restored yet — which is not the same as being
     * signed out. Treating the two as equal is what produced this bug:
     *
     *   loading flips to false -> AppShell renders the active view -> that
     *   view sees a shopId cached in localStorage and immediately queries ->
     *   the request goes out with no session, as `anon` -> `42501 permission
     *   denied for table shop_users`, because the grant is on `authenticated`
     *   only.
     *
     * Reported on an Android phone, where a cold PWA start is slow enough to
     * lose the race; it cleared on refresh, by which point the session had
     * been restored. Desktop almost always wins the race, which is why this
     * never showed up locally.
     *
     * onAuthStateChange fires INITIAL_SESSION once auth has settled, so a
     * genuinely signed-out user still resolves promptly rather than hanging.
     * The timeout is a backstop for the case where that event never arrives —
     * better to proceed and let a query fail than to leave the app on a
     * spinner forever.
     */
    async function resolveUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) return user;

      // Explicit type: in this branch `user` is narrowed to null, so
      // `typeof user` would make the promise Promise<null>.
      return new Promise<User | null>(resolve => {
        const timer = setTimeout(() => { sub.data.subscription.unsubscribe(); resolve(null); }, 5000);
        const sub = supabase.auth.onAuthStateChange((_event, session) => {
          if (!session?.user) return;
          clearTimeout(timer);
          sub.data.subscription.unsubscribe();
          resolve(session.user);
        });
      });
    }

    async function load() {
      const user = await resolveUser();
      if (cancelled) return;
      if (!user) { setLoading(false); return; }

      // Discard a shop id cached by a different account on this browser before
      // any shop-scoped query can run with it.
      if (assertShopOwner(user.id)) setLocalShopId('');

      let { data: suRows } = await supabase
        .from('shop_users')
        .select('shop_id, role')
        .eq('user_id', user.id);

      // No membership means no shop — the account cannot save a customer, a
      // vehicle or a job, and cannot be billed.
      //
      // Provisioning used to happen only in the auth callback, so any route
      // into the app that skipped it left the user in exactly this state. The
      // callback also swallows provisioning errors so a failure cannot block
      // login, which made a failed provision indistinguishable from a
      // successful one: the app loaded, the sidebar showed its "My Shop"
      // defaults, and nothing indicated the shop was missing.
      //
      // This is the point where the app first *knows*, so it is the right place
      // to repair it. /api/provision is idempotent and reports its own
      // failures, unlike the callback.
      if (!suRows || suRows.length === 0) {
        try {
          const res = await fetch('/api/provision', { method: 'POST' });
          if (res.ok) {
            ({ data: suRows } = await supabase
              .from('shop_users')
              .select('shop_id, role')
              .eq('user_id', user.id));
          } else {
            console.error('[useShop] provisioning failed', res.status);
          }
        } catch (err) {
          // Offline or the route is unreachable. Falling through leaves the
          // user shop-less for this session, the same as before; the next load
          // retries.
          console.error('[useShop] provisioning request failed', err);
        }
      }

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
          setShopId(list[0].id, user.id);
          window.location.reload();
          return;
        }
        setShopId(current, user.id);
        setLocalShopId(current);

        // Load mirror shop links for the active shop.
        // The error was previously discarded, so a permissions failure on
        // shop_mirrors was indistinguishable from "this shop has no mirrors" —
        // mirroring appeared simply not to work, with nothing logged anywhere.
        const { data: mirrorRows, error: mirrorErr } = await supabase
          .from('shop_mirrors')
          .select('mirror_shop_id')
          .eq('shop_id', current);
        if (mirrorErr) {
          console.error(
            '[useShop] could not read shop_mirrors — multi-shop visibility is disabled:',
            mirrorErr.message,
          );
        }
        const mirrors = (mirrorRows ?? []).map((r: Record<string, unknown>) => r.mirror_shop_id as string).filter(Boolean);
        setMirrorShopIds(mirrors);
        setLocalMirrorIds(mirrors);

        const activeRow = (suRows ?? []).find(
          (r: Record<string, unknown>) => r.shop_id === current
        );
        // Never default to owner — if no row found, role stays '' (blocked)
        const resolvedRole = (activeRow as Record<string, unknown>)?.role as string ?? '';
        setRole(resolvedRole);
      } else {
        // No shop memberships — new free/trial user.
        // Clear any stale shopId from a previous session so branding doesn't leak.
        setShopId('');
        setLocalShopId('');
        setMirrorShopIds([]);
        setLocalMirrorIds([]);
        // Treat as owner so plan-gating (not role-blocking) controls module visibility.
        setRole('owner');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
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
    mirrorShopIds,
    currentShop: shops.find(s => s.id === shopId) ?? null,
  };
}
