// SI-12: Sapelee Future Payload Contract
// DO NOT call Sapelee here. This file defines payload shape only.
// Sapelee may later improve wording and strategic reasoning but must never
// replace the deterministic calculations in this module.

import type { ServiceAdvisorContext, EstimateQualityReview, RelatedServiceSuggestion, CustomerExplanation, ApprovalOpportunity } from './types';

export interface SapeleeAdvisorPayload {
  // Sanitized context — no PII, no VIN, no payment data
  shopId: string;
  sessionId: string | null;
  vehicleRef: string | null;   // year/make/model only — no VIN
  jobCardConcern: string | null;
  inspectionSummary: SapeleeInspectionSummary | null;
  estimateSummary: SapeleeEstimateSummary | null;
  qualityFindings: SapeleeQualityFinding[];
  relatedServiceSuggestions: SapeleeRelatedServiceSummary[];
  followUpFactors: string[];
  explanationDraft: string | null;
  dataQualityWarnings: string[];
  requestedEnhancement: 'improve_explanation' | 'suggest_wording' | 'identify_gaps';
  payloadVersion: '1.0';
}

export interface SapeleeInspectionSummary {
  findingCount: number;
  safetyFindingCount: number;
  unquotedFindingCount: number;
}

export interface SapeleeEstimateSummary {
  lineCount: number;
  hasDescription: boolean;
  hasMixedCurrency: boolean;
  qualityScore: number | null;
}

export interface SapeleeQualityFinding {
  ruleKey: string;
  severity: string;
  title: string;
}

export interface SapeleeRelatedServiceSummary {
  suggestionKey: string;
  title: string;
  confidence: number;
  requiresInspection: boolean;
}

export function buildSapeleePayload(
  context: ServiceAdvisorContext,
  qualityReview: EstimateQualityReview | null,
  relatedServices: RelatedServiceSuggestion[],
  explanation: CustomerExplanation | null,
  _opportunity: ApprovalOpportunity | null
): SapeleeAdvisorPayload {
  const vehicle = context.vehicle;
  const vehicleRef = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(' ') || null;

  const inspectionFindings = context.inspection?.findings ?? [];

  return {
    shopId: context.shopId,
    sessionId: context.sessionId,
    vehicleRef,
    jobCardConcern: context.jobCardConcern,
    inspectionSummary: inspectionFindings.length > 0 ? {
      findingCount: inspectionFindings.length,
      safetyFindingCount: inspectionFindings.filter(f => f.isSafety).length,
      unquotedFindingCount: inspectionFindings.filter(f => !f.hasEstimateLine).length,
    } : null,
    estimateSummary: context.estimate ? {
      lineCount: context.estimate.lineCount,
      hasDescription: context.estimate.lines.every(l => l.description && l.description.trim().length > 3),
      hasMixedCurrency: new Set(context.estimate.lines.map(l => l.currency ?? 'USD')).size > 1,
      qualityScore: qualityReview?.qualityScore ?? null,
    } : null,
    qualityFindings: (qualityReview?.issues ?? []).map(i => ({
      ruleKey: i.ruleKey,
      severity: i.severity,
      title: i.title,
    })),
    relatedServiceSuggestions: relatedServices.map(s => ({
      suggestionKey: s.suggestionKey,
      title: s.title,
      confidence: s.confidence,
      requiresInspection: s.requiresInspectionConfirmation,
    })),
    followUpFactors: context.dataQualityWarnings,
    explanationDraft: explanation?.plainLanguageSummary ?? null,
    dataQualityWarnings: context.dataQualityWarnings,
    requestedEnhancement: 'improve_explanation',
    payloadVersion: '1.0',
  };
}

// Excluded from payload (must never be sent to Sapelee):
// - customer.customerId (internal reference only)
// - customer name, phone, email, address
// - VIN
// - invoice amounts, payment data
// - full private notes
// - shop credentials or keys
