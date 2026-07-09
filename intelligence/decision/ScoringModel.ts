// SI-6: Decision Scoring Model
// Deterministic sub-score calculations per recommendation key.
// No AI. No ML. Pure business logic.

import type { DecisionSubScores, DecisionRationale } from './types';
import type { Recommendation } from '../recommendations/types';

type SignalMap = Record<string, number | string | null>;

// ── Time effort lookup ────────────────────────────────────────
// Maps recommendation_key → estimated minutes to action
const TIME_MINUTES: Record<string, number> = {
  unpaid_invoices:                5,
  stale_estimates:                5,
  approved_estimate_not_scheduled: 10,
  completed_job_not_invoiced:     10,
  low_inventory:                  10,
  stuck_repair_order:             30,
  declined_estimate_winback:      5,
  inactive_customers:             5,
  repair_intelligence_missing:    5,
  revenue_dip:                    30,
};

// Time efficiency: faster actions score higher (quick wins)
function timeEfficiencyScore(minutes: number): number {
  if (minutes <= 2)  return 100;
  if (minutes <= 5)  return 85;
  if (minutes <= 10) return 70;
  if (minutes <= 30) return 50;
  if (minutes <= 60) return 30;
  return 10;
}

// ── Revenue Score (0–350) ─────────────────────────────────────
export function calcRevenueScore(key: string, rec: Recommendation, signals: SignalMap): number {
  switch (key) {
    case 'completed_job_not_invoiced': {
      // Work is already done — uncollected revenue. Highest score.
      const count = Number(signals.completed_not_invoiced_count ?? 0);
      return Math.min(200 + count * 30, 350);
    }
    case 'unpaid_invoices': {
      const count = Number(signals.unpaid_invoice_count ?? 0);
      const total = Number(signals.unpaid_invoice_total ?? 0);
      const base = 120;
      const countBonus = Math.min(count * 15, 80);
      const amountBonus = total > 5000 ? 80 : total > 1000 ? 40 : total > 200 ? 20 : 0;
      return Math.min(base + countBonus + amountBonus, 300);
    }
    case 'stale_estimates': {
      const count = Number(signals.stale_estimate_count ?? 0);
      return Math.min(80 + count * 20, 200);
    }
    case 'approved_estimate_not_scheduled': {
      return 140;
    }
    case 'declined_estimate_winback': {
      const count = Number(signals.declined_estimate_count ?? 0);
      return Math.min(40 + count * 15, 150);
    }
    case 'revenue_dip': {
      const today = Number(signals.revenue_today ?? 0);
      const yesterday = Number(signals.revenue_yesterday ?? 0);
      if (yesterday === 0) return 80;
      const dipPct = (yesterday - today) / yesterday;
      return Math.min(Math.round(100 + dipPct * 200), 250);
    }
    case 'stuck_repair_order': {
      // Stuck jobs delay invoicing
      const count = Number(signals.stuck_job_count ?? 0);
      return Math.min(60 + count * 10, 130);
    }
    case 'low_inventory': {
      // Prevents future job starts
      return 50;
    }
    case 'inactive_customers': {
      return 40;
    }
    case 'repair_intelligence_missing': {
      return 10;
    }
    default:
      return rec.estimatedRevenue ? Math.min(rec.estimatedRevenue / 10, 200) : 30;
  }
}

// ── Risk Score (0–250) ────────────────────────────────────────
export function calcRiskScore(key: string, signals: SignalMap): number {
  switch (key) {
    case 'stuck_repair_order': {
      const count = Number(signals.stuck_job_count ?? 0);
      return Math.min(150 + count * 10, 250);
    }
    case 'low_inventory': {
      const count = Number(signals.low_inventory_count ?? 0);
      const base = 130;
      const bonus = count > 50 ? 80 : count > 20 ? 50 : count > 5 ? 30 : 10;
      return Math.min(base + bonus, 250);
    }
    case 'completed_job_not_invoiced': {
      return 100;
    }
    case 'unpaid_invoices': {
      const overdue = Number(signals.overdue_invoice_count ?? 0);
      return Math.min(50 + overdue * 30, 150);
    }
    case 'revenue_dip': {
      return 120;
    }
    case 'approved_estimate_not_scheduled': {
      return 80;
    }
    case 'stale_estimates': {
      return 40;
    }
    case 'declined_estimate_winback': {
      return 20;
    }
    case 'inactive_customers': {
      return 20;
    }
    case 'repair_intelligence_missing': {
      return 40;
    }
    default:
      return 30;
  }
}

