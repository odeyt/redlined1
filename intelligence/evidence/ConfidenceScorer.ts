// SI-5: Deterministic Confidence Scorer
// No AI. No external calls. Pure arithmetic from evidence facts.

import type { RecommendationEvidence, ConfidenceScoreResult, EvidenceScoreResult } from './types';

// Base score before adjustments
const BASE = 50;

export function calculateConfidenceFromEvidence(
  items: RecommendationEvidence[],
  ageHours?: number,
): ConfidenceScoreResult {
  let score = BASE;
  const positive: string[] = [];
  const negative: string[] = [];

  if (items.length === 0) {
    return {
      confidence: 20,
      explanation: 'No evidence available — limited confidence.',
      positiveFactors: [],
      negativeFactors: ['No supporting evidence found'],
    };
  }

  // +20 if at least one item has a known source entity
  const hasSource = items.some(i => i.sourceEntityType && i.sourceEntityId);
  if (hasSource) { score += 20; positive.push('Source entity verified'); }

  // +15 if at least one numeric value is known and non-zero
  const hasAmount = items.some(i => i.evidenceNumeric != null && i.evidenceNumeric > 0);
  if (hasAmount) { score += 15; positive.push('Monetary value known'); }
  else { score -= 20; negative.push('Value unknown or zero'); }

  // +10 if age/duration evidence exists
  const hasAge = items.some(i => i.evidenceTitle.toLowerCase().includes('age') || i.evidenceTitle.toLowerCase().includes('days') || i.evidenceTitle.toLowerCase().includes('oldest'));
  if (hasAge) { score += 10; positive.push('Age/duration data available'); }

  // +10 if multiple records support the recommendation
  const hasMultiple = items.some(i => i.evidenceNumeric != null && i.evidenceNumeric > 1 && (i.evidenceTitle.toLowerCase().includes('count') || i.evidenceTitle.toLowerCase().includes('total')));
  if (hasMultiple) { score += 10; positive.push('Multiple supporting records'); }

  // +5 if related entity (customer/vehicle/job) is known
  const hasRelated = items.some(i => ['customer', 'vehicle', 'job_card', 'repair_order'].includes(i.evidenceType));
  if (hasRelated) { score += 5; positive.push('Related entity identified'); }

  // +5 if data is fresh (age < 1 hour)
  if (ageHours !== undefined && ageHours < 1) { score += 5; positive.push('Data fresh within the hour'); }

  // -10 if evidence is incomplete (some items have no value at all)
  const hasEmpty = items.some(i => i.evidenceNumeric == null && !i.evidenceValue);
  if (hasEmpty) { score -= 10; negative.push('Some evidence incomplete'); }

  // -10 if metric data is older than 24 hours
  if (ageHours !== undefined && ageHours > 24) { score -= 10; negative.push('Metric data older than 24 hours'); }

  // -10 if no source entity can be opened
  if (!hasSource) { score -= 10; negative.push('Source entity not directly linkable'); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const explanation =
    score >= 80 ? 'High confidence — strong evidence from verifiable sources.' :
    score >= 55 ? 'Moderate confidence — evidence available but incomplete.' :
    score >= 30 ? 'Low confidence — limited data available.' :
    'Very low confidence — minimal evidence; treat as a signal only.';

  return { confidence: score, explanation, positiveFactors: positive, negativeFactors: negative };
}

export function calculateEvidenceScore(items: RecommendationEvidence[]): EvidenceScoreResult {
  if (items.length === 0) {
    return { score: 0, positiveFactors: [], negativeFactors: ['No evidence items'], itemCount: 0, totalWeight: 0 };
  }

  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;
  const totalWeight = items.reduce((s, i) => s + (i.weight ?? 1), 0);

  for (const item of items) {
    const w = item.weight ?? 1;
    const itemConf = item.confidence ?? 0;
    score += w * itemConf * 100;
    if (itemConf >= 0.8) positive.push(item.evidenceTitle);
    else if (itemConf < 0.4) negative.push(item.evidenceTitle);
  }

  const normalized = totalWeight > 0 ? Math.round(score / totalWeight) : 0;

  return {
    score: Math.max(0, Math.min(100, normalized)),
    positiveFactors: positive,
    negativeFactors: negative,
    itemCount: items.length,
    totalWeight,
  };
}
