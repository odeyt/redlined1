// SI-7: Morning Brief — Content Builder
// Converts raw metrics + decision rankings into a structured MorningBrief.
// Deterministic. No AI. No external calls.

import type {
  MorningBrief,
  MorningBriefCashCollection,
  MorningBriefInventorySummary,
  MorningBriefPriority,
  MorningBriefRevenueOpportunity,
  MorningBriefRisk,
  MorningBriefTechnicianSummary,
  MorningBriefYesterdaySummary,
} from './types';
import { determineFocus } from './FocusRules';

type Signals = Record<string, number | null>;

export function buildMorningBrief(
  shopId: string,
  date: string,
  signals: Signals,
  rankedActions: MorningBriefPriority[],
  shopHealthScore: number,
  executiveScore: number,
): Omit<MorningBrief, 'id' | 'createdAt' | 'updatedAt'> {
  const generatedAt = new Date().toISOString();
  const yesterday   = buildYesterdaySummary(signals);
  const revenues    = buildRevenueOpportunities(signals);
  const cash        = buildCashCollection(signals);
  const risks       = buildOperationalRisks(signals);
  const technicians = buildTechnicianSummary(signals);
  const inventory   = buildInventorySummary(signals);
  const focus       = determineFocus(signals);
  const title       = buildTitle(shopHealthScore, signals);
  const summary     = buildSummary(signals, rankedActions.length);

  return {
    shopId,
    briefDate:             date,
    status:                'generated',
    shopHealthScore,
    executiveScore,
    title,
    summary,
    yesterdaySummary:      yesterday,
    todayPriorities:       rankedActions.slice(0, 5),
    revenueOpportunities:  revenues,
    cashCollection:        cash,
    operationalRisks:      risks,
    technicianSummary:     technicians,
    inventorySummary:      inventory,
    recommendedFocus:      focus,
    metadata:              { signalKeys: Object.keys(signals).length, builtAt: generatedAt },
    generatedAt,
  };
}

// ── Section builders ──────────────────────────────────────────

function buildYesterdaySummary(sig: Signals): MorningBriefYesterdaySummary {
  return {
    revenueYesterday:    sig.revenue_yesterday         ?? 0,
    paymentsYesterday:   sig.payments_yesterday        ?? 0,
    jobsCompleted:       sig.completed_jobs_yesterday  ?? sig.completed_jobs_today ?? 0,
    repairCasesCreated:  sig.repair_cases_created_today ?? 0,
    invoicesCreated:     sig.invoices_created_yesterday ?? 0,
  };
}

function buildRevenueOpportunities(sig: Signals): MorningBriefRevenueOpportunity[] {
  const ops: MorningBriefRevenueOpportunity[] = [];

  const staleCount = sig.stale_estimate_count ?? 0;
  if (staleCount > 0) {
    ops.push({
      key:     'stale_estimates',
      label:   'Stale estimates',
      count:   staleCount,
      total:   sig.stale_estimate_total ?? null,
      module:  'estimates',
      urgency: staleCount > 5 ? 'high' : 'medium',
    });
  }

  const approvedNotSched = sig.approved_not_scheduled_count ?? 0;
  if (approvedNotSched > 0) {
    ops.push({
      key:     'approved_not_scheduled',
      label:   'Approved estimates not scheduled',
      count:   approvedNotSched,
      total:   null,
      module:  'estimates',
      urgency: 'high',
    });
  }

  const completedNotInvoiced = sig.completed_not_invoiced_count ?? 0;
  if (completedNotInvoiced > 0) {
    ops.push({
      key:     'completed_not_invoiced',
      label:   'Completed jobs not yet invoiced',
      count:   completedNotInvoiced,
      total:   null,
      module:  'job-cards',
      urgency: 'high',
    });
  }

  const unpaidCount = sig.unpaid_invoice_count ?? 0;
  if (unpaidCount > 0) {
    ops.push({
      key:     'unpaid_invoices',
      label:   'Unpaid invoices',
      count:   unpaidCount,
      total:   sig.unpaid_invoice_total ?? null,
      module:  'invoices',
      urgency: unpaidCount > 3 ? 'high' : 'medium',
    });
  }

  return ops;
}

function buildCashCollection(sig: Signals): MorningBriefCashCollection {
  const overdueTotal = sig.overdue_invoice_total  ?? 0;
  const unpaidTotal  = sig.unpaid_invoice_total   ?? 0;
  let urgency: MorningBriefCashCollection['collectionUrgency'] = 'low';
  if (overdueTotal > 2000)       urgency = 'critical';
  else if (overdueTotal > 500)   urgency = 'high';
  else if (unpaidTotal > 1000)   urgency = 'medium';

  return {
    unpaidCount:       sig.unpaid_invoice_count  ?? 0,
    unpaidTotal,
    overdueCount:      sig.overdue_invoice_count ?? 0,
    overdueTotal,
    collectionUrgency: urgency,
  };
}

