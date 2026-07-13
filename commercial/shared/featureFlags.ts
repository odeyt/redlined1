/**
 * commercial/shared/featureFlags.ts
 * Commercial billing feature flags.
 * All default to DISABLED — must be explicitly enabled via DB or env.
 *
 * These flags gate the commercial billing features independently of
 * the core repair-shop workflow. Disabling any of these never affects
 * invoicing, job cards, repair orders, or any existing feature.
 */

export const COMMERCIAL_FLAGS = {
  /** Master switch for the entire billing system. */
  commercial_billing: 'commercial_billing',

  /** Allow new shops to self-register via the public signup page. */
  self_service_signup: 'self_service_signup',

  /** Allow owners to access the Creem billing portal from the dashboard. */
  billing_portal: 'billing_portal',

  /** Enforce plan limits — if false, all limits are advisory only. */
  subscription_enforcement: 'subscription_enforcement',

  /** Enable the 14-day trial system for new shops. */
  trial_system: 'trial_system',

  /** Enable usage tracking writes to usage_records table. */
  usage_metering: 'usage_metering',

  // ── C-2.2 Billing Health Dashboard ────────────────────────────────────────

  /** Master switch for the internal Billing Health & Revenue Dashboard. */
  billing_health_dashboard: 'billing_health_dashboard',

  /** Enable revenue metrics (MRR, ARR, ARPA) in the admin dashboard. */
  billing_revenue_metrics: 'billing_revenue_metrics',

  /** Enable trial funnel view in the admin dashboard. */
  billing_trial_funnel: 'billing_trial_funnel',

  /** Enable churn analytics in the admin dashboard. */
  billing_churn_analytics: 'billing_churn_analytics',

  /** Enable webhook health panel in the admin dashboard. */
  billing_webhook_health: 'billing_webhook_health',

  /** Enable renewal health panel in the admin dashboard. */
  billing_renewal_health: 'billing_renewal_health',

  /** Enable LTV and CAC panel in the admin dashboard. */
  billing_ltv_cac: 'billing_ltv_cac',

  /** Enable daily metric snapshot job. */
  billing_metric_snapshots: 'billing_metric_snapshots',
} as const;

export type CommercialFlagKey = typeof COMMERCIAL_FLAGS[keyof typeof COMMERCIAL_FLAGS];

/**
 * Default states for all commercial flags.
 * Used as fallback when the DB flags table is unavailable.
 * All defaults are FALSE — billing is opt-in, never opt-out.
 */
export const COMMERCIAL_FLAG_DEFAULTS: Record<CommercialFlagKey, boolean> = {
  commercial_billing:          false,
  self_service_signup:         false,
  billing_portal:              false,
  subscription_enforcement:    false,
  trial_system:                false,
  usage_metering:              false,
  billing_health_dashboard:    false,
  billing_revenue_metrics:     false,
  billing_trial_funnel:        false,
  billing_churn_analytics:     false,
  billing_webhook_health:      false,
  billing_renewal_health:      false,
  billing_ltv_cac:             false,
  billing_metric_snapshots:    false,
};

/**
 * SQL seed for inserting default commercial flags.
 * Run this in Supabase after applying the main migration.
 *
 * INSERT INTO feature_flags (flag_key, enabled, description, environment)
 * VALUES
 *   ('commercial_billing',       false, 'Master switch for commercial billing platform', 'production'),
 *   ('self_service_signup',      false, 'Allow public shop self-registration', 'production'),
 *   ('billing_portal',           false, 'Allow owners to manage billing via Creem portal', 'production'),
 *   ('subscription_enforcement', false, 'Enforce plan limits on shop operations', 'production'),
 *   ('trial_system',             false, 'Auto-create 14-day trial on shop signup', 'production'),
 *   ('usage_metering',           false, 'Track usage in usage_records table', 'production')
 * ON CONFLICT (flag_key) DO NOTHING;
 */