// ── Urgency Score (0–150) ─────────────────────────────────────
// Based on time-sensitivity and escalation risk
export function calcUrgencyScore(key: string, rec: Recommendation, signals: SignalMap): number {
  const createdAt = rec.createdAt ? new Date(rec.createdAt) : new Date();
  const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  const ageBonus = Math.min(ageHours / 24 * 10, 50); // +10 per day old, max 50

  switch (key) {
    case 'completed_job_not_invoiced': return Math.min(130 + ageBonus, 150);
    case 'unpaid_invoices': {
      const overdue = Number(signals.overdue_invoice_count ?? 0);
      return Math.min(100 + overdue * 15 + ageBonus, 150);
    }
    case 'stuck_repair_order':          return Math.min(120 + ageBonus, 150);
    case 'revenue_dip':                 return Math.min(110 + ageBonus, 150);
    case 'low_inventory':               return Math.min(90 + ageBonus, 150);
    case 'stale_estimates':             return Math.min(80 + ageBonus, 150);
    case 'approved_estimate_not_scheduled': return Math.min(70 + ageBonus, 150);
    case 'declined_estimate_winback':   return Math.min(40 + ageBonus, 100);
    case 'inactive_customers':          return Math.min(30 + ageBonus, 80);
    case 'repair_intelligence_missing': return Math.min(50 + ageBonus, 100);
    default:                            return Math.min(40 + ageBonus, 100);
  }
}

// ── Cash Flow Score (0–100) ───────────────────────────────────
export function calcCashFlowScore(key: string, signals: SignalMap): number {
  switch (key) {
    case 'unpaid_invoices': {
      const total = Number(signals.unpaid_invoice_total ?? 0);
      return total > 5000 ? 100 : total > 1000 ? 80 : total > 200 ? 60 : 40;
    }
    case 'completed_job_not_invoiced': return 90;
    case 'stale_estimates':            return 50;
    case 'approved_estimate_not_scheduled': return 40;
    case 'revenue_dip':                return 60;
    case 'stuck_repair_order':         return 30;
    case 'low_inventory':              return 20;
    default:                           return 10;
  }
}

// ── Customer Impact Score (0–30) ──────────────────────────────
export function calcCustomerImpactScore(key: string): number {
  switch (key) {
    case 'inactive_customers':          return 30;
    case 'stuck_repair_order':          return 25;
    case 'stale_estimates':             return 20;
    case 'unpaid_invoices':             return 20;
    case 'declined_estimate_winback':   return 25;
    case 'low_inventory':               return 15;
    case 'approved_estimate_not_scheduled': return 15;
    case 'completed_job_not_invoiced':  return 10;
    default:                            return 5;
  }
}

// ── Technician Impact Score (0–20) ────────────────────────────
export function calcTechnicianImpactScore(key: string): number {
  switch (key) {
    case 'stuck_repair_order':          return 20;
    case 'low_inventory':               return 18;
    case 'approved_estimate_not_scheduled': return 15;
    case 'completed_job_not_invoiced':  return 10;
    default:                            return 0;
  }
}

// ── Knowledge Impact Score (0–20) ─────────────────────────────
export function calcKnowledgeImpactScore(key: string): number {
  switch (key) {
    case 'repair_intelligence_missing': return 20;
    case 'stuck_repair_order':          return 5;
    default:                            return 0;
  }
}

// ── Confidence Multiplier (0.5–1.0) ──────────────────────────
export function calcConfidenceMultiplier(confidence: number): number {
  // confidence is 0–1 from recommendation.confidence field
  if (confidence >= 0.9) return 1.0;
  if (confidence >= 0.7) return 0.9;
  if (confidence >= 0.5) return 0.75;
  if (confidence >= 0.3) return 0.6;
  return 0.5;
}

