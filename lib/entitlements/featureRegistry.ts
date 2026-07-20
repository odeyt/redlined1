/**
 * lib/entitlements/featureRegistry.ts
 *
 * Canonical Feature Registry — typed feature keys and metadata.
 *
 * Application code must reference features by key, never by plan name.
 * The Entitlement Engine resolves whether a workspace has access.
 */

// ─── Feature categories ───────────────────────────────────────────────────────

export type FeatureCategory =
  | 'CORE'
  | 'CUSTOMERS'
  | 'VEHICLES'
  | 'JOBS'
  | 'INVOICING'
  | 'CALENDAR'
  | 'DVI'
  | 'AI'
  | 'REPORTING'
  | 'COMMUNICATION'
  | 'INVENTORY'
  | 'LOCATIONS'
  | 'USERS'
  | 'TECHNICIANS'
  | 'SUPPORT'
  | 'ADMIN';

// ─── Entitlement types ────────────────────────────────────────────────────────

/** Boolean features — either included or not */
export type FeatureEntitlementType = 'boolean';

/** Usage-metered features — included up to a numeric limit */
export type UsageMetricKey =
  | 'customers_total'
  | 'vehicles_total'
  | 'users_total'
  | 'technicians_total'
  | 'locations_total'
  | 'storage_mb'
  | 'completed_jobs'        // monthly
  | 'ai_cases'              // monthly
  | 'vin_lookups'           // monthly
  | 'appointments'          // monthly
  | 'dvi'                   // monthly
  | 'sms';                  // monthly

/** Keys that reset at the calendar-month boundary */
export const MONTHLY_METRIC_KEYS = new Set<UsageMetricKey>([
  'completed_jobs',
  'ai_cases',
  'vin_lookups',
  'appointments',
  'dvi',
  'sms',
]);

/** Keys that are absolute totals (never reset) */
export const TOTAL_METRIC_KEYS = new Set<UsageMetricKey>([
  'customers_total',
  'vehicles_total',
  'users_total',
  'technicians_total',
  'locations_total',
  'storage_mb',
]);

// ─── Typed feature keys ───────────────────────────────────────────────────────

export type FeatureKey =
  | 'customer_management'
  | 'vehicle_management'
  | 'job_management'
  | 'estimate_management'
  | 'invoice_management'
  | 'unlimited_invoices'
  | 'calendar'
  | 'digital_vehicle_inspections'
  | 'ai_diagnostics'
  | 'ai_service_advisor'
  | 'vin_lookup'
  | 'sms_notifications'
  | 'basic_reports'
  | 'advanced_reports'
  | 'repair_intelligence'
  | 'smart_intake'
  | 'triage'
  | 'multi_location'
  | 'multi_user'
  | 'technician_management'
  | 'priority_support'
  | 'dedicated_account_manager'
  | 'white_label'
  | 'api_access';

// ─── Feature definitions ──────────────────────────────────────────────────────

/**
 * Mirrors keyof PlanFeatures without importing from planRegistry (avoids circular dep).
 * Must stay in sync with PlanFeatures in planRegistry.ts.
 * When PlanFeatures gains or loses fields, update this union too.
 */
export type PlanFeatureFlagKey =
  | 'unlimitedInvoices'
  | 'aiAdvisor'
  | 'smsCredits'
  | 'digitalInspections'
  | 'smartIntake'
  | 'multiLocation'
  | 'reports'
  | 'repairIntelligence'
  | 'triage'
  | 'prioritySupport'
  | 'dedicatedAccountManager'
  | 'whiteLabel'
  | 'apiAccess';

export interface FeatureDefinition {
  key: FeatureKey;
  /**
   * Maps to the camelCase key in PlanFeatures, or null if this feature has
   * no boolean plan flag (it is either universally included or usage-only).
   *
   * The entitlement engine uses this field — never runtime key-casting — to
   * look up boolean plan flags. A null value means the feature is structurally
   * available on all plans; access is gated solely by usageMetric (if set).
   */
  planFeatureKey: PlanFeatureFlagKey | null;
  name: string;
  description: string;
  category: FeatureCategory;
  /** Usage metric gating this feature, if any */
  usageMetric: UsageMetricKey | null;
  /** Human-facing message shown in the upgrade prompt */
  upgradeDescription: string;
  /** Whether this feature is shown on the public pricing comparison table */
  publicVisible: boolean;
}

