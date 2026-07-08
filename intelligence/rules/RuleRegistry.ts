// Rule Registry — 10 deterministic recommendation rules.
// No AI. No external calls. Returns null if rule doesn't fire.
import type { RecommendationRule, RecommendationRuleResult, RecommendationContext } from '../recommendations/types';
import { ACTION_TYPES } from '../actions/ActionTypes';

const UNPAID_HIGH_THRESHOLD = 3; // >3 unpaid invoices → high priority
const REVENUE_DIP_THRESHOLD = 0.3; // 30% drop vs yesterday

const unpaidInvoicesRule: RecommendationRule = {
  key: 'unpaid_invoices',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.unpaid_invoice_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'unpaid_invoices',
      category: 'unpaid_invoices',
      priority: count > UNPAID_HIGH_THRESHOLD ? 'high' : 'medium',
      title: `Collect ${count} unpaid invoice${count > 1 ? 's' : ''}`,
      description: `There ${count === 1 ? 'is' : 'are'} ${count} unpaid invoice${count > 1 ? 's' : ''} awaiting payment.`,
      reason: `${count} invoice${count > 1 ? 's' : ''} with status Draft or Sent.`,
      estimatedRevenue: null,
      confidence: 1,
      sourceEntityType: 'invoice',
      sourceEntityId: null,
      actions: [{ label: 'View invoices', actionType: ACTION_TYPES.open_entity, payload: { entity: 'invoices' } }],
      expiresAt: null,
    };
  },
};

const staleEstimatesRule: RecommendationRule = {
  key: 'stale_estimates',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.stale_estimate_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'stale_estimates',
      category: 'estimates',
      priority: 'medium',
      title: `Follow up on ${count} stale estimate${count > 1 ? 's' : ''}`,
      description: `${count} estimate${count > 1 ? 's have' : ' has'} been open for more than 3 days without approval.`,
      reason: `Estimates older than 3 days without approval or decline.`,
      estimatedRevenue: null,
      confidence: 0.8,
      sourceEntityType: 'estimate',
      sourceEntityId: null,
      actions: [{ label: 'View estimates', actionType: ACTION_TYPES.open_entity, payload: { entity: 'estimates' } }],
      expiresAt: null,
    };
  },
};

const approvedEstimateNotScheduledRule: RecommendationRule = {
  key: 'approved_estimate_not_scheduled',
  evaluate(ctx): RecommendationRuleResult | null {
    // Proxy: open estimates > 0 and open jobs == 0 suggests approved work not yet scheduled
    const openJobs = Number(ctx.signals.open_job_count ?? 1);
    const openEst = Number(ctx.signals.open_estimate_count ?? 0);
    if (openEst === 0 || openJobs > 0) return null;
    return {
      recommendationKey: 'approved_estimate_not_scheduled',
      category: 'operations',
      priority: 'medium',
      title: 'Schedule approved work',
      description: 'There are approved estimates with no active repair orders or job cards.',
      reason: 'Approved estimates present with no open job cards.',
      estimatedRevenue: null,
      confidence: 0.6,
      sourceEntityType: 'estimate',
      sourceEntityId: null,
      actions: [{ label: 'Create job card', actionType: ACTION_TYPES.open_entity, payload: { entity: 'job-cards' } }],
      expiresAt: null,
    };
  },
};

const completedJobNotInvoicedRule: RecommendationRule = {
  key: 'completed_job_not_invoiced',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.completed_not_invoiced_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'completed_job_not_invoiced',
      category: 'revenue',
      priority: 'high',
      title: `Create invoice for ${count} completed job${count > 1 ? 's' : ''}`,
      description: `${count} completed job${count > 1 ? 's' : ''} ${count === 1 ? 'has' : 'have'} no invoice.`,
      reason: 'Closed jobs with no linked invoice.',
      estimatedRevenue: null,
      confidence: 1,
      sourceEntityType: 'job_card',
      sourceEntityId: null,
      actions: [{ label: 'Create invoice', actionType: ACTION_TYPES.create_invoice }],
      expiresAt: null,
    };
  },
};

const lowInventoryRule: RecommendationRule = {
  key: 'low_inventory',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.low_inventory_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'low_inventory',
      category: 'inventory',
      priority: count > 5 ? 'high' : 'medium',
      title: `Restock ${count} low-inventory item${count > 1 ? 's' : ''}`,
      description: `${count} part${count > 1 ? 's are' : ' is'} at or near zero stock.`,
      reason: 'Parts with quantity ≤ 1 in inventory.',
      estimatedRevenue: null,
      confidence: 0.9,
      sourceEntityType: 'inventory',
      sourceEntityId: null,
      actions: [{ label: 'Order parts', actionType: ACTION_TYPES.order_parts }],
      expiresAt: null,
    };
  },
};

