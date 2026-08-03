/**
 * commercial/shared/types.ts
 * Provider-agnostic commercial billing types for Redlined1.
 * Application code uses these types exclusively — no Creem/Stripe leakage.
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export type BillingProvider = 'creem' | 'stripe' | 'paddle' | 'lemon_squeezy' | 'manual';

export type BillingInterval = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'suspended'
  | 'manual';

export type PlanKey = 'starter' | 'professional' | 'business' | 'enterprise';

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface PlanLimits {
  maxUsers: number | null;           // null = unlimited
  maxLocations: number | null;
  maxVehicles: number | null;
  maxJobCardsPerMonth: number | null;
  aiCreditsPerMonth: number | null;
  storageGb: number | null;
}

export interface BillingPlan {
  id: string;
  planKey: PlanKey;
  name: string;
  description: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  limits: PlanLimits;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface ShopSubscription {
  id: string;
  shopId: string;
  planKey: PlanKey;
  status: SubscriptionStatus;
  billingProvider: BillingProvider;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
  pastDueAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionState {
  subscription: ShopSubscription | null;
  plan: BillingPlan | null;
  isActive: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  trialDaysLeft: number | null;
  enforcementEnabled: boolean;
}

// ─── Billing Events ───────────────────────────────────────────────────────────

export interface BillingEvent {
  id: string;
  shopId: string | null;
  provider: BillingProvider;
  eventType: string;
  providerEventId: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export type UsageKey =
  | 'users'
  | 'locations'
  | 'vehicles'
  | 'job_cards'
  | 'invoices'
  | 'ai_requests'
  | 'support_ai_requests'
  | 'sms_sent'
  | 'storage_mb';

export interface UsageRecord {
  id: string;
  shopId: string;
  usageKey: UsageKey;
  quantity: number;
  periodStart: Date;
  periodEnd: Date;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface MonthlyUsage {
  shopId: string;
  period: { start: Date; end: Date };
  usage: Record<UsageKey, number>;
}

// ─── License ─────────────────────────────────────────────────────────────────

export interface LicenseCheck {
  id: string;
  shopId: string;
  userId: string | null;
  checkKey: string;
  allowed: boolean;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface LicenseCheckResult {
  allowed: boolean;
  reason: string;
  planKey: PlanKey | null;
  limit: number | null;
  current: number | null;
}

// ─── Checkout / Portal ────────────────────────────────────────────────────────

export interface CheckoutSessionInput {
  shopId: string;
  userId: string;
  email: string;
  planKey: PlanKey;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
  provider: BillingProvider;
}

export interface BillingPortalInput {
  shopId: string;
  userId: string;
  providerCustomerId: string;
  returnUrl: string;
}

export interface BillingPortalResult {
  portalUrl: string;
  provider: BillingProvider;
}

// ─── Commercial Dashboard ─────────────────────────────────────────────────────

export interface CommercialDashboardData {
  subscription: ShopSubscription | null;
  plan: BillingPlan | null;
  usage: MonthlyUsage | null;
  billingEnabled: boolean;
  trialDaysLeft: number | null;
  isActive: boolean;
  isPastDue: boolean;
}
