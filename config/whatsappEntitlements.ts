/**
 * WhatsApp Business entitlement — which plans include it, and the add-on for
 * the plans that do not. PREPARED, NOT LIVE.
 *
 * Nothing here charges anyone or creates a checkout. The add-on is
 * `purchasable` only when commercial billing is switched on
 * (NEXT_PUBLIC_BILLING_ENABLED=true) AND a provider product id is set for it;
 * neither is true today. While the integration is a pilot, the only shop that
 * can reach it is D1 Imports, which is internal and always entitled
 * (CLAUDE.md hard constraint 6: internal shops are never gated).
 *
 * Kept out of config/plans.ts on purpose: adding a key to PlanFeatures would
 * change every plan object the pricing page and billing code read, for a
 * feature no customer can buy yet.
 */
import type { RedlinedPlanId } from '@/lib/payments/types';

/** Plans that include WhatsApp Business messaging. */
export const WHATSAPP_INCLUDED_PLANS: readonly RedlinedPlanId[] = ['professional', 'business', 'enterprise'];

export const WHATSAPP_ADDON = {
  id: 'whatsapp_business_addon',
  name: 'WhatsApp Business messaging',
  description: 'Send estimates, invoices and repair updates on your own WhatsApp Business number.',
  /** For Solo and Starter. Placeholder list price; Meta's per-message charges are billed by Meta to the shop. */
  eligiblePlans: ['solo', 'starter'] as readonly RedlinedPlanId[],
  monthlyPriceUsd: 15,
  /** Env var a provider product id would come from. Unset today. */
  productIdEnv: 'CREEM_WHATSAPP_ADDON_MONTHLY_PRODUCT_ID',
} as const;

export function whatsappAddonPurchasable(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && !!process.env[WHATSAPP_ADDON.productIdEnv];
}

export type WhatsAppEntitlementReason = 'internal' | 'plan' | 'addon' | 'not_entitled';

export interface WhatsAppEntitlement {
  entitled: boolean;
  reason: WhatsAppEntitlementReason;
  /** What would unlock it, for an upgrade prompt. */
  upgrade: null | { plans: readonly RedlinedPlanId[]; addon: typeof WHATSAPP_ADDON.id; addonPurchasable: boolean };
}

export function resolveWhatsAppEntitlement(input: {
  internal: boolean;
  planId: RedlinedPlanId | string | null;
  activeAddons?: readonly string[];
}): WhatsAppEntitlement {
  if (input.internal) return { entitled: true, reason: 'internal', upgrade: null };
  if (input.planId && (WHATSAPP_INCLUDED_PLANS as readonly string[]).includes(input.planId)) {
    return { entitled: true, reason: 'plan', upgrade: null };
  }
  if (input.activeAddons?.includes(WHATSAPP_ADDON.id)) return { entitled: true, reason: 'addon', upgrade: null };
  return {
    entitled: false,
    reason: 'not_entitled',
    upgrade: { plans: WHATSAPP_INCLUDED_PLANS, addon: WHATSAPP_ADDON.id, addonPurchasable: whatsappAddonPurchasable() },
  };
}
