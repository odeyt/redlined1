// SI-4: Live Intelligence Pipeline — Metrics types.
// No AI. Deterministic only.

export type MetricHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface ShopIntelligenceMetrics {
  id?: string;
  shopId: string;
  metricDate: string;

  // Revenue
  revenueToday: number;
  revenueYesterday: number;
  paymentsToday: number;

  // Invoices
  unpaidInvoiceCount: number;
  unpaidInvoiceTotal: number;
  overdueInvoiceCount: number;
  overdueInvoiceTotal: number;

  // Estimates
  openEstimateCount: number;
  staleEstimateCount: number;
  staleEstimateTotal: number;
  declinedEstimateCount: number;
  approvedNotScheduledCount: number;

  // Jobs
  completedNotInvoicedCount: number;
  openJobCount: number;
  stuckJobCount: number;
  repairOrdersInProgress: number;
  completedJobsToday: number;

  // Repair Intelligence
  repairCasesToday: number;

  // Inventory
  lowInventoryCount: number;

  // Technicians
  technicianActiveCount: number;
  technicianIdleCount: number;

  // Derived
  shopHealthScore: number;
  revenueOpportunityTotal: number;
  riskCount: number;
  recommendationCount: number;

  metadata: Record<string, unknown>;
  calculatedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetricCalculationContext {
  shopId: string;
  now: Date;
  todayStart: string;
  yesterdayStart: string;
  yesterdayEnd: string;
  staleThresholdDays: number;
  stuckThresholdDays: number;
  /**
   * The shop's display currency (shop_settings.default_currency). Money totals
   * count only amounts in this currency: the Command Center formats every total
   * in it, and adding THB to USD would produce a number that is neither.
   * Defaults to DEFAULT_CURRENCY when unset.
   */
  currency?: string;
}

export interface MetricCalculationResult {
  metrics: ShopIntelligenceMetrics;
  warnings: string[];
  errors: string[];
  durationMs: number;
}
