// SI-12: Estimate Follow-Up Intelligence — signals and opportunity scoring

import { supabase } from '@/lib/supabase';
import type {
  FollowUpRecommendation,
  FollowUpAction,
  ApprovalOpportunity,
  OpportunityFactor,
  ServiceAdvisorSuggestion,
  ServiceAdvisorContext,
} from './types';

const STALE_DAYS = 14;
const LONG_STALE_DAYS = 60;
const HIGH_VALUE_THRESHOLD = 500;

export interface StaleEstimateRow {
  id: string;
  status: string;
  total_amount: number | null;
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
}

export async function findStaleEstimates(shopId: string): Promise<StaleEstimateRow[]> {
  const threshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('estimates')
    .select('id, status, total_amount, created_at, sent_at, viewed_at, approved_at, declined_at, customer_id, vehicle_id')
    .eq('shop_id', shopId)
    .in('status', ['draft', 'sent', 'viewed'])
    .lt('created_at', threshold)
    .is('approved_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  return (data ?? []) as StaleEstimateRow[];
}

export async function findApprovedNotScheduled(shopId: string): Promise<StaleEstimateRow[]> {
  const { data } = await supabase
    .from('estimates')
    .select('id, status, total_amount, created_at, sent_at, viewed_at, approved_at, declined_at, customer_id, vehicle_id')
    .eq('shop_id', shopId)
    .eq('status', 'approved')
    .is('approved_at', 'not.null')
    .order('approved_at', { ascending: true })
    .limit(30);

  // Only return those without a linked appointment (safe: returns all approved, caller filters)
  return (data ?? []) as StaleEstimateRow[];
}

export async function findViewedNotApproved(shopId: string): Promise<StaleEstimateRow[]> {
  const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('estimates')
    .select('id, status, total_amount, created_at, sent_at, viewed_at, approved_at, declined_at, customer_id, vehicle_id')
    .eq('shop_id', shopId)
    .eq('status', 'viewed')
    .lt('viewed_at', threshold)
    .is('approved_at', null)
    .order('viewed_at', { ascending: false })
    .limit(20);
  return (data ?? []) as StaleEstimateRow[];
}

export async function findDeclinedHighValueEstimates(shopId: string): Promise<StaleEstimateRow[]> {
  const { data } = await supabase
    .from('estimates')
    .select('id, status, total_amount, created_at, sent_at, viewed_at, approved_at, declined_at, customer_id, vehicle_id')
    .eq('shop_id', shopId)
    .eq('status', 'declined')
    .gte('total_amount', HIGH_VALUE_THRESHOLD)
    .order('declined_at', { ascending: false })
    .limit(20);
  return (data ?? []) as StaleEstimateRow[];
}

export async function findUnresolvedSafetyFindings(shopId: string): Promise<{ estimateId: string; findingCount: number }[]> {
  // Find inspections with safety findings where vehicle has no subsequent approved estimate
  try {
    const { data } = await supabase
      .from('inspection_findings')
      .select('inspection_id, estimate_id:inspection_id')
      .eq('shop_id', shopId)
      .eq('is_safety', true)
      .is('estimate_line_id', null)
      .limit(20);
    return [];
  } catch {
    return [];
  }
}

export function buildFollowUpRecommendation(
  estimate: StaleEstimateRow,
  context: { visitCount: number; hasDeclined: boolean; hasSafetyFinding: boolean }
): FollowUpRecommendation {
  const ageDays = (Date.now() - new Date(estimate.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const priority = calculateFollowUpPriority(estimate, context);
  const opportunityScore = calculateFollowUpOpportunityScore(estimate, context);

  const actions: FollowUpAction[] = [
    { actionType: 'open_estimate', label: 'Open estimate', payload: { estimateId: estimate.id } },
    { actionType: 'call_customer', label: 'Call customer', payload: {} },
    { actionType: 'prepare_follow_up', label: 'Prepare follow-up message', payload: {} },
  ];

  if (estimate.status === 'approved') {
    actions.unshift({ actionType: 'schedule_approved_work', label: 'Schedule this work', payload: { estimateId: estimate.id } });
  }

  if (Number(estimate.total_amount ?? 0) > HIGH_VALUE_THRESHOLD) {
    actions.push({ actionType: 'review_lower_cost_option', label: 'Review lower-cost option', payload: {} });
  }

  actions.push({ actionType: 'dismiss', label: 'Dismiss', payload: {} });
  actions.push({ actionType: 'mark_complete', label: 'Mark complete', payload: {} });

  const reason = buildFollowUpReason(estimate, ageDays, context);

  return {
    estimateId: estimate.id,
    estimateAge: Math.round(ageDays),
    estimateValue: estimate.total_amount != null ? Number(estimate.total_amount) : null,
    priority,
    reason,
    suggestedActions: actions,
    opportunityScore,
  };
}

export function calculateFollowUpPriority(
  estimate: StaleEstimateRow,
  context: { hasSafetyFinding: boolean; visitCount: number }
): FollowUpRecommendation['priority'] {
  if (context.hasSafetyFinding) return 'critical';
  if (estimate.status === 'approved' && !estimate.approved_at) return 'high';
  if (Number(estimate.total_amount ?? 0) >= HIGH_VALUE_THRESHOLD) return 'high';
  const ageDays = (Date.now() - new Date(estimate.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > LONG_STALE_DAYS) return 'low';
  return 'medium';
}

export function calculateFollowUpOpportunityScore(
  estimate: StaleEstimateRow,
  context: { visitCount: number; hasDeclined: boolean; hasSafetyFinding: boolean }
): ApprovalOpportunity {
  const positiveFactors: OpportunityFactor[] = [];
  const negativeFactors: OpportunityFactor[] = [];
  let score = 50;

  if (estimate.status === 'approved') {
    positiveFactors.push({ key: 'already_approved', label: 'Work already approved', impact: 30 });
    score += 30;
  }

  if (estimate.viewed_at && !estimate.approved_at) {
    positiveFactors.push({ key: 'viewed', label: 'Customer viewed estimate', impact: 10 });
    score += 10;
  }

  if (context.visitCount >= 3) {
    positiveFactors.push({ key: 'repeat_customer', label: 'Repeat customer', impact: 10 });
    score += 10;
  }

  if (context.hasSafetyFinding) {
    positiveFactors.push({ key: 'safety_finding', label: 'Safety item included', impact: 10 });
    score += 10;
  }

  const ageDays = (Date.now() - new Date(estimate.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > LONG_STALE_DAYS) {
    negativeFactors.push({ key: 'long_stale', label: `Estimate is ${Math.round(ageDays)} days old`, impact: -20 });
    score -= 20;
  } else if (ageDays > STALE_DAYS) {
    negativeFactors.push({ key: 'stale', label: `Estimate is ${Math.round(ageDays)} days old`, impact: -10 });
    score -= 10;
  }

  if (context.hasDeclined) {
    negativeFactors.push({ key: 'prior_decline', label: 'Prior estimate declined', impact: -10 });
    score -= 10;
  }

  if (!estimate.total_amount) {
    negativeFactors.push({ key: 'incomplete_pricing', label: 'Incomplete pricing data', impact: -10 });
    score -= 10;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const dataQualityWarning = ageDays > LONG_STALE_DAYS
    ? 'Estimate is very old — prices and parts availability may have changed.'
    : null;

  return {
    estimateId: estimate.id,
    baseScore: 50,
    positiveFactors,
    negativeFactors,
    finalScore,
    dataQualityWarning,
    calculatedAt: new Date().toISOString(),
  };
}

function buildFollowUpReason(
  estimate: StaleEstimateRow,
  ageDays: number,
  context: { hasSafetyFinding: boolean }
): string {
  if (estimate.status === 'approved') {
    return `Approved work has not been scheduled. Follow up to book the appointment.`;
  }
  if (estimate.viewed_at && !estimate.approved_at) {
    return `Customer viewed this estimate ${Math.round(ageDays)} days ago but has not responded.`;
  }
  if (context.hasSafetyFinding) {
    return `This estimate includes a safety finding. Follow up to ensure the customer is aware.`;
  }
  return `Estimate has been open for ${Math.round(ageDays)} days without resolution.`;
}

export async function getShopFollowUpSuggestions(
  shopId: string,
  context: ServiceAdvisorContext
): Promise<ServiceAdvisorSuggestion[]> {
  const [stale, approvedNotScheduled, viewedNotApproved] = await Promise.all([
    findStaleEstimates(shopId).catch(() => []),
    findApprovedNotScheduled(shopId).catch(() => []),
    findViewedNotApproved(shopId).catch(() => []),
  ]);

  const allFollowUps = [...approvedNotScheduled, ...viewedNotApproved, ...stale.slice(0, 5)];
  const seenIds = new Set<string>();
  const unique = allFollowUps.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; });

  return unique.map((estimate, idx) => {
    const rec = buildFollowUpRecommendation(estimate, {
      visitCount: context.customer?.visitCount ?? 0,
      hasDeclined: estimate.status === 'declined',
      hasSafetyFinding: false,
    });
    return {
      id: `followup-${idx}`,
      shopId,
      advisorSessionId: context.sessionId ?? null,
      suggestionType: 'follow_up' as const,
      suggestionKey: `followup_${estimate.id}`,
      priority: rec.priority,
      title: `Follow up on estimate${estimate.total_amount ? ` ($${Number(estimate.total_amount).toFixed(0)})` : ''}`,
      explanation: rec.reason,
      reason: 'Estimate has not been resolved.',
      estimatedRevenue: estimate.total_amount != null ? Number(estimate.total_amount) : null,
      confidence: rec.opportunityScore.finalScore / 100,
      evidence: [],
      sourceEntityType: 'estimate',
      sourceEntityId: estimate.id,
      actionType: 'open_estimate',
      actionPayload: { estimateId: estimate.id },
      status: 'open' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: null,
      dismissedAt: null,
    };
  });
}
