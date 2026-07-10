// SI-12: Ethical Related-Service Engine — evidence-backed only, no fabrication

import type {
  ServiceAdvisorContext,
  RelatedServiceSuggestion,
  ServiceAdvisorSuggestion,
  AdvisorEvidence,
} from './types';

const DISCLAIMER = 'Requires technician inspection and verification before quoting. This is a review suggestion, not a confirmed recommendation.';

export function findRelatedServices(context: ServiceAdvisorContext): RelatedServiceSuggestion[] {
  const suggestions: RelatedServiceSuggestion[] = [];

  suggestions.push(...findPreviouslyDeclinedWork(context));
  suggestions.push(...findInspectionRelatedItems(context));
  suggestions.push(...findRepairBundlePatterns(context));
  suggestions.push(...findRequiredSupportingServices(context));

  return deduplicateSuggestions(suggestions);
}

export function findPreviouslyDeclinedWork(context: ServiceAdvisorContext): RelatedServiceSuggestion[] {
  const declined = context.customer?.priorDeclinedItems ?? [];
  if (declined.length === 0) return [];

  return declined
    .filter(d => d.description && d.description.trim().length > 0)
    .map(d => {
      const evidence: AdvisorEvidence[] = [{
        source: 'prior_declined_estimate',
        sourceType: 'declined_work',
        description: `Previously declined on ${d.declinedDate ?? 'unknown date'}: ${d.description}`,
        date: d.declinedDate ?? undefined,
        confidence: 0.85,
      }];

      return {
        suggestionKey: `declined_${slugify(d.description)}`,
        title: `Previously declined work: ${d.description}`,
        relevanceReason: `This service was declined during a prior visit${d.declinedDate ? ` on ${d.declinedDate}` : ''}. The concern may still apply.`,
        evidence,
        confidence: 0.8,
        estimatedRevenue: d.estimatedValue,
        requiresInspectionConfirmation: true,
        disclaimer: DISCLAIMER,
      };
    });
}

export function findInspectionRelatedItems(context: ServiceAdvisorContext): RelatedServiceSuggestion[] {
  const findings = context.inspection?.findings ?? [];
  if (findings.length === 0) return [];

  const unquotedSafety = findings.filter(f => f.isSafety && !f.hasEstimateLine);
  const unquotedGeneral = findings.filter(f => !f.isSafety && !f.hasEstimateLine);

  const suggestions: RelatedServiceSuggestion[] = [];

  for (const f of unquotedSafety) {
    suggestions.push({
      suggestionKey: `safety_finding_${f.id}`,
      title: `Safety item not yet quoted: ${f.name}`,
      relevanceReason: `Inspection finding "${f.name}" was marked as a safety concern but is not on the current estimate.`,
      evidence: [{
        source: 'inspection_finding',
        sourceType: 'inspection',
        entityId: f.id,
        entityType: 'inspection_finding',
        description: `Safety finding: ${f.name} — ${f.condition ?? 'condition not specified'}`,
        confidence: 0.95,
      }],
      confidence: 0.9,
      estimatedRevenue: null,
      requiresInspectionConfirmation: false,
      disclaimer: DISCLAIMER,
    });
  }

  for (const f of unquotedGeneral.slice(0, 3)) {
    suggestions.push({
      suggestionKey: `inspection_finding_${f.id}`,
      title: `Unquoted inspection finding: ${f.name}`,
      relevanceReason: `Inspection finding "${f.name}" (${f.category}) was recorded but is not on the current estimate.`,
      evidence: [{
        source: 'inspection_finding',
        sourceType: 'inspection',
        entityId: f.id,
        entityType: 'inspection_finding',
        description: `Finding: ${f.name} — ${f.condition ?? 'condition not specified'}`,
        confidence: 0.85,
      }],
      confidence: 0.75,
      estimatedRevenue: null,
      requiresInspectionConfirmation: true,
      disclaimer: DISCLAIMER,
    });
  }

  return suggestions;
}

