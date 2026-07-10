// SI-12: Intelligent Service Advisor — service layer (shop-scoped, mirror-aware)

import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';
import {
  createAdvisorSession,
  generateAdvisorSuggestions,
  getAdvisorSession,
  getAdvisorSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  recordAdvisorOutcome,
  getAdvisorHealth,
  generateCustomerExplanation,
  reviewEstimateById,
} from '@/intelligence/service-advisor/IntelligentServiceAdvisor';
import { findStaleEstimates, findApprovedNotScheduled } from '@/intelligence/service-advisor/EstimateFollowUpEngine';
import type {
  ServiceAdvisorSession,
  ServiceAdvisorSuggestion,
  CustomerExplanation,
  AdvisorBuildResult,
  AdvisorHealthStatus,
  EstimateQualityReview,
  RecordAdvisorOutcomeInput,
} from '@/intelligence/service-advisor/types';

export interface StartAdvisorSessionInput {
  customerId?: string;
  vehicleId?: string;
  jobCardId?: string;
  estimateId?: string;
}

export interface ServiceAdvisorSummary {
  shopId: string;
  openSessions: number;
  staleEstimateCount: number;
  approvedNotScheduledCount: number;
  totalOpenSuggestions: number;
  calculatedAt: string;
}

export async function startAdvisorSession(input: StartAdvisorSessionInput): Promise<AdvisorBuildResult> {
  const shopId = getShopId();
  const { data: { user } } = await supabase.auth.getUser();

  const session = await createAdvisorSession({
    shopId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    jobCardId: input.jobCardId,
    estimateId: input.estimateId,
    createdBy: user?.id,
  });

  return generateAdvisorSuggestions(session.id);
}

export async function refreshAdvisorSession(sessionId: string): Promise<AdvisorBuildResult> {
  return generateAdvisorSuggestions(sessionId);
}

export async function getEstimateAdvisor(estimateId: string): Promise<EstimateQualityReview | null> {
  const shopId = getShopId();
  return reviewEstimateById(estimateId, shopId);
}

export async function getJobCardAdvisor(jobCardId: string): Promise<AdvisorBuildResult | null> {
  try {
    const shopId = getShopId();
    const { data: { user } } = await supabase.auth.getUser();
    const session = await createAdvisorSession({
      shopId,
      jobCardId,
      createdBy: user?.id,
    });
    return generateAdvisorSuggestions(session.id);
  } catch {
    return null;
  }
}

export async function getSessionSuggestions(sessionId: string): Promise<ServiceAdvisorSuggestion[]> {
  return getAdvisorSuggestions(sessionId);
}

export async function getSessionCustomerExplanation(sessionId: string): Promise<CustomerExplanation | null> {
  return generateCustomerExplanation(sessionId);
}

export async function submitAdvisorFeedback(input: RecordAdvisorOutcomeInput): Promise<void> {
  const shopId = getShopId();
  return recordAdvisorOutcome({ ...input, shopId });
}

export async function acceptSessionSuggestion(suggestionId: string): Promise<void> {
  return acceptSuggestion(suggestionId);
}

export async function dismissSessionSuggestion(suggestionId: string): Promise<void> {
  return dismissSuggestion(suggestionId);
}

export async function getServiceAdvisorSummary(): Promise<ServiceAdvisorSummary> {
  const shopId = getShopId();
  const shopIds = getShopIds();

  try {
    const [health, stale, approved] = await Promise.all([
      getAdvisorHealth(shopId),
      findStaleEstimates(shopId).catch(() => []),
      findApprovedNotScheduled(shopId).catch(() => []),
    ]);

    const { count: openSessionCount } = await supabase
      .from('service_advisor_sessions')
      .select('*', { count: 'exact', head: true })
      .in('shop_id', shopIds)
      .in('session_status', ['draft', 'generated', 'reviewed']);

    return {
      shopId,
      openSessions: openSessionCount ?? 0,
      staleEstimateCount: stale.length,
      approvedNotScheduledCount: approved.length,
      totalOpenSuggestions: health.openSuggestionCount,
      calculatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      shopId,
      openSessions: 0,
      staleEstimateCount: 0,
      approvedNotScheduledCount: 0,
      totalOpenSuggestions: 0,
      calculatedAt: new Date().toISOString(),
    };
  }
}

export async function getAdvisorSessionById(sessionId: string): Promise<ServiceAdvisorSession | null> {
  return getAdvisorSession(sessionId);
}

export async function getAdvisorHealthStatus(shopId?: string): Promise<AdvisorHealthStatus> {
  return getAdvisorHealth(shopId ?? getShopId());
}
