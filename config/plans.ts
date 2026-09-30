/**
 * Redlined1 plan configuration.
 * This is the single source of truth for plan definitions and feature limits.
 * Provider-specific product/price IDs come from environment variables only —
 * never hardcoded here.
 */

import type { RedlinedPlanId, BillingInterval, PaymentProviderName } from '@/lib/payments/types';

export interface PlanFeatures {
  unlimitedInvoices: boolean;
  maxTechnicians: number | null; // null = unlimited
  aiAdvisor: boolean;
  smsCredits: number;            // -1 = custom/negotiated
  digitalInspections: boolean;
  smartIntake: boolean;
  multiLocation: boolean;
  reports: boolean;
  repairIntelligence: boolean;
  triage: boolean;
  prioritySupport: boolean;
  /**
   * May assign internal reminders to other shop members. Without it a plan
   * still keeps unlimited reminders for yourself (Solo). Free Forever is not a
   * PlanConfig; its reminder rules are FREE_FOREVER_REMINDERS below.
   */
  teamReminders: boolean;
}

export interface PlanConfig {
  id: RedlinedPlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;   // null = contact sales
  annualPrice: number | null;
  features: PlanFeatures;
  highlighted?: boolean;
}

export const PLANS: Record<RedlinedPlanId, PlanConfig> = {
  solo: {
    id: 'solo',
    name: 'Solo',
    description: 'For individual mechanics and mobile operators',
    monthlyPrice: 24,
    annualPrice: 240,
    features: {
      unlimitedInvoices: false,
      maxTechnicians: 1,
      aiAdvisor: false,
      smsCredits: 0,
      digitalInspections: true,
      smartIntake: false,
      multiLocation: false,
      reports: false,
      repairIntelligence: false,
      triage: false,
      prioritySupport: false,
      teamReminders: false,
    },
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small shops with a few technicians',
    monthlyPrice: 49,
    annualPrice: 490,
    features: {
      unlimitedInvoices: false,
      maxTechnicians: 3,
      aiAdvisor: false,
      smsCredits: 0,
      digitalInspections: true,
      smartIntake: false,
      multiLocation: false,
      reports: false,
      repairIntelligence: false,
      triage: false,
      prioritySupport: false,
      teamReminders: true,
    },
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'For growing shops with multiple technicians',
    monthlyPrice: 99,
    annualPrice: 990,
    highlighted: true,
    features: {
      unlimitedInvoices: true,
      maxTechnicians: 8,
      aiAdvisor: true,
      smsCredits: 500,
      digitalInspections: true,
      smartIntake: true,
      multiLocation: false,
      reports: true,
      repairIntelligence: true,
      triage: true,
      prioritySupport: false,
      teamReminders: true,
    },
  },

  business: {
    id: 'business',
    name: 'Business',
    description: 'Full-featured for established multi-bay operations',
    monthlyPrice: 179,
    annualPrice: 1790,
    features: {
      unlimitedInvoices: true,
      maxTechnicians: null,
      aiAdvisor: true,
      smsCredits: 2000,
      digitalInspections: true,
      smartIntake: true,
      multiLocation: true,
      reports: true,
      repairIntelligence: true,
      triage: true,
      prioritySupport: true,
      teamReminders: true,
    },
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom pricing for multi-location operations and fleets',
    monthlyPrice: null,
    annualPrice: null,
    features: {
      unlimitedInvoices: true,
      maxTechnicians: null,
      aiAdvisor: true,
      smsCredits: -1,
      digitalInspections: true,
      smartIntake: true,
      multiLocation: true,
      reports: true,
      repairIntelligence: true,
      triage: true,
      prioritySupport: true,
      teamReminders: true,
    },
  },
};

/**
 * Free Forever's internal reminders: kept for yourself only, at most this many
 * open at once per shop. Completed and cancelled reminders do not count.
 *
 * Enforced by the shop_reminders_guard trigger in
 * supabase/migrations/2026-09-29_internal_reminders.sql, which holds the same
 * number; lib/reminders/__tests__/entitlements.test.ts fails if they drift.
 */
export const FREE_FOREVER_REMINDERS = { maxOpen: 3, teamReminders: false } as const;

export const PLAN_ORDER: RedlinedPlanId[] = ['solo', 'starter', 'professional', 'business', 'enterprise'];

/**
 * Resolves the provider-specific product or price ID for a given plan + interval.
 * IDs live in environment variables so they can differ between Creem and Stripe
 * without any code changes.
 *
 * Creem uses "product IDs", Stripe uses "price IDs" — same key pattern, different suffix.
 *
 * Example env var: CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID=prod_abc123
 */
export function getProductId(
  provider: PaymentProviderName,
  planId: RedlinedPlanId,
  interval: BillingInterval,
): string {
  const suffix = provider === 'creem' ? 'PRODUCT_ID' : 'PRICE_ID';
  const key = `${provider.toUpperCase()}_${planId.toUpperCase()}_${interval.toUpperCase()}_${suffix}`;
  const id = process.env[key];
  if (!id) {
    throw new Error(
      `Missing environment variable: ${key}. ` +
      `Set this in your .env.local to enable ${planId} ${interval} billing via ${provider}.`
    );
  }
  return id;
}

/** Returns the annual savings percentage vs monthly billing. */
export function annualSavings(plan: PlanConfig): number | null {
  if (!plan.monthlyPrice || !plan.annualPrice) return null;
  const monthly12 = plan.monthlyPrice * 12;
  return Math.round(((monthly12 - plan.annualPrice) / monthly12) * 100);
}
