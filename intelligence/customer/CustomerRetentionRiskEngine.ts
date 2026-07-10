// SI-13: Customer Retention Risk Engine

import type {
  CustomerLifetimeContext,
  CustomerRetentionRisk,
  CustomerRetentionRiskResult,
  RetentionFactor,
  RetentionAction,
} from './types';

export function assessRetentionRisk(ctx: CustomerLifetimeContext): CustomerRetentionRiskResult {
  const now = new Date();
  const calculatedAt = now.toISOString();

  if (!ctx.customer || ctx.jobHistory.length + ctx.invoiceHistory.length < 1) {
    return {
      risk: 'unknown',
      baseScore: 50,
      positiveFactors: [],
      negativeFactors: [],
      finalScore: 50,
      confidence: 0,
      dataQuality: 'insufficient_data',
      suggestedActions: [],
      calculatedAt,
    };
  }

  // Score: 0 = highest risk, 100 = lowest risk
  let score = 50;
  const positiveFactors: RetentionFactor[] = [];
  const negativeFactors: RetentionFactor[] = [];

  // Recency
  const lastJob = ctx.jobHistory[0];
  if (lastJob) {
    const daysSince = Math.floor((now.getTime() - new Date(lastJob.createdAt).getTime()) / 86400000);
    if (daysSince <= 60) {
      score += 25;
      positiveFactors.push({ key: 'very_recent', label: 'Recent visit within 60 days', impact: 25 });
    } else if (daysSince <= 180) {
      score += 10;
      positiveFactors.push({ key: 'recent_visit', label: 'Visit within 6 months', impact: 10 });
    } else if (daysSince > 540) {
      score -= 30;
      negativeFactors.push({ key: 'very_long_absent', label: 'No visit in 18+ months', impact: -30 });
    } else if (daysSince > 365) {
      score -= 20;
      negativeFactors.push({ key: 'long_absent', label: 'No visit in 12+ months', impact: -20 });
    } else if (daysSince > 270) {
      score -= 10;
      negativeFactors.push({ key: 'moderate_absent', label: 'No visit in 9+ months', impact: -10 });
    }
  }

  // Frequency — multiple visits indicates commitment
  const visitCount = ctx.jobHistory.length;
  if (visitCount >= 8) {
    score += 20;
    positiveFactors.push({ key: 'high_frequency', label: 'Long service relationship (8+ visits)', impact: 20 });
  } else if (visitCount >= 4) {
    score += 10;
    positiveFactors.push({ key: 'moderate_frequency', label: 'Repeat customer (4+ visits)', impact: 10 });
  } else if (visitCount === 1) {
    score -= 10;
    negativeFactors.push({ key: 'single_visit', label: 'Only one visit on record', impact: -10 });
  }

  // Fleet / commercial
  if (ctx.customer.isFleet || ctx.customer.isCommercial) {
    score += 10;
    positiveFactors.push({ key: 'fleet_commercial', label: 'Fleet or commercial relationship', impact: 10 });
  }

  // Multiple active vehicles — more touchpoints = higher retention
  const activeVehicles = ctx.vehicles.filter(v => v.isActive).length;
  if (activeVehicles >= 2) {
    score += 8;
    positiveFactors.push({ key: 'multi_vehicle', label: 'Multiple vehicles on file', impact: 8 });
  }

  // Unresolved declined work — potential friction
  if (ctx.declinedWork.length >= 3) {
    score -= 8;
    negativeFactors.push({ key: 'many_declined', label: 'Multiple declined work items', impact: -8 });
  }

  // Unpaid invoices — friction indicator
  const unpaidInvoices = ctx.invoiceHistory.filter(i => !i.paidAt && i.status !== 'void' && i.status !== 'cancelled');
  if (unpaidInvoices.length >= 2) {
    score -= 10;
    negativeFactors.push({ key: 'unpaid_invoices', label: 'Multiple outstanding invoices', impact: -10 });
  }

  score = Math.max(0, Math.min(100, score));
  const baseScore = 50;

  const sampleSize = visitCount + ctx.invoiceHistory.length;
  const confidence = sampleSize >= 10 ? 0.9 : sampleSize >= 5 ? 0.7 : sampleSize >= 2 ? 0.5 : 0.3;
  const dataQuality = sampleSize >= 10 ? 'high' : sampleSize >= 5 ? 'medium' : sampleSize >= 2 ? 'low' : 'insufficient';

  let risk: CustomerRetentionRisk;
  const suggestedActions: RetentionAction[] = [];

  if (score >= 75) {
    risk = 'low';
  } else if (score >= 55) {
    risk = 'moderate';
    suggestedActions.push({ actionType: 'check_in', label: 'Consider scheduling a follow-up check', priority: 'low' });
  } else if (score >= 35) {
    risk = 'high';
    suggestedActions.push({ actionType: 'follow_up', label: 'Follow up on pending estimates or declined work', priority: 'medium' });
    suggestedActions.push({ actionType: 'service_reminder', label: 'Review overdue maintenance with technician', priority: 'medium' });
  } else {
    risk = 'critical';
    suggestedActions.push({ actionType: 'priority_outreach', label: 'Prioritize outreach — customer may be lost', priority: 'high' });
    suggestedActions.push({ actionType: 'review_history', label: 'Review full service history before contacting', priority: 'high' });
  }

  return { risk, baseScore, positiveFactors, negativeFactors, finalScore: score, confidence, dataQuality, suggestedActions, calculatedAt };
}