// ── Rationale builder ─────────────────────────────────────────
export function buildRationale(
  key: string,
  subScores: DecisionSubScores,
  minutes: number,
  confidence: number,
): DecisionRationale {
  const REVENUE_LABELS: Record<string, string> = {
    completed_job_not_invoiced: 'Work is already done — revenue is uncollected.',
    unpaid_invoices:            'Outstanding invoices represent collectible cash.',
    stale_estimates:            'Stale estimates have a conversion chance.',
    revenue_dip:                'Revenue is below yesterday — investigate now.',
    approved_estimate_not_scheduled: 'Approved work is pending job creation.',
    stuck_repair_order:         'Stuck jobs delay invoicing.',
    low_inventory:              'Stock gaps prevent future job starts.',
    declined_estimate_winback:  'Declined customers may accept alternatives.',
    inactive_customers:         'Re-engagement cost is low; return value is high.',
    repair_intelligence_missing: 'Recording repair cases builds institutional knowledge.',
  };
  const URGENCY_LABELS: Record<string, string> = {
    completed_job_not_invoiced: 'Every day without an invoice delays payment.',
    unpaid_invoices:            'Overdue invoices increase write-off risk.',
    stuck_repair_order:         'Customers waiting on stuck jobs escalate quickly.',
    revenue_dip:                'Revenue dips compound — act before end of day.',
    low_inventory:              'Out-of-stock parts block job starts.',
    stale_estimates:            'Estimates older than 3 days lose conversion rate.',
    repair_intelligence_missing: 'Today\'s cases must be recorded before end of day.',
    default:                    'Addressing this earlier reduces escalation cost.',
  };

  const topFactor = subScores.revenueScore >= subScores.riskScore
    ? `Revenue impact (${Math.round(subScores.revenueScore)})`
    : `Operational risk (${Math.round(subScores.riskScore)})`;

  return {
    topFactor,
    revenueExplain: REVENUE_LABELS[key] ?? 'Addressing this improves shop revenue.',
    urgencyExplain: URGENCY_LABELS[key] ?? URGENCY_LABELS.default,
    timeExplain: `Estimated effort: ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} hr`}. ${minutes <= 10 ? 'Quick win.' : minutes <= 30 ? 'Moderate effort.' : 'Requires focused time.'}`,
    confidenceExplain: confidence >= 0.9 ? 'Very high confidence — verified from live data.'
      : confidence >= 0.7 ? 'High confidence from recent data.'
      : confidence >= 0.5 ? 'Moderate confidence — some data may be estimated.'
      : 'Lower confidence — treat as directional.',
  };
}

// ── Main: score one recommendation ───────────────────────────
export function scoreRecommendation(
  rec: Recommendation,
  signals: SignalMap,
): { subScores: DecisionSubScores; rawScore: number; confidenceMultiplier: number; decisionScore: number; estimatedTimeMinutes: number; rationale: DecisionRationale } {
  const key = rec.recommendationKey;
  const minutes = TIME_MINUTES[key] ?? 10;

  const subScores: DecisionSubScores = {
    revenueScore:          calcRevenueScore(key, rec, signals),
    riskScore:             calcRiskScore(key, signals),
    urgencyScore:          calcUrgencyScore(key, rec, signals),
    timeEfficiencyScore:   timeEfficiencyScore(minutes),
    cashFlowScore:         calcCashFlowScore(key, signals),
    customerImpactScore:   calcCustomerImpactScore(key),
    technicianImpactScore: calcTechnicianImpactScore(key),
    knowledgeImpactScore:  calcKnowledgeImpactScore(key),
  };

  const rawScore = Math.min(
    subScores.revenueScore +
    subScores.riskScore +
    subScores.urgencyScore +
    subScores.timeEfficiencyScore +
    subScores.cashFlowScore +
    subScores.customerImpactScore +
    subScores.technicianImpactScore +
    subScores.knowledgeImpactScore,
    1020,
  );

  const confidenceMultiplier = calcConfidenceMultiplier(rec.confidence ?? 0.8);
  const decisionScore = Math.round(Math.min(rawScore * confidenceMultiplier, 1000));
  const rationale = buildRationale(key, subScores, minutes, rec.confidence ?? 0.8);

  return { subScores, rawScore, confidenceMultiplier, decisionScore, estimatedTimeMinutes: minutes, rationale };
}
