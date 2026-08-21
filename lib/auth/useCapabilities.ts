'use client';

/**
 * What the signed-in person may do in the current shop, for the UI.
 *
 * ## Why this exists
 *
 * A manager at D1 Imports had invoicing and estimates withheld in Role
 * Permissions. The domain layer refused correctly — but the screen still
 * offered "Create Invoice", "Create Estimate" and "raise invoice", and signing
 * off a repair order tried to raise a draft invoice regardless. The result was
 * a red banner on a successful sign-off telling them they lack a permission
 * they had never been offered a way to know about.
 *
 * Refusing at the boundary is right. Offering a button that always refuses is
 * not: it reads as a broken product rather than a withheld permission.
 *
 * ## One source of truth
 *
 * This does NOT re-derive permissions. It reuses `browserDeps()` — the same
 * resolution the domain layer uses on every write — so the button and the
 * refusal can never disagree. Role comes from `shop_users`, overrides from
 * `shop_settings.capability_overrides`; neither is read from client state.
 *
 * ## Unresolved is not "denied"
 *
 * `capabilities` is null when resolution FAILED, as distinct from an empty
 * list, which means "this person is not a member". A slow session or a hiccup
 * reading settings must not strip a manager of buttons they genuinely hold —
 * so while unresolved, `can()` answers true and the server stays the
 * authority. Hiding controls on a network blip would be the billing-lockout
 * mistake in a smaller costume.
 */
import { useEffect, useState } from 'react';

export interface Capabilities {
  /** Null until resolved, and after a failed resolution. */
  capabilities: string[] | null;
  role: string | null;
  loading: boolean;
  /** True while unresolved: the server decides, not the screen. */
  can: (capability: string) => boolean;
  /**
   * Whether this role may reach a module at this shop.
   *
   * A SECOND question from `can()`, deliberately. Redlined1 has two permission
   * systems and they are separate on purpose:
   *
   *   role_permissions      what a role may SEE   (module allowlist, per shop)
   *   capabilities          what a role may DO    (verbs on subjects)
   *
   * `lib/auth/capabilities.ts` says unifying them is a later milestone,
   * because doing both at once changes what people see and what they may do in
   * one release with no way to tell which broke.
   *
   * Until then a screen offering an in-context action has to ask both. The
   * Repair Orders screen offered "Create Estimate" to a manager whose shop had
   * removed the Estimates module — the capability was still granted by default,
   * so `can()` alone would have kept showing it.
   */
  canUseModule: (moduleId: string) => boolean;
}

export function useCapabilities(shopId?: string | null): Capabilities {
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Inside the async body, not synchronously in the effect: setting state
      // during the effect itself is what react-hooks/set-state-in-effect
      // flags, and it would add to the lint baseline for no behavioural gain.
      if (!cancelled) setLoading(true);
      try {
        const { browserDeps } = await import('@/lib/domain/browserAdapter');
        const { context } = await browserDeps();
        if (cancelled) return;
        setCapabilities(context.capabilities ? [...context.capabilities] : null);
        setRole(context.actor.role ?? null);
      } catch {
        // Unresolved, deliberately — not an empty list.
        if (!cancelled) setCapabilities(null);
      }

      try {
        const { fetchShopSettings } = await import('@/services/shopSettingsService');
        const settings = await fetchShopSettings();
        if (cancelled) return;
        const forRole = settings.rolePermissions?.[role as keyof typeof settings.rolePermissions];
        // An empty saved list means "not configured", matching AppShell —
        // not "this role may see nothing".
        setAllowedModules(forRole && forRole.length > 0 ? [...forRole] : null);
      } catch {
        if (!cancelled) setAllowedModules(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // Re-resolves when the active shop changes: permissions are per shop, and
    // a two-location owner can hold different ones in each.
  }, [shopId, role]);

  return {
    capabilities,
    role,
    loading,
    can: (capability: string) => (capabilities === null ? true : capabilities.includes(capability)),
    canUseModule: (moduleId: string) => {
      // The owner is never filtered, exactly as AppShell has it.
      if (role === 'owner') return true;
      // Unconfigured or unread: defer. Hiding a control on a settings hiccup
      // is the billing-lockout mistake in a smaller costume.
      if (allowedModules === null) return true;
      return allowedModules.includes(moduleId);
    },
  };
}
