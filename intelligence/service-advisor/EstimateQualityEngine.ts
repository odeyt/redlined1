// SI-12: Estimate Quality Engine — deterministic checks, no estimate modification

import type {
  ServiceAdvisorContext,
  EstimateQualityReview,
  EstimateQualityIssue,
  ServiceAdvisorSuggestion,
  AdvisorEvidence,
} from './types';

const STALE_ESTIMATE_DAYS = 30;
const ZERO_PRICE_THRESHOLD = 0.01;

export async function reviewEstimate(
  estimateId: string,
  context: ServiceAdvisorContext
): Promise<EstimateQualityReview> {
  const score = calculateEstimateQualityScore(context);
  const issues = buildAllIssues(context);
  return {
    estimateId,
    qualityScore: score,
    issues,
    checkedAt: new Date().toISOString(),
    dataQualityWarning: context.dataQualityWarnings.length > 0
      ? `Limited data: ${context.dataQualityWarnings.join(', ')}`
      : null,
  };
}

export function calculateEstimateQualityScore(context: ServiceAdvisorContext): number {
  const issues = buildAllIssues(context);
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 20;
    else if (issue.severity === 'warning') score -= 10;
    else score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

function buildAllIssues(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const issues: EstimateQualityIssue[] = [];
  issues.push(...findMissingDescriptions(context));
  issues.push(...findUnpricedItems(context));
  issues.push(...findDuplicateItems(context));
  issues.push(...findInspectionEstimateGaps(context));
  issues.push(...findUnsafeAmbiguity(context));
  issues.push(...findCurrencyIssues(context));
  issues.push(...findMissingLabor(context));
  issues.push(...findMissingParts(context));
  issues.push(...findTaxDiscountIssues(context));
  issues.push(...findSafetyOmissions(context));
  issues.push(...findStaleEstimate(context));
  return issues;
}

export function findMissingDescriptions(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  return lines
    .filter(l => !l.description || l.description.trim().length < 3)
    .map(l => ({
      ruleKey: 'missing_description',
      severity: 'warning' as const,
      title: 'Missing line description',
      description: 'A line item has an empty or very short description. Customers may not understand what they are paying for.',
      affectedLineId: l.id,
      recommendation: 'Review whether a clear description can be added to this line item.',
    }));
}

export function findUnpricedItems(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  return lines
    .filter(l => l.total < ZERO_PRICE_THRESHOLD && l.unitPrice < ZERO_PRICE_THRESHOLD)
    .filter(l => l.description && l.description.trim().length > 0)
    .map(l => ({
      ruleKey: 'zero_price_item',
      severity: 'warning' as const,
      title: 'Zero-price line item',
      description: `Line "${l.description}" has a zero price. Confirm whether this is intentional (e.g. warranty, goodwill) or a missing entry.`,
      affectedLineId: l.id,
      recommendation: 'Confirm that this item is intentionally zero-priced.',
    }));
}

export function findDuplicateItems(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  const seen = new Map<string, string>();
  const issues: EstimateQualityIssue[] = [];
  for (const line of lines) {
    const key = (line.description ?? '').toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) {
      issues.push({
        ruleKey: 'duplicate_line',
        severity: 'warning',
        title: 'Potentially duplicate line item',
        description: `"${line.description}" appears more than once. Review whether both entries are intentional.`,
        affectedLineId: line.id,
        recommendation: 'Confirm whether this is a duplicate or intentional (e.g. two separate labor charges).',
      });
    } else {
      seen.set(key, line.id);
    }
  }
  return issues;
}

export function findMissingLabor(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  const hasLabor = lines.some(l => l.lineType === 'labor');
  const hasParts = lines.some(l => l.lineType === 'part');
  if (hasParts && !hasLabor && lines.length > 0) {
    return [{
      ruleKey: 'missing_labor',
      severity: 'info',
      title: 'Parts present without labor',
      description: 'This estimate includes parts but no labor lines. Review whether installation labor is missing.',
      affectedLineId: null,
      recommendation: 'Review whether labor should be included for parts installation.',
    }];
  }
  return [];
}

export function findMissingParts(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  const hasLabor = lines.some(l => l.lineType === 'labor');
  const hasParts = lines.some(l => l.lineType === 'part');
  if (hasLabor && !hasParts && lines.length > 0) {
    return [{
      ruleKey: 'missing_parts',
      severity: 'info',
      title: 'Labor present without parts',
      description: 'This estimate includes labor but no parts lines. Review whether required parts are missing.',
      affectedLineId: null,
      recommendation: 'Review whether parts should be included with this labor.',
    }];
  }
  return [];
}

