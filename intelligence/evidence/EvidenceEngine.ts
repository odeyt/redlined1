// SI-5: Evidence Engine
// Deterministic. No AI. No external calls. Never crashes Command Center.

import type {
  RecommendationEvidence, EvidenceBundle, DecisionExplanation,
  RecordOutcomeInput, RecommendationOutcome, OutcomeStatus,
} from './types';
import { calculateConfidenceFromEvidence, calculateEvidenceScore } from './ConfidenceScorer';
import {
  buildUnpaidInvoicesEvidence, buildStaleEstimatesEvidence,
  buildApprovedNotScheduledEvidence, buildCompletedNotInvoicedEvidence,
  buildLowInventoryEvidence, buildStuckRepairOrderEvidence,
  buildDeclinedEstimateEvidence, buildInactiveCustomerEvidence,
  buildRepairIntelligenceMissingEvidence, buildRevenueDipEvidence,
} from './builders';
import type { Recommendation } from '../recommendations/types';

type SignalMap = Record<string, number | string | null>;

// ─────────────────────────────────────────────────────────────────────────────
// Evidence dispatch — routes recommendation_key → builder
// ─────────────────────────────────────────────────────────────────────────────
async function dispatchBuilder(
  rec: Pick<Recommendation, 'recommendationKey'>,
  shopId: string,
  shopIds: string[],
  signals: SignalMap,
): Promise<RecommendationEvidence[]> {
  try {
    switch (rec.recommendationKey) {
      case 'unpaid_invoices':              return buildUnpaidInvoicesEvidence(shopId, shopIds);
      case 'stale_estimates':              return buildStaleEstimatesEvidence(shopId, shopIds);
      case 'approved_estimate_not_scheduled': return buildApprovedNotScheduledEvidence(shopId, shopIds);
      case 'completed_job_not_invoiced':   return buildCompletedNotInvoicedEvidence(shopId, shopIds);
      case 'low_inventory':                return buildLowInventoryEvidence(shopId, shopIds);
      case 'stuck_repair_order':           return buildStuckRepairOrderEvidence(shopId, shopIds);
      case 'declined_estimate_winback':    return buildDeclinedEstimateEvidence(shopId, shopIds);
      case 'inactive_customers':           return buildInactiveCustomerEvidence(shopId, shopIds);
      case 'repair_intelligence_missing':  return buildRepairIntelligenceMissingEvidence(shopId, shopIds);
      case 'revenue_dip':                  return buildRevenueDipEvidence(shopId, shopIds, signals);
      default:                             return [];
    }
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build explanation text from recommendation + evidence
// ─────────────────────────────────────────────────────────────────────────────
function buildExplanation(
  rec: Pick<Recommendation, 'recommendationKey' | 'title' | 'reason' | 'category' | 'estimatedRevenue'>,
  items: RecommendationEvidence[],
): DecisionExplanation {
  const count = items.length;
  const hasAmounts = items.some(i => i.evidenceNumeric != null && i.evidenceNumeric > 0);

  const evidenceSummary = items
    .filter(i => i.evidenceValue || i.evidenceNumeric != null)
    .map(i => i.evidenceValue ? `${i.evidenceTitle}: ${i.evidenceValue}` : `${i.evidenceTitle}: ${i.evidenceNumeric}`);

  const CATEGORY_WHY: Record<string, string> = {
    unpaid_invoices:     'Unpaid invoices directly reduce available cash. Prompt follow-up shortens payment cycles.',
    estimates:           'Stale estimates represent work the customer has not yet committed to. Follow-up increases conversion.',
    revenue:             'Revenue gaps compound quickly. Addressing uninvoiced work or dips recovers cash without new customers.',
    operations:          'Stuck or unscheduled work blocks throughput and delays revenue recognition.',
    inventory:           'Out-of-stock parts cause job delays, technician downtime, and customer dissatisfaction.',
    customer_followup:   'Inactive customers are often receptive to maintenance reminders. Re-engagement cost is low.',
    repair_intelligence: 'Recording repair cases builds institutional knowledge that reduces diagnostic time on future similar jobs.',
    risk:                'Unresolved risks escalate over time. Early action reduces cost and severity.',
    technician:          'Technician bottlenecks limit total shop throughput and revenue capacity.',
    growth:              'Growth opportunities identified from current data patterns.',
    system:              'System health issue detected.',
  };

  const suggestedActions: string[] = [];
  switch (rec.recommendationKey) {
    case 'unpaid_invoices':              suggestedActions.push('Open Invoices → filter by Unpaid', 'Contact customer directly'); break;
    case 'stale_estimates':              suggestedActions.push('Open Estimates → review Draft status', 'Follow up with customer'); break;
    case 'approved_estimate_not_scheduled': suggestedActions.push('Create Job Card from approved estimate'); break;
    case 'completed_job_not_invoiced':   suggestedActions.push('Open Job Cards → create invoice'); break;
    case 'low_inventory':                suggestedActions.push('Open Parts → review low stock', 'Create parts order'); break;
    case 'stuck_repair_order':           suggestedActions.push('Open Job Cards → review in-progress jobs', 'Reassign technician if needed'); break;
    case 'declined_estimate_winback':    suggestedActions.push('Open Estimates → review Declined', 'Offer alternative package'); break;
    case 'inactive_customers':           suggestedActions.push('Open Customers → filter by last visit date', 'Send maintenance reminder'); break;
    case 'repair_intelligence_missing':  suggestedActions.push('Open Repair Cases → create case for completed jobs'); break;
    case 'revenue_dip':                  suggestedActions.push('Review unpaid invoices', 'Check job card pipeline'); break;
  }

  const revenueText = rec.estimatedRevenue && rec.estimatedRevenue > 0
    ? `Recovering this could realize up to $${rec.estimatedRevenue.toFixed(0)} in revenue.`
    : 'Addressing this reduces operational risk and maintains shop throughput.';

  return {
    summary: rec.title,
    whyItMatters: CATEGORY_WHY[rec.category ?? ''] ?? 'Addressing this improves shop performance.',
    evidenceSummary: count > 0 ? evidenceSummary : ['Limited data available — based on current signal readings.'],
    suggestedActions,
    expectedImpact: revenueText,
    dataFreshness: hasAmounts ? 'live' : 'recent',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function buildEvidenceForRecommendation(
  rec: Recommendation,
  shopId: string,
  shopIds: string[],
  signals: SignalMap = {},
): Promise<EvidenceBundle> {
  const items = await dispatchBuilder(rec, shopId, shopIds, signals);
  const recId = rec.id ?? rec.recommendationKey;
  const score = calculateEvidenceScore(items);
  const confidence = calculateConfidenceFromEvidence(items);
  const explanation = buildExplanation(rec, items);

  return {
    recommendationId: recId,
    recommendationKey: rec.recommendationKey,
    items,
    score,
    confidence,
    explanation,
  };
}

export async function saveEvidenceBundle(
  recommendationId: string,
  shopId: string,
  items: RecommendationEvidence[],
): Promise<void> {
  if (items.length === 0) return;
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    // Delete old evidence for this recommendation before inserting fresh
    await db.from('recommendation_evidence').delete().eq('recommendation_id', recommendationId).eq('shop_id', shopId);
    await db.from('recommendation_evidence').insert(
      items.map(i => ({
        shop_id:            shopId,
        recommendation_id:  recommendationId,
        evidence_type:      i.evidenceType,
        evidence_title:     i.evidenceTitle,
        evidence_value:     i.evidenceValue ?? null,
        evidence_numeric:   i.evidenceNumeric ?? null,
        source_entity_type: i.sourceEntityType ?? null,
        source_entity_id:   i.sourceEntityId ?? null,
        weight:             i.weight ?? 1,
        confidence:         i.confidence ?? 0,
        metadata:           i.metadata ?? {},
      }))
    );
  } catch { /* fire-and-forget — never crash caller */ }
}

export async function getEvidenceForRecommendation(
  recommendationId: string,
  shopId: string,
): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('recommendation_evidence')
      .select('*')
      .eq('recommendation_id', recommendationId)
      .eq('shop_id', shopId)
      .order('weight', { ascending: false });
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id:                r.id as string,
      shopId:            r.shop_id as string,
      recommendationId:  r.recommendation_id as string,
      evidenceType:      r.evidence_type as import('./types').EvidenceType,
      evidenceTitle:     r.evidence_title as string,
      evidenceValue:     r.evidence_value as string | null,
      evidenceNumeric:   r.evidence_numeric as number | null,
      sourceEntityType:  r.source_entity_type as string | null,
      sourceEntityId:    r.source_entity_id as string | null,
      weight:            Number(r.weight ?? 1),
      confidence:        Number(r.confidence ?? 0),
      metadata:          (r.metadata as Record<string, unknown>) ?? {},
      createdAt:         r.created_at as string,
    }));
  } catch { return []; }
}

export async function recordRecommendationOutcome(input: RecordOutcomeInput): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      shop_id:           input.shopId,
      recommendation_id: input.recommendationId,
      outcome_status:    input.outcomeStatus,
      updated_at:        now,
      metadata:          {},
    };

    if (input.outcomeStatus === 'completed') {
      patch.completed_by = input.userId ?? null;
      patch.completed_at = now;
      if (input.revenueRealized != null) patch.revenue_realized = input.revenueRealized;
    }
    if (input.outcomeStatus === 'dismissed') {
      patch.dismissed_by = input.userId ?? null;
      patch.dismissed_at = now;
    }
    if (input.notes) patch.notes = input.notes;

    await db
      .from('recommendation_outcomes')
      .upsert(patch, { onConflict: 'recommendation_id' })
      .eq('shop_id', input.shopId);
  } catch { /* fire-and-forget */ }
}

export { calculateEvidenceScore, calculateConfidenceFromEvidence };