function buildOperationalRisks(sig: Signals): MorningBriefRisk[] {
  const risks: MorningBriefRisk[] = [];

  const stuck = sig.stuck_job_count ?? 0;
  if (stuck > 0) {
    risks.push({
      key:      'stuck_repair_orders',
      label:    'Stuck repair orders',
      count:    stuck,
      detail:   stuck > 3 ? 'Multiple orders blocked — investigate immediately' : null,
      module:   'repair-orders',
      severity: stuck > 3 ? 'critical' : 'high',
    });
  }

  const lowInv = sig.low_inventory_count ?? 0;
  if (lowInv > 0) {
    risks.push({
      key:      'low_inventory',
      label:    'Low inventory items',
      count:    lowInv,
      detail:   lowInv > 10 ? 'Significant stock shortage' : null,
      module:   'parts',
      severity: lowInv > 10 ? 'high' : 'medium',
    });
  }

  const overdue = sig.overdue_invoice_count ?? 0;
  if (overdue > 0) {
    risks.push({
      key:      'overdue_invoices',
      label:    'Overdue invoices',
      count:    overdue,
      detail:   null,
      module:   'invoices',
      severity: overdue > 5 ? 'critical' : 'high',
    });
  }

  const openJobs = sig.open_job_count ?? 0;
  if (openJobs > 10) {
    risks.push({
      key:      'high_job_volume',
      label:    'High open job volume',
      count:    openJobs,
      detail:   'Shop may be at capacity',
      module:   'job-cards',
      severity: 'medium',
    });
  }

  const repairCases = sig.repair_cases_created_today ?? 0;
  if (repairCases === 0 && openJobs > 0) {
    risks.push({
      key:      'missing_repair_intelligence',
      label:    'No repair cases logged today',
      count:    0,
      detail:   'Repair knowledge is not being captured',
      module:   'repair-intelligence',
      severity: 'low',
    });
  }

  return risks;
}

function buildTechnicianSummary(sig: Signals): MorningBriefTechnicianSummary {
  const active = sig.technician_active_count ?? 0;
  const idle   = sig.technician_idle_count   ?? 0;
  const bottlenecks: string[] = [];

  if (idle > 0 && (sig.open_job_count ?? 0) > 0)
    bottlenecks.push(`${idle} technician${idle > 1 ? 's' : ''} idle with open jobs`);

  return {
    activeCount:   active,
    idleCount:     idle,
    totalAssigned: active + idle,
    bottlenecks,
  };
}

function buildInventorySummary(sig: Signals): MorningBriefInventorySummary {
  const lowCount = sig.low_inventory_count ?? 0;
  let urgency: MorningBriefInventorySummary['reorderUrgency'] = 'low';
  if (lowCount > 20)       urgency = 'critical';
  else if (lowCount > 10)  urgency = 'high';
  else if (lowCount > 3)   urgency = 'medium';

  return {
    lowCount,
    criticalParts:  [],  // future: query parts by name
    reorderUrgency: urgency,
  };
}

function buildTitle(healthScore: number, sig: Signals): string {
  if (healthScore >= 80) return 'Good morning — your shop is in good shape today.';
  if (healthScore >= 55) return 'Good morning — a few areas need your attention today.';
  const overdueTotal = sig.overdue_invoice_total ?? 0;
  if (overdueTotal > 1000) return 'Good morning — cash collection is the top priority today.';
  return 'Good morning — your shop needs attention in several areas today.';
}

function buildSummary(sig: Signals, priorityCount: number): string {
  const parts: string[] = [];
  const unpaid  = sig.unpaid_invoice_count  ?? 0;
  const stuck   = sig.stuck_job_count       ?? 0;
  const lowInv  = sig.low_inventory_count   ?? 0;
  const notInv  = sig.completed_not_invoiced_count ?? 0;

  if (notInv > 0)   parts.push(`${notInv} completed job${notInv > 1 ? 's' : ''} to invoice`);
  if (unpaid > 0)   parts.push(`${unpaid} unpaid invoice${unpaid > 1 ? 's' : ''}`);
  if (stuck > 0)    parts.push(`${stuck} stuck order${stuck > 1 ? 's' : ''}`);
  if (lowInv > 0)   parts.push(`${lowInv} low inventory item${lowInv > 1 ? 's' : ''}`);

  if (parts.length === 0) return 'No urgent issues. Focus on quality and customer follow-up.';
  if (priorityCount > 0)
    return `You have ${parts.join(', ')}. Your top ${Math.min(priorityCount, 5)} priorities are ranked below.`;
  return `You have ${parts.join(', ')}.`;
}
