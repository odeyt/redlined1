/**
 * lib/entitlements/planRegistry.ts
 *
 * CANONICAL plan registry — single source of truth for all plan definitions.
 *
 * All pricing UI, entitlement checks, checkout validation, billing UI,
 * and the Entitlement Engine must import from here.
 *
 * Do NOT add plan logic elsewhere in the codebase.
 * To add a plan: add an entry here and update PLAN_ORDER.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanKey =
  | 'free'
  | 'solo'
  | 'starter'
  | 'professional'
  | 'business'
  | 'enterprise';

export type BillingMode = 'internal' | 'creem' | 'custom';
export type BillingInterval = 'monthly' | 'annual';
export type SupportLevel = 'community' | 'email' | 'priority' | 'dedicated';

export interface PlanUsageLimits {
  /** Total capacity — never resets */
  customersTotal: number | null;
  vehiclesTotal: number | null;
  usersTotal: number | null;
  techniciansTotal: number | null;
  locationsTotal: number | null;
  storageMb: number | null;

  /** Monthly counters — reset at calendar-month boundary */
  completedJobsPerMonth: number | null;
  aiCasesPerMonth: number | null;
  vinLookupsPerMonth: number | null;
  appointmentsPerMonth: number | null;
  dviPerMonth: number | null;
  smsPerMonth: number | null;

  /** Photo upload limits — per vehicle / per entity (job card, RO, appt) / per part */
  vehiclePhotosMax: number | null;
  entityPhotosMax: number | null;
  partPhotosMax: number | null;
}

export interface PlanFeatures {
  unlimitedInvoices: boolean;
  aiAdvisor: boolean;
  smsCredits: boolean;
  digitalInspections: boolean;
  smartIntake: boolean;
  multiLocation: boolean;
  reports: boolean;
  repairIntelligence: boolean;
  triage: boolean;
  prioritySupport: boolean;
  dedicatedAccountManager: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
}

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  description: string;
  /** Ascending order index — used for comparisons */
  order: number;
  /** Whether this plan appears in the public pricing page */
  publicVisible: boolean;
  billingMode: BillingMode;
  /** null = contact sales */
  monthlyPrice: number | null;
  annualPrice: number | null;
  /** Whether this plan requires a Creem checkout */
  requiresCheckout: boolean;
  /** Whether this plan ever expires (Free never does) */
  expires: boolean;
  /** Plan this downgrades to on cancellation/expiry */
  downgradeTarget: PlanKey | null;
  highlighted: boolean;
  supportLevel: SupportLevel;
  /** Environment variable key for Creem product ID (paid plans only) */
  creemProductKeyMonthly: string | null;
  creemProductKeyAnnual: string | null;
  limits: PlanUsageLimits;
  features: PlanFeatures;
}

// ─── Internal D1 shop IDs ─────────────────────────────────────────────────────

/** These shops always receive full platform access regardless of plan. */
export const INTERNAL_SHOP_IDS = new Set([
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
]);

// ─── Plan definitions ─────────────────────────────────────────────────────────

const FREE_LIMITS: PlanUsageLimits = {
  customersTotal:        10,
  vehiclesTotal:         10,
  usersTotal:             1,
  techniciansTotal:       1,
  locationsTotal:         1,
  storageMb:            250,
  completedJobsPerMonth:  5,
  aiCasesPerMonth:        2,
  vinLookupsPerMonth:     2,
  appointmentsPerMonth:   5,
  dviPerMonth:            2,
  smsPerMonth:            0,
  vehiclePhotosMax:       1,
  entityPhotosMax:        2,
  partPhotosMax:          1,
};

const NULL_LIMITS: PlanUsageLimits = {
  customersTotal:        null,
  vehiclesTotal:         null,
  usersTotal:            null,
  techniciansTotal:      null,
  locationsTotal:        null,
  storageMb:             null,
  completedJobsPerMonth: null,
  aiCasesPerMonth:       null,
  vinLookupsPerMonth:    null,
  appointmentsPerMonth:  null,
  dviPerMonth:           null,
  smsPerMonth:           null,
  vehiclePhotosMax:      null,
  entityPhotosMax:       null,
  partPhotosMax:         null,
};