export function findInspectionEstimateGaps(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const findings = context.inspection?.findings ?? [];
  if (findings.length === 0) return [];
  const unlinked = findings.filter(f => !f.hasEstimateLine);
  return unlinked.map(f => ({
    ruleKey: 'inspection_gap',
    severity: f.isSafety ? 'critical' as const : 'warning' as const,
    title: `Inspection finding not on estimate: ${f.name}`,
    description: `The inspection finding "${f.name}" (${f.category}) does not have a corresponding estimate line. Review whether it should be quoted.`,
    affectedLineId: null,
    recommendation: `Review whether "${f.name}" should be included in this estimate.`,
  }));
}

export function findUnsafeAmbiguity(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  const vaguePhrases = ['misc', 'other', 'tbd', 'see notes', 'as discussed', 'various'];
  return lines
    .filter(l => {
      const desc = (l.description ?? '').toLowerCase();
      return vaguePhrases.some(p => desc.includes(p));
    })
    .map(l => ({
      ruleKey: 'vague_description',
      severity: 'info' as const,
      title: 'Vague line description',
      description: `Line "${l.description}" contains ambiguous language. Customers may question this item.`,
      affectedLineId: l.id,
      recommendation: 'Confirm that a clearer description can be provided for customer transparency.',
    }));
}

export function findCurrencyIssues(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const lines = context.estimate?.lines ?? [];
  const currencies = new Set(lines.map(l => l.currency ?? 'USD'));
  if (currencies.size > 1) {
    return [{
      ruleKey: 'mixed_currency',
      severity: 'warning',
      title: 'Multiple currencies on estimate',
      description: `This estimate has lines in ${[...currencies].join(' and ')}. Confirm the customer understands the mixed-currency total.`,
      affectedLineId: null,
      recommendation: 'Review whether the mixed-currency breakdown is clear to the customer.',
    }];
  }
  return [];
}

export function findTaxDiscountIssues(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  // Placeholder — actual tax/discount check requires estimate-level fields
  return [];
}

function findSafetyOmissions(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const safetyFindings = (context.inspection?.findings ?? []).filter(f => f.isSafety && !f.hasEstimateLine);
  return safetyFindings.map(f => ({
    ruleKey: 'safety_omission',
    severity: 'critical' as const,
    title: `Safety finding not quoted: ${f.name}`,
    description: `"${f.name}" is flagged as a safety item but is not on this estimate. Confirm whether it should be included.`,
    affectedLineId: null,
    recommendation: `Confirm that "${f.name}" should be addressed and quoted on this estimate.`,
  }));
}

function findStaleEstimate(context: ServiceAdvisorContext): EstimateQualityIssue[] {
  const createdAt = context.estimate?.createdAt;
  if (!createdAt) return [];
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > STALE_ESTIMATE_DAYS && !context.estimate?.approvedAt) {
    return [{
      ruleKey: 'stale_estimate',
      severity: 'info',
      title: `Estimate is ${Math.round(ageDays)} days old`,
      description: 'This estimate has not been approved or declined in over a month. Prices and availability may have changed.',
      affectedLineId: null,
      recommendation: 'Review whether this estimate should be refreshed or the customer followed up with.',
    }];
  }
  return [];
}

export function buildQualitySuggestions(
  context: ServiceAdvisorContext,
  review: EstimateQualityReview
): ServiceAdvisorSuggestion[] {
  return review.issues.map((issue, idx) => {
    const evidence: AdvisorEvidence[] = [];
    if (issue.affectedLineId) {
      evidence.push({
        source: 'estimate_line',
        sourceType: 'internal',
        entityId: issue.affectedLineId,
        entityType: 'estimate_line',
        description: issue.description,
        confidence: 0.9,
      });
    }
    return {
      id: `quality-${idx}`,
      shopId: context.shopId,
      advisorSessionId: context.sessionId ?? null,
      suggestionType: 'estimate_quality',
      suggestionKey: issue.ruleKey,
      priority: issue.severity === 'critical' ? 'critical' : issue.severity === 'warning' ? 'high' : 'medium',
      title: issue.title,
      explanation: issue.description,
      reason: issue.recommendation,
      estimatedRevenue: null,
      confidence: issue.severity === 'critical' ? 0.9 : 0.7,
      evidence,
      sourceEntityType: 'estimate',
      sourceEntityId: context.estimate?.estimateId ?? null,
      actionType: null,
      actionPayload: {},
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: null,
      dismissedAt: null,
    };
  });
}