export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  customer_management: {
    key: 'customer_management',
    planFeatureKey: null, // structurally included; gated by customers_total limit
    name: 'Customer Management',
    description: 'Create and manage customer profiles',
    category: 'CUSTOMERS',
    usageMetric: 'customers_total',
    upgradeDescription: 'Upgrade to manage unlimited customers',
    publicVisible: true,
  },
  vehicle_management: {
    key: 'vehicle_management',
    planFeatureKey: null, // structurally included; gated by vehicles_total limit
    name: 'Vehicle Management',
    description: 'Track vehicle history and records',
    category: 'VEHICLES',
    usageMetric: 'vehicles_total',
    upgradeDescription: 'Upgrade to track unlimited vehicles',
    publicVisible: true,
  },
  job_management: {
    key: 'job_management',
    planFeatureKey: null, // structurally included; gated by completed_jobs limit
    name: 'Job Cards & Repair Orders',
    description: 'Create estimates, repair orders, and track completed jobs',
    category: 'JOBS',
    usageMetric: 'completed_jobs',
    upgradeDescription: 'Upgrade to complete more jobs per month',
    publicVisible: true,
  },
  estimate_management: {
    key: 'estimate_management',
    planFeatureKey: null, // structurally included on all plans
    name: 'Estimates',
    description: 'Create and send repair estimates',
    category: 'JOBS',
    usageMetric: null,
    upgradeDescription: 'Upgrade to create unlimited estimates',
    publicVisible: true,
  },
  invoice_management: {
    key: 'invoice_management',
    planFeatureKey: null, // structurally included on all plans
    name: 'Invoicing',
    description: 'Create and send invoices',
    category: 'INVOICING',
    usageMetric: null,
    upgradeDescription: 'Upgrade to create unlimited invoices',
    publicVisible: true,
  },
  unlimited_invoices: {
    key: 'unlimited_invoices',
    planFeatureKey: 'unlimitedInvoices',
    name: 'Unlimited Invoices',
    description: 'No monthly cap on invoices created',
    category: 'INVOICING',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional or higher for unlimited invoices',
    publicVisible: true,
  },
  calendar: {
    key: 'calendar',
    planFeatureKey: null, // structurally included; gated by appointments limit
    name: 'Appointments & Scheduling',
    description: 'Schedule and manage service appointments',
    category: 'CALENDAR',
    usageMetric: 'appointments',
    upgradeDescription: 'Upgrade to schedule unlimited appointments',
    publicVisible: true,
  },
  digital_vehicle_inspections: {
    key: 'digital_vehicle_inspections',
    planFeatureKey: 'digitalInspections',
    name: 'Digital Vehicle Inspections',
    description: 'Conduct and share digital inspection reports',
    category: 'DVI',
    usageMetric: 'dvi',
    upgradeDescription: 'Upgrade to run unlimited digital inspections',
    publicVisible: true,
  },
  ai_diagnostics: {
    key: 'ai_diagnostics',
    planFeatureKey: 'aiAdvisor', // both ai_diagnostics and ai_service_advisor share this flag
    name: 'AI Diagnostics',
    description: 'AI-powered DTC explanations and repair guidance',
    category: 'AI',
    usageMetric: 'ai_cases',
    upgradeDescription: 'Upgrade to Professional for 500 AI cases per month',
    publicVisible: true,
  },
  ai_service_advisor: {
    key: 'ai_service_advisor',
    planFeatureKey: 'aiAdvisor',
    name: 'AI Service Advisor',
    description: 'AI-generated estimates and customer communications',
    category: 'AI',
    usageMetric: 'ai_cases',
    upgradeDescription: 'Upgrade to Professional to unlock AI Service Advisor',
    publicVisible: true,
  },
  vin_lookup: {
    key: 'vin_lookup',
    planFeatureKey: null, // structurally included; gated by vin_lookups limit
    name: 'VIN Decoder',
    description: 'Decode VINs to auto-fill vehicle information',
    category: 'VEHICLES',
    usageMetric: 'vin_lookups',
    upgradeDescription: 'Upgrade to decode more VINs per month',
    publicVisible: false,
  },
  sms_notifications: {
    key: 'sms_notifications',
    planFeatureKey: 'smsCredits',
    name: 'SMS Notifications',
    description: 'Send SMS updates to customers',
    category: 'COMMUNICATION',
    usageMetric: 'sms',
    upgradeDescription: 'Upgrade to Professional for SMS notifications',
    publicVisible: true,
  },
  basic_reports: {
    key: 'basic_reports',
    planFeatureKey: 'reports',
    name: 'Basic Reports',
    description: 'Revenue and job summary reports',
    category: 'REPORTING',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional for business reports',
    publicVisible: true,
  },
  advanced_reports: {
    key: 'advanced_reports',
    planFeatureKey: 'reports',
    name: 'Advanced Reports',
    description: 'Detailed analytics and custom reports',
    category: 'REPORTING',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional for advanced reports',
    publicVisible: true,
  },
  repair_intelligence: {
    key: 'repair_intelligence',
    planFeatureKey: 'repairIntelligence',
    name: 'Repair Intelligence',
    description: 'AI-powered repair history and predictive recommendations',
    category: 'AI',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional for Repair Intelligence',
    publicVisible: true,
  },
  smart_intake: {
    key: 'smart_intake',
    planFeatureKey: 'smartIntake',
    name: 'Smart Intake',
    description: 'AI-powered service intake and pre-diagnosis',
    category: 'AI',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional for Smart Intake',
    publicVisible: true,
  },
  triage: {
    key: 'triage',
    planFeatureKey: 'triage',
    name: 'AI Triage',
    description: 'Guided diagnostic question flow',
    category: 'AI',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Professional for AI Triage',
    publicVisible: false,
  },
  multi_location: {
    key: 'multi_location',
    planFeatureKey: 'multiLocation',
    name: 'Multi-Location',
    description: 'Manage multiple shop locations',
    category: 'LOCATIONS',
    usageMetric: 'locations_total',
    upgradeDescription: 'Upgrade to Business for multi-location management',
    publicVisible: true,
  },
  multi_user: {
    key: 'multi_user',
    planFeatureKey: null, // no boolean plan flag; gated by users_total limit
    name: 'Team Members',
    description: 'Invite and manage multiple team members',
    category: 'USERS',
    usageMetric: 'users_total',
    upgradeDescription: 'Upgrade to Starter for multiple team members',
    publicVisible: true,
  },
  technician_management: {
    key: 'technician_management',
    planFeatureKey: null, // no boolean plan flag; gated by technicians_total limit
    name: 'Technician Management',
    description: 'Assign and track technician work',
    category: 'TECHNICIANS',
    usageMetric: 'technicians_total',
    upgradeDescription: 'Upgrade to Starter for multiple technicians',
    publicVisible: true,
  },
  priority_support: {
    key: 'priority_support',
    planFeatureKey: 'prioritySupport',
    name: 'Priority Support',
    description: 'Faster response times and dedicated support queue',
    category: 'SUPPORT',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Business for Priority Support',
    publicVisible: true,
  },
  dedicated_account_manager: {
    key: 'dedicated_account_manager',
    planFeatureKey: 'dedicatedAccountManager',
    name: 'Dedicated Account Manager',
    description: 'Personal account manager for onboarding and growth',
    category: 'SUPPORT',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Enterprise for a Dedicated Account Manager',
    publicVisible: true,
  },
  white_label: {
    key: 'white_label',
    planFeatureKey: 'whiteLabel',
    name: 'White Label',
    description: 'Custom branding on customer-facing documents',
    category: 'ADMIN',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Enterprise for White Label options',
    publicVisible: true,
  },
  api_access: {
    key: 'api_access',
    planFeatureKey: 'apiAccess',
    name: 'API Access',
    description: 'Developer API for custom integrations',
    category: 'ADMIN',
    usageMetric: null,
    upgradeDescription: 'Upgrade to Enterprise for API Access',
    publicVisible: true,
  },
};

export function getFeature(key: string): FeatureDefinition | null {
  return FEATURE_REGISTRY[key as FeatureKey] ?? null;
}

export function getFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.category === category);
}