const NO_FEATURES: PlanFeatures = {
  unlimitedInvoices: false, aiAdvisor: false, smsCredits: false,
  digitalInspections: false, smartIntake: false, multiLocation: false,
  reports: false, repairIntelligence: false, triage: false,
  prioritySupport: false, dedicatedAccountManager: false, whiteLabel: false,
  apiAccess: false,
};

const ALL_FEATURES: PlanFeatures = {
  unlimitedInvoices: true, aiAdvisor: true, smsCredits: true,
  digitalInspections: true, smartIntake: true, multiLocation: true,
  reports: true, repairIntelligence: true, triage: true,
  prioritySupport: true, dedicatedAccountManager: true, whiteLabel: true,
  apiAccess: true,
};

export const PLAN_REGISTRY: Record<PlanKey, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Free Forever',
    description: 'For shops just getting started — no credit card required',
    order: 0,
    publicVisible: true,
    billingMode: 'internal',
    monthlyPrice: 0,
    annualPrice: 0,
    requiresCheckout: false,
    expires: false,
    downgradeTarget: null,
    highlighted: false,
    supportLevel: 'community',
    creemProductKeyMonthly: null,
    creemProductKeyAnnual: null,
    limits: FREE_LIMITS,
    features: {
      ...NO_FEATURES,
      // Free plan has limited access to these — usage limits enforced server-side
      digitalInspections: true,   // 2 DVI/mo limit applies
    },
  },

  solo: {
    key: 'solo',
    name: 'Solo',
    description: 'For individual mechanics and mobile operators',
    order: 1,
    publicVisible: true,
    billingMode: 'creem',
    monthlyPrice: 24,
    annualPrice: 240,
    requiresCheckout: true,
    expires: true,
    downgradeTarget: 'free',
    highlighted: false,
    supportLevel: 'email',
    creemProductKeyMonthly: 'CREEM_SOLO_MONTHLY_PRODUCT_ID',
    creemProductKeyAnnual: 'CREEM_SOLO_ANNUAL_PRODUCT_ID',
    limits: {
      customersTotal:        null,
      vehiclesTotal:         null,
      usersTotal:             1,
      techniciansTotal:       1,
      locationsTotal:         1,
      storageMb:           5120,  // 5 GB
      completedJobsPerMonth: 200,
      aiCasesPerMonth:        50,
      vinLookupsPerMonth:     20,
      appointmentsPerMonth:  null,
      dviPerMonth:            20,
      smsPerMonth:             0,
      vehiclePhotosMax:        5,
      entityPhotosMax:        10,
      partPhotosMax:           5,
    },
    features: {
      ...NO_FEATURES,
      unlimitedInvoices: false,
      digitalInspections: true,
      aiAdvisor: false,
    },
  },

  starter: {
    key: 'starter',
    name: 'Starter',
    description: 'Perfect for small shops with a few technicians',
    order: 2,
    publicVisible: true,
    billingMode: 'creem',
    monthlyPrice: 49,
    annualPrice: 490,
    requiresCheckout: true,
    expires: true,
    downgradeTarget: 'free',
    highlighted: false,
    supportLevel: 'email',
    creemProductKeyMonthly: 'CREEM_STARTER_MONTHLY_PRODUCT_ID',
    creemProductKeyAnnual: 'CREEM_STARTER_ANNUAL_PRODUCT_ID',
    limits: {
      customersTotal:        null,
      vehiclesTotal:          500,
      usersTotal:               2,
      techniciansTotal:         3,
      locationsTotal:           1,
      storageMb:             5120,  // 5 GB
      completedJobsPerMonth:  200,
      aiCasesPerMonth:        100,
      vinLookupsPerMonth:      50,
      appointmentsPerMonth:  null,
      dviPerMonth:           null,
      smsPerMonth:              0,
      vehiclePhotosMax:        10,
      entityPhotosMax:         20,
      partPhotosMax:           10,
    },
    features: {
      ...NO_FEATURES,
      unlimitedInvoices: false,
      digitalInspections: true,
    },
  },

  professional: {
    key: 'professional',
    name: 'Professional',
    description: 'For growing shops with multiple technicians',
    order: 3,
    publicVisible: true,
    billingMode: 'creem',
    monthlyPrice: 99,
    annualPrice: 990,
    requiresCheckout: true,
    expires: true,
    downgradeTarget: 'free',
    highlighted: true,
    supportLevel: 'email',
    creemProductKeyMonthly: 'CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID',
    creemProductKeyAnnual: 'CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID',
    limits: {
      customersTotal:        null,
      vehiclesTotal:         2000,
      usersTotal:              10,
      techniciansTotal:         8,
      locationsTotal:           3,
      storageMb:            20480,  // 20 GB
      completedJobsPerMonth: 1000,
      aiCasesPerMonth:        500,
      vinLookupsPerMonth:     200,
      appointmentsPerMonth:  null,
      dviPerMonth:           null,
      smsPerMonth:            500,
      vehiclePhotosMax:        25,
      entityPhotosMax:         50,
      partPhotosMax:           25,
    },
    features: {
      ...NO_FEATURES,
      unlimitedInvoices: true,
      aiAdvisor: true,
      smsCredits: true,
      digitalInspections: true,
      smartIntake: true,
      reports: true,
      repairIntelligence: true,
      triage: true,
    },
  },

  business: {
    key: 'business',
    name: 'Business',
    description: 'Full-featured for established multi-bay operations',
    order: 4,
    publicVisible: true,
    billingMode: 'creem',
    monthlyPrice: 199,
    annualPrice: 1990,
    requiresCheckout: true,
    expires: true,
    downgradeTarget: 'free',
    highlighted: false,
    supportLevel: 'priority',
    creemProductKeyMonthly: 'CREEM_BUSINESS_MONTHLY_PRODUCT_ID',
    creemProductKeyAnnual: 'CREEM_BUSINESS_ANNUAL_PRODUCT_ID',
    limits: {
      ...NULL_LIMITS,
      usersTotal:        25,
      techniciansTotal:  null,
      locationsTotal:    10,
      storageMb:      102400,  // 100 GB
      smsPerMonth:      2000,
      vehiclePhotosMax:  100,
      entityPhotosMax:   200,
      partPhotosMax:     100,
    },
    features: {
      ...ALL_FEATURES,
      dedicatedAccountManager: false,
      whiteLabel: false,
      apiAccess: false,
    },
  },

  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Custom pricing for multi-location chains and dealer groups',
    order: 5,
    publicVisible: true,
    billingMode: 'custom',
    monthlyPrice: null,
    annualPrice: null,
    requiresCheckout: false,  // contact sales flow
    expires: false,
    downgradeTarget: 'free',
    highlighted: false,
    supportLevel: 'dedicated',
    creemProductKeyMonthly: null,
    creemProductKeyAnnual: null,
    limits: NULL_LIMITS,
    features: ALL_FEATURES,
  },
};

