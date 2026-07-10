// SI-13: Customer Relationship Scoring Engine

import type { CustomerLifetimeContext, CustomerRelationshipScore, RetentionFactor } from './types';

export function scoreCustomerRelationship(ctx: CustomerLifetimeContext): CustomerRelationshipScore {
  const now = new Date();
  const calculatedAt = now.toISOString();

  if (!ctx.customer || ctx.invoiceHistory.length + ctx.jobHistory.length < 1) {
    return {
      score: 0,
      status: 'unknown',
      positiveFactors: [],
      negativeFactors: [],
      confidence: 0,
      dataQuality: 'insufficient_data',
      calculatedAt,
    };
  }

  let score = 50;
  const positiveFactors: RetentionFactor[] = [];
  const negativeFactors: RetentionFactor[] = [];

  // Visit count
  const visitCount = ctx.jobHistory.length;
  if (visitCount >= 10) {
    score += 20;
    positiveFactors.push({ key: 'high_visit_count', label: 'Long service history (10+ visits)', impact: 20 });
  } else if (visitCount >= 5) {
    score += 10;
    positiveFactors.push({ key: 'moderate_visit_count', label: 'Established service history (5+ visits)', impact: 10 });
  } else if (visitCount >= 2) {
    score += 5;
    positiveFactors.push({ key: 'some_visit_history', label: 'Returning customer', impact: 5 });
  }

  // Paid invoice reliability
  const paidCount = ctx.invoiceHistory.filter(i => i.paidAt).length;
  const invoiceCount = ctx.invoiceHistory.length;
  if (invoiceCount >= 3) {
    const paidPct = paidCount / invoiceCount;
    if (paidPct >= 0.95) {
      score += 15;
      positiveFactors.push({ key: 'excellent_payment', label: 'Excellent payment history', impact: 15 });
    } else if (paidPct >= 0.75) {
      score += 5;
      positiveFactors.push({ key: 'good_payment', label: 'Good payment history', impact: 5 });
    } else if (paidPct < 0.5) {
      score -= 10;
      negativeFactors.push({ key: 'poor_payment', label: 'Low payment rate', impact: -10 });
    }
  }

  // High estimate approval rate
  const approvedEstimates = ctx.estimateHistory.filter(e => e.approvedAt).length;
  const totalEstimates = ctx.estimateHistory.length;
  if (totalEstimates >= 3) {
    const approvalRate = approvedEstimates / totalEstimates;
    if (approvalRate >= 0.8) {
      score += 10;
      positiveFactors.push({ key: 'high_approval', label: 'High estimate approval rate', impact: 10 });
    } else if (approvalRate < 0.3) {
      score -= 5;
      negativeFactors.push({ key: 'low_approval', label: 'Low estimate approval rate', impact: -5 });
    }
  }

  // Recency — last visit
  const lastJob = ctx.jobHistory[0];
  if (lastJob) {
    const daysSinceLastJob = Math.floor((now.getTime() - new Date(lastJob.createdAt).getTime()) / 86400000);
    if (daysSinceLastJob <= 90) {
      score += 10;
      positiveFactors.push({ key: 'recent_visit', label: 'Recent service visit (within 90 days)', impact: 10 });
    } else if (daysSinceLastJob > 365) {
      score -= 15;
      negativeFactors.push({ key: 'long_absent', label: 'No visit in over a year', impact: -15 });
    } else if (daysSinceLastJob > 180) {
      score -= 8;
      negativeFactors.push({ key: 'absent_6mo', label: 'No visit in over 6 months', impact: -8 });
    }
  }

  // Fleet / commercial bonus
  if (ctx.customer.isFleet || ctx.customer.isCommercial) {
    score += 5;
    positiveFactors.push({ key: 'fleet_commercial', label: 'Fleet or commercial account', impact: 5 });
  }

  // Multiple vehicles
  const activeVehicles = ctx.vehicles.filter(v => v.isActive).length;
  if (activeVehicles >= 3) {
    score += 8;
    positiveFactors.push({ key: 'multiple_vehicles', label: 'Multiple vehicles on file', impact: 8 });
  } else if (activeVehicles >= 2) {
    score += 4;
    positiveFactors.push({ key: 'two_vehicles', label: 'Two vehicles on file', impact: 4 });
  }

  // Business memory mentions
  if (ctx.businessMemorySummary && ctx.businessMemorySummary.length > 10) {
    score += 3;
    positiveFactors.push({ key: 'business_memory', label: 'Shop notes on file', impact: 3 });
  }

  score = Math.max(0, Math.min(100, score));

  const sampleSize = visitCount + invoiceCount;
  const confidence = sampleSize >= 10 ? 0.9 : sampleSize >= 5 ? 0.7 : sampleSize >= 2 ? 0.5 : 0.3;
  const dataQuality = sampleSize >= 10 ? 'high' : sampleSize >= 5 ? 'medium' : sampleSize >= 2 ? 'low' : 'insufficient';

  let status: CustomerRelationshipScore['status'];
  if (score >= 85) status = 'excellent';
  else if (score >= 70) status = 'strong';
  else if (score >= 50) status = 'stable';
  else if (score >= 35) status = 'weak';
  else status = 'at_risk';

  return { score, status, positiveFactors, negativeFactors, confidence, dataQuality, calculatedAt };
}
