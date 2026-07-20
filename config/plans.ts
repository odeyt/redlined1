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
  free: {
    id: 'free',
    name: 'Free Forever',
    description: 'For shops just getting started — no credit card required',
    monthlyPrice: 0,
    annualPrice: 0,
    features: {
      unlimitedInvoices: false,
      maxTechnicians: 1,
      aiAdvisor: false,   // 2 AI cases/mo via usage limits
      smsCredits: 0,
      digitalInspections: false,  // 2 DVI/mo via usage limits
      smartIntake: false,
      multiLocation: false,
      reports: false,
      repairIntelligence: false,
      triage: false,
      prioritySupport: false,
    },
  },

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
    },
  },
};

export const PLAN_ORDER: RedlinedPlanId[] = ['free', 'solo', 'starter', 'professional', 'business', 'enterprise'];

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
  if (planId === 'free') throw new Error('Free Forever has no payment product — no checkout needed.');
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