/** Plans in ascending tier order */
export const PLAN_ORDER: PlanKey[] = [
  'free', 'solo', 'starter', 'professional', 'business', 'enterprise',
];

/** Plans that require an active Creem subscription */
export const PAID_PLAN_KEYS = new Set<PlanKey>([
  'solo', 'starter', 'professional', 'business', 'enterprise',
]);

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getPlan(key: string): PlanDefinition | null {
  return PLAN_REGISTRY[key as PlanKey] ?? null;
}

export function getPlanOrFree(key: string | null | undefined): PlanDefinition {
  return PLAN_REGISTRY[key as PlanKey] ?? PLAN_REGISTRY.free;
}

export function comparePlans(a: PlanKey, b: PlanKey): -1 | 0 | 1 {
  const ia = PLAN_REGISTRY[a]?.order ?? -1;
  const ib = PLAN_REGISTRY[b]?.order ?? -1;
  if (ia > ib) return 1;
  if (ia < ib) return -1;
  return 0;
}

/** Returns true if targetPlan is the same tier or higher than currentPlan */
export function planMeetsOrExceeds(targetPlan: PlanKey, currentPlan: PlanKey): boolean {
  return comparePlans(targetPlan, currentPlan) >= 0;
}

/** Returns the minimum plan that unlocks a feature, or null if no plan includes it */
export function minimumPlanForFeature(
  featureKey: keyof PlanFeatures,
): PlanKey | null {
  for (const key of PLAN_ORDER) {
    if (PLAN_REGISTRY[key].features[featureKey]) return key;
  }
  return null;
}

/** Returns annual savings percentage vs monthly billing */
export function annualSavingsPct(plan: PlanDefinition): number | null {
  if (!plan.monthlyPrice || !plan.annualPrice) return null;
  const monthly12 = plan.monthlyPrice * 12;
  return Math.round(((monthly12 - plan.annualPrice) / monthly12) * 100);
}