const stuckRepairOrderRule: RecommendationRule = {
  key: 'stuck_repair_order',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.stuck_job_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'stuck_repair_order',
      category: 'operations',
      priority: count > 2 ? 'high' : 'medium',
      title: `Review ${count} stuck repair order${count > 1 ? 's' : ''}`,
      description: `${count} job card${count > 1 ? 's have' : ' has'} been open for more than 2 days without progress.`,
      reason: 'Job cards older than 2 days without closing.',
      estimatedRevenue: null,
      confidence: 0.8,
      sourceEntityType: 'job_card',
      sourceEntityId: null,
      actions: [{ label: 'Review repair orders', actionType: ACTION_TYPES.review_repair_order }],
      expiresAt: null,
    };
  },
};

const declinedEstimateWinbackRule: RecommendationRule = {
  key: 'declined_estimate_winback',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.declined_estimate_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'declined_estimate_winback',
      category: 'customer_followup',
      priority: 'low',
      title: `Review ${count} declined estimate${count > 1 ? 's' : ''} for win-back`,
      description: `${count} estimate${count > 1 ? 's were' : ' was'} declined. Consider a lower-cost alternative.`,
      reason: 'Declined estimates in system.',
      estimatedRevenue: null,
      confidence: 0.5,
      sourceEntityType: 'estimate',
      sourceEntityId: null,
      actions: [{ label: 'View declined estimates', actionType: ACTION_TYPES.open_entity, payload: { entity: 'estimates', filter: 'Declined' } }],
      expiresAt: null,
    };
  },
};

// Inactive customer rule: signals.inactive_customer_count would come from a future signal
const inactiveCustomerRule: RecommendationRule = {
  key: 'inactive_customers',
  evaluate(ctx): RecommendationRuleResult | null {
    const count = Number(ctx.signals.inactive_customer_count ?? 0);
    if (count === 0) return null;
    return {
      recommendationKey: 'inactive_customers',
      category: 'customer_followup',
      priority: 'low',
      title: `Send maintenance reminder to ${count} inactive customer${count > 1 ? 's' : ''}`,
      description: `${count} customer${count > 1 ? 's' : ''} haven't visited in 6+ months.`,
      reason: 'Customers with no job card or invoice in 180+ days.',
      estimatedRevenue: null,
      confidence: 0.6,
      sourceEntityType: 'customer',
      sourceEntityId: null,
      actions: [{ label: 'Send reminder', actionType: ACTION_TYPES.send_maintenance_reminder }],
      expiresAt: null,
    };
  },
};

const repairIntelligenceMissingRule: RecommendationRule = {
  key: 'repair_intelligence_missing',
  evaluate(ctx): RecommendationRuleResult | null {
    const completed = Number(ctx.signals.completed_not_invoiced_count ?? 0);
    const cases = Number(ctx.signals.repair_cases_created_today ?? 0);
    // Fire if jobs completed today but no repair cases recorded
    if (completed === 0 || cases > 0) return null;
    return {
      recommendationKey: 'repair_intelligence_missing',
      category: 'repair_intelligence',
      priority: 'low',
      title: 'Create repair intelligence case',
      description: 'Completed repairs have no repair intelligence case recorded.',
      reason: 'Completed jobs with no repair case created today.',
      estimatedRevenue: null,
      confidence: 0.5,
      sourceEntityType: 'job_card',
      sourceEntityId: null,
      actions: [{ label: 'Create repair case', actionType: ACTION_TYPES.create_repair_case }],
      expiresAt: null,
    };
  },
};

const revenueDipRule: RecommendationRule = {
  key: 'revenue_dip',
  evaluate(ctx): RecommendationRuleResult | null {
    const today = Number(ctx.signals.revenue_today ?? 0);
    const yesterday = Number(ctx.signals.revenue_yesterday ?? 0);
    if (yesterday === 0) return null;
    const dip = (yesterday - today) / yesterday;
    if (dip < REVENUE_DIP_THRESHOLD) return null;
    const pct = Math.round(dip * 100);
    return {
      recommendationKey: 'revenue_dip',
      category: 'revenue',
      priority: dip > 0.5 ? 'high' : 'medium',
      title: `Revenue is ${pct}% lower than yesterday`,
      description: `Today's revenue is ${pct}% below yesterday. Review job status and unpaid invoices.`,
      reason: `Today: ${today}, Yesterday: ${yesterday} (${pct}% dip).`,
      estimatedRevenue: null,
      confidence: 0.8,
      sourceEntityType: null,
      sourceEntityId: null,
      actions: [{ label: 'View invoices', actionType: ACTION_TYPES.open_entity, payload: { entity: 'invoices' } }],
      expiresAt: null,
    };
  },
};

export const ALL_RULES: RecommendationRule[] = [
  unpaidInvoicesRule,
  staleEstimatesRule,
  approvedEstimateNotScheduledRule,
  completedJobNotInvoicedRule,
  lowInventoryRule,
  stuckRepairOrderRule,
  declinedEstimateWinbackRule,
  inactiveCustomerRule,
  repairIntelligenceMissingRule,
  revenueDipRule,
];