export function findRepairBundlePatterns(context: ServiceAdvisorContext): RelatedServiceSuggestion[] {
  const lines = context.estimate?.lines ?? [];
  const signals = context.vehicle?.vehicleIntelligenceSignals ?? [];
  const suggestions: RelatedServiceSuggestion[] = [];

  const hasLowerControlArm = lines.some(l => /control arm|lower arm/i.test(l.description ?? ''));
  const hasTieRod = lines.some(l => /tie rod/i.test(l.description ?? ''));
  const hasStrut = lines.some(l => /strut|shock/i.test(l.description ?? ''));

  if ((hasLowerControlArm || hasTieRod || hasStrut) && !lines.some(l => /align/i.test(l.description ?? ''))) {
    suggestions.push({
      suggestionKey: 'alignment_after_suspension',
      title: 'Alignment review after suspension work',
      relevanceReason: 'Alignment is typically recommended when suspension or steering components are replaced.',
      evidence: [{
        source: 'repair_bundle_pattern',
        sourceType: 'internal',
        description: 'Standard repair procedure: wheel alignment after suspension/steering component replacement.',
        confidence: 0.85,
      }],
      confidence: 0.8,
      estimatedRevenue: null,
      requiresInspectionConfirmation: true,
      disclaimer: DISCLAIMER,
    });
  }

  const hasCoolantRepair = lines.some(l => /coolant|radiator|thermostat|water pump/i.test(l.description ?? ''));
  if (hasCoolantRepair && !lines.some(l => /flush|cooling system/i.test(l.description ?? ''))) {
    const overheatHistory = signals.some(s => /overheat|coolant/i.test(s.description));
    if (overheatHistory) {
      suggestions.push({
        suggestionKey: 'coolant_system_inspection',
        title: 'Cooling system inspection',
        relevanceReason: 'Vehicle intelligence records a history of cooling system concerns. A full system check may be warranted.',
        evidence: [{
          source: 'vehicle_intelligence',
          sourceType: 'vehicle_intelligence',
          description: 'Vehicle intelligence signal: cooling system concern history.',
          confidence: 0.75,
        }],
        confidence: 0.7,
        estimatedRevenue: null,
        requiresInspectionConfirmation: true,
        disclaimer: DISCLAIMER,
      });
    }
  }

  const hasBrakeWork = lines.some(l => /brake|rotor|caliper|pad/i.test(l.description ?? ''));
  if (hasBrakeWork && !lines.some(l => /brake fluid|fluid flush/i.test(l.description ?? ''))) {
    const fluidSignal = signals.some(s => /brake fluid|fluid/i.test(s.description));
    if (fluidSignal) {
      suggestions.push({
        suggestionKey: 'brake_fluid_review',
        title: 'Brake fluid condition review',
        relevanceReason: 'Brake fluid condition was noted in vehicle intelligence during brake component work.',
        evidence: [{
          source: 'vehicle_intelligence',
          sourceType: 'vehicle_intelligence',
          description: 'Vehicle intelligence signal: brake fluid condition.',
          confidence: 0.7,
        }],
        confidence: 0.65,
        estimatedRevenue: null,
        requiresInspectionConfirmation: true,
        disclaimer: DISCLAIMER,
      });
    }
  }

  return suggestions;
}

export function findRequiredSupportingServices(context: ServiceAdvisorContext): RelatedServiceSuggestion[] {
  const dtcCodes = context.vehicle?.activeDtcCodes ?? [];
  if (dtcCodes.length === 0) return [];

  const lines = context.estimate?.lines ?? [];
  const hasdiagnostic = lines.some(l => /diagn|scan/i.test(l.description ?? ''));

  if (dtcCodes.length > 0 && !hasdiagnostic) {
    return [{
      suggestionKey: 'active_dtc_not_diagnosed',
      title: `Active DTC codes not on estimate (${dtcCodes.slice(0, 3).join(', ')}${dtcCodes.length > 3 ? '…' : ''})`,
      relevanceReason: `Vehicle has ${dtcCodes.length} active DTC code(s). Confirm whether these are addressed in the current visit.`,
      evidence: [{
        source: 'dtc_records',
        sourceType: 'internal',
        description: `Active codes: ${dtcCodes.join(', ')}`,
        confidence: 0.9,
      }],
      confidence: 0.85,
      estimatedRevenue: null,
      requiresInspectionConfirmation: true,
      disclaimer: DISCLAIMER,
    }];
  }

  return [];
}

export function scoreRelatedSuggestion(
  suggestion: RelatedServiceSuggestion,
  extraEvidence: AdvisorEvidence[]
): RelatedServiceSuggestion {
  const evidenceBoost = Math.min(extraEvidence.length * 0.05, 0.2);
  return { ...suggestion, confidence: Math.min(1, suggestion.confidence + evidenceBoost) };
}

export function deduplicateSuggestions(suggestions: RelatedServiceSuggestion[]): RelatedServiceSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter(s => {
    if (seen.has(s.suggestionKey)) return false;
    seen.add(s.suggestionKey);
    return true;
  });
}

export function toServiceAdvisorSuggestions(
  suggestions: RelatedServiceSuggestion[],
  context: ServiceAdvisorContext
): ServiceAdvisorSuggestion[] {
  return suggestions.map((s, idx) => ({
    id: `related-${idx}`,
    shopId: context.shopId,
    advisorSessionId: context.sessionId ?? null,
    suggestionType: 'related_service' as const,
    suggestionKey: s.suggestionKey,
    priority: s.confidence >= 0.85 ? 'high' as const : 'medium' as const,
    title: s.title,
    explanation: s.relevanceReason,
    reason: s.disclaimer,
    estimatedRevenue: s.estimatedRevenue,
    confidence: s.confidence,
    evidence: s.evidence,
    sourceEntityType: null,
    sourceEntityId: null,
    actionType: s.requiresInspectionConfirmation ? 'review' : null,
    actionPayload: {},
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: null,
    dismissedAt: null,
  }));
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
}
