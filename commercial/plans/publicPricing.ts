/**
 * commercial/plans/publicPricing.ts
 * Public-facing pricing table for landing page use.
 * No sensitive data — safe to import in client components.
 */

export interface PublicPlanFeature {
  label: string;
  included: boolean | string;
}

export interface PublicPlan {
  key: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  annualSavingsPct: number | null;
  highlighted: boolean;
  ctaLabel: string;
  limits: {
    users: string;
    locations: string;
    vehicles: string;
    aiCredits: string;
    storage: string;
  };
  features: PublicPlanFeature[];
}

export const PUBLIC_PRICING: PublicPlan[] = [
  {
    key:         'starter',
    name:        'Starter',
    description: 'Perfect for solo mechanics and small shops',
    monthlyPrice: 49,
    annualPrice:  490,
    currency:    'USD',
    annualSavingsPct: 17,
    highlighted: false,
    ctaLabel:    'Start free trial',
    limits: { users: '2 users', locations: '1 location', vehicles: '500 vehicles', aiCredits: '100 AI credits/mo', storage: '5 GB' },
    features: [
      { label: 'Invoicing & Estimates',  included: true },
      { label: 'Digital Inspections',    included: true },
      { label: 'Job Cards',              included: true },
      { label: 'Customer Management',    included: true },
      { label: 'Repair Intelligence',    included: false },
      { label: 'AI Smart Intake',        included: false },
      { label: 'Multi-Location',         included: false },
      { label: 'Priority Support',       included: false },
    ],
  },
  {
    key:         'professional',
    name:        'Professional',
    description: 'For growing shops with multiple technicians',
    monthlyPrice: 99,
    annualPrice:  990,
    currency:    'USD',
    annualSavingsPct: 17,
    highlighted: true,
    ctaLabel:    'Start free trial',
    limits: { users: '10 users', locations: '3 locations', vehicles: '2,000 vehicles', aiCredits: '500 AI credits/mo', storage: '20 GB' },
    features: [
      { label: 'Everything in Starter',  included: true },
      { label: 'Repair Intelligence',    included: true },
      { label: 'AI Smart Intake',        included: true },
      { label: 'SMS Notifications',      included: true },
      { label: 'Advanced Reports',       included: true },
      { label: 'Multi-Location',         included: false },
      { label: 'Priority Support',       included: false },
    ],
  },
  {
    key:         'business',
    name:        'Business',
    description: 'Full-featured for established multi-bay operations',
    monthlyPrice: 199,
    annualPrice:  1990,
    currency:    'USD',
    annualSavingsPct: 17,
    highlighted: false,
    ctaLabel:    'Start free trial',
    limits: { users: '25 users', locations: '10 locations', vehicles: 'Unlimited', aiCredits: '2,000 AI credits/mo', storage: '100 GB' },
    features: [
      { label: 'Everything in Professional', included: true },
      { label: 'Multi-Location',             included: true },
      { label: 'Fleet Management',           included: true },
      { label: 'Priority Support',           included: true },
      { label: 'Custom Integrations',        included: true },
    ],
  },
  {
    key:         'enterprise',
    name:        'Enterprise',
    description: 'Custom pricing for multi-location chains and dealer groups',
    monthlyPrice: null,
    annualPrice:  null,
    currency:    'USD',
    annualSavingsPct: null,
    highlighted: false,
    ctaLabel:    'Contact sales',
    limits: { users: 'Unlimited', locations: 'Unlimited', vehicles: 'Unlimited', aiCredits: 'Custom', storage: 'Custom' },
    features: [
      { label: 'Everything in Business',  included: true },
      { label: 'Dedicated Account Manager', included: true },
      { label: 'SLA Guarantee',           included: true },
      { label: 'Custom Onboarding',       included: true },
      { label: 'White-label Options',     included: true },
    ],
  },
];
