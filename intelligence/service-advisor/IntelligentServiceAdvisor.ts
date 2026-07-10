// SI-12: Intelligent Service Advisor — orchestrator

import { supabase } from '@/lib/supabase';
import { buildAdvisorContext, type AdvisorContextInput } from './AdvisorContextBuilder';
import { reviewEstimate, buildQualitySuggestions } from './EstimateQualityEngine';
import { findRelatedServices, toServiceAdvisorSuggestions } from './RelatedServiceEngine';
import { buildCustomerExplanation } from './CustomerExplanationBuilder';
import { getShopFollowUpSuggestions } from './EstimateFollowUpEngine';
import type {
  ServiceAdvisorSession,
  ServiceAdvisorSuggestion,
  AdvisorBuildResult,
  AdvisorHealthStatus,
  CreateAdvisorSessionInput,
  RecordAdvisorOutcomeInput,
  EstimateQualityReview,
} from './types';

// ── Session Management ────────────────────────────────────────────────────────

export async function createAdvisorSession(input: CreateAdvisorSessionInput): Promise<ServiceAdvisorSession> {
  const { data, error } = await supabase
    .from('service_advisor_sessions')
    .insert({
      shop_id: input.shopId,
      customer_id: input.customerId ?? null,
      vehicle_id: input.vehicleId ?? null,
      job_card_id: input.jobCardId ?? null,
      estimate_id: input.estimateId ?? null,
      session_status: 'draft',
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapSession(data);
}

export async function getAdvisorSession(sessionId: string): Promise<ServiceAdvisorSession | null> {
  const { data } = await supabase
    .from('service_advisor_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  return data ? mapSession(data) : null;
}

export async function getAdvisorSuggestions(sessionId: string): Promise<ServiceAdvisorSuggestion[]> {
  const { data } = await supabase
    .from('service_advisor_suggestions')
    .select('*')
    .eq('advisor_session_id', sessionId)
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  return (data ?? []).map(mapSuggestion);
}

export async function generateAdvisorSuggestions(sessionId: string): Promise<AdvisorBuildResult> {
  const session = await getAdvisorSession(sessionId);
  if (!session) throw new Error('advisor_session_not_found');

  const contextInput: AdvisorContextInput = {
    shopId: session.shopId,
    sessionId,
    customerId: session.customerId ?? undefined,
    vehicleId: session.vehicleId ?? undefined,
    jobCardId: session.jobCardId ?? undefined,
    estimateId: session.estimateId ?? undefined,
  };

  const context = await buildAdvisorContext(session.shopId, contextInput);
  const engineErrors: string[] = [];
  let qualityReview: EstimateQualityReview | null = null;
  const allSuggestions: ServiceAdvisorSuggestion[] = [];

  // 1. Estimate quality review
  if (session.estimateId) {
    try {
      qualityReview = await reviewEstimate(session.estimateId, context);
      allSuggestions.push(...buildQualitySuggestions(context, qualityReview));
    } catch (e) {
      engineErrors.push(`estimate_quality: ${String(e)}`);
    }
  }

  // 2. Related services
  try {
    const relatedServices = findRelatedServices(context);
    allSuggestions.push(...toServiceAdvisorSuggestions(relatedServices, context));
  } catch (e) {
    engineErrors.push(`related_services: ${String(e)}`);
  }

  // 3. Follow-up
  let followUpRecs: ServiceAdvisorSuggestion[] = [];
  try {
    followUpRecs = await getShopFollowUpSuggestions(session.shopId, context);
    allSuggestions.push(...followUpRecs);
  } catch (e) {
    engineErrors.push(`follow_up: ${String(e)}`);
  }

  // 4. Customer explanation
  let customerExplanation = null;
  try {
    customerExplanation = await buildCustomerExplanation(context);
  } catch (e) {
    engineErrors.push(`customer_explanation: ${String(e)}`);
  }

  // Store suggestions in DB (fire-and-forget)
  if (allSuggestions.length > 0) {
    void supabase
      .from('service_advisor_suggestions')
      .insert(
        allSuggestions.map(s => ({
          shop_id: session.shopId,
          advisor_session_id: sessionId,
          suggestion_type: s.suggestionType,
          suggestion_key: s.suggestionKey,
          priority: s.priority,
          title: s.title,
          explanation: s.explanation,
          reason: s.reason,
          estimated_revenue: s.estimatedRevenue,
          confidence: s.confidence,
          evidence: s.evidence,
          source_entity_type: s.sourceEntityType,
          source_entity_id: s.sourceEntityId,
          action_type: s.actionType,
          action_payload: s.actionPayload,
          status: 'open',
        }))
      );
  }

  // Update session status
  const qualityScore = qualityReview?.qualityScore ?? null;
  void supabase
    .from('service_advisor_sessions')
    .update({
      session_status: 'generated',
      estimate_quality_score: qualityScore,
      context_snapshot: context,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  const updatedSession = await getAdvisorSession(sessionId) ?? session;

  return {
    session: updatedSession,
    qualityReview,
    suggestions: allSuggestions,
    customerExplanation,
    followUpRecommendations: [],
    dataQualityWarnings: context.dataQualityWarnings,
    engineErrors,
    builtAt: new Date().toISOString(),
  };
}

export async function reviewEstimateById(estimateId: string, shopId: string): Promise<EstimateQualityReview | null> {
  try {
    const contextInput: AdvisorContextInput = { shopId, estimateId };
    const context = await buildAdvisorContext(shopId, contextInput);
    return await reviewEstimate(estimateId, context);
  } catch {
    return null;
  }
}

export async function generateCustomerExplanation(sessionId: string) {
  const session = await getAdvisorSession(sessionId);
  if (!session) return null;

  const context = await buildAdvisorContext(session.shopId, {
    shopId: session.shopId,
    sessionId,
    customerId: session.customerId ?? undefined,
    vehicleId: session.vehicleId ?? undefined,
    jobCardId: session.jobCardId ?? undefined,
    estimateId: session.estimateId ?? undefined,
  });

  return buildCustomerExplanation(context);
}

export async function acceptSuggestion(suggestionId: string): Promise<void> {
  await supabase
    .from('service_advisor_suggestions')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', suggestionId);
}

export async function dismissSuggestion(suggestionId: string): Promise<void> {
  await supabase
    .from('service_advisor_suggestions')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', suggestionId);
}

export async function recordAdvisorOutcome(input: RecordAdvisorOutcomeInput): Promise<void> {
  await supabase.from('service_advisor_outcomes').insert({
    shop_id: input.shopId,
    advisor_session_id: input.advisorSessionId ?? null,
    estimate_id: input.estimateId ?? null,
    suggestion_id: input.suggestionId ?? null,
    outcome_type: input.outcomeType,
    accepted: input.accepted ?? null,
    estimate_approved: input.estimateApproved ?? null,
    realized_revenue: input.realizedRevenue ?? null,
    customer_response: input.customerResponse ?? null,
    recorded_by: input.recordedBy ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function getAdvisorHealth(shopId: string): Promise<AdvisorHealthStatus> {
  try {
    const [{ count: sessionCount }, { count: openCount }, { count: acceptedCount }, { count: dismissedCount }] =
      await Promise.all([
        supabase.from('service_advisor_sessions').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
        supabase.from('service_advisor_suggestions').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'open'),
        supabase.from('service_advisor_suggestions').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'accepted'),
        supabase.from('service_advisor_suggestions').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('status', 'dismissed'),
      ]);

    return {
      healthy: true,
      sessionCount: sessionCount ?? 0,
      openSuggestionCount: openCount ?? 0,
      acceptedSuggestionCount: acceptedCount ?? 0,
      dismissedSuggestionCount: dismissedCount ?? 0,
      engineErrors: [],
      lastCalculatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      healthy: false,
      sessionCount: 0,
      openSuggestionCount: 0,
      acceptedSuggestionCount: 0,
      dismissedSuggestionCount: 0,
      engineErrors: [String(e)],
      lastCalculatedAt: null,
    };
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapSession(row: Record<string, unknown>): ServiceAdvisorSession {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : null,
    jobCardId: row.job_card_id ? String(row.job_card_id) : null,
    estimateId: row.estimate_id ? String(row.estimate_id) : null,
    sessionStatus: String(row.session_status ?? 'draft') as ServiceAdvisorSession['sessionStatus'],
    contextSnapshot: (row.context_snapshot as ServiceAdvisorSession['contextSnapshot']) ?? null,
    estimateQualityScore: row.estimate_quality_score != null ? Number(row.estimate_quality_score) : null,
    approvalOpportunityScore: row.approval_opportunity_score != null ? Number(row.approval_opportunity_score) : null,
    advisorSummary: row.advisor_summary ? String(row.advisor_summary) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapSuggestion(row: Record<string, unknown>): ServiceAdvisorSuggestion {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    advisorSessionId: row.advisor_session_id ? String(row.advisor_session_id) : null,
    suggestionType: String(row.suggestion_type) as ServiceAdvisorSuggestion['suggestionType'],
    suggestionKey: String(row.suggestion_key),
    priority: String(row.priority ?? 'medium') as ServiceAdvisorSuggestion['priority'],
    title: String(row.title),
    explanation: row.explanation ? String(row.explanation) : null,
    reason: row.reason ? String(row.reason) : null,
    estimatedRevenue: row.estimated_revenue != null ? Number(row.estimated_revenue) : null,
    confidence: Number(row.confidence ?? 0),
    evidence: (row.evidence as ServiceAdvisorSuggestion['evidence']) ?? [],
    sourceEntityType: row.source_entity_type ? String(row.source_entity_type) : null,
    sourceEntityId: row.source_entity_id ? String(row.source_entity_id) : null,
    actionType: row.action_type ? String(row.action_type) : null,
    actionPayload: (row.action_payload as Record<string, unknown>) ?? {},
    status: String(row.status ?? 'open') as ServiceAdvisorSuggestion['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
  };
}
