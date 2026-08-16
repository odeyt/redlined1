'use client';

/**
 * The bridge from the current UI to the domain layer.
 *
 * This is the ONLY place allowed to read tenancy from `lib/shopStore.ts`. The
 * shop store is a module-level mutable set during sign-in — fine for a browser
 * tab, meaningless to a webhook — so it is translated into an explicit
 * DomainContext here, at the edge, and never read again below this line.
 *
 * The direction that matters:
 *
 *     UI → service wrapper → this adapter → explicit context → domain service
 *
 * and never
 *
 *     domain service → global browser store
 *
 * `lib/domain/__tests__/noBrowserState.test.ts` enforces the second form
 * cannot appear.
 *
 * The actor is read from the live Supabase session rather than from anything
 * the caller passes, so a component cannot claim to be somebody else. The
 * database does the same check again in `record_audit_event` — this value is
 * for convenience and for the role, not for trust.
 */
import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { createDomainContext, type DomainContext } from './context';
import type { DomainDeps } from './db';

/**
 * Cached because every service call needs the actor and `getUser()` is a
 * round trip. Cleared by `resetBrowserActorCache()` on sign-out; a stale
 * value cannot widen access, since the id is only used for the audit row and
 * RLS re-derives the real user from the JWT on every query.
 */
let cachedActor: { shopId: string; userId: string | null; role: string | null } | null = null;

export function resetBrowserActorCache(): void {
  cachedActor = null;
}

async function resolveActor(shopId: string): Promise<{ userId: string | null; role: string | null }> {
  // Keyed on the shop, because the role is per membership: an owner at one
  // location can be a manager at the other, and a cached role from the
  // previous shop would put the wrong one on every audit row after a switch.
  if (cachedActor && cachedActor.shopId === shopId) return cachedActor;
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    let role: string | null = null;
    if (userId) {
      const { data: membership } = await supabase
        .from('shop_users')
        .select('role')
        .eq('user_id', userId)
        .eq('shop_id', shopId)
        .maybeSingle();
      role = (membership?.role as string) ?? null;
    }
    cachedActor = { shopId, userId, role };
    return cachedActor;
  } catch {
    // A failure to name the actor must not stop the business operation. The
    // audit row still gets written, with a null actor, and the database
    // stamps auth.uid() itself — so the row is not actually anonymous.
    return { userId: null, role: null };
  }
}

/** Builds `{ db, context }` for a call made by the signed-in browser session. */
export async function browserDeps(): Promise<DomainDeps> {
  const shopId = getShopId();
  const actor = await resolveActor(shopId);
  const context: DomainContext = createDomainContext({
    shopId,
    shopIds: getShopIds(),
    actor: { type: 'user', userId: actor.userId, role: actor.role },
  });
  return { db: supabase, context };
}
