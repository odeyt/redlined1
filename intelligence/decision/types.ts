// SI-6: Executive Decision Engine Types
// Deterministic. No AI. No external calls.

import type { Recommendation } from '../recommendations/types';

/** Sub-score breakdown for a single recommendation */
export interface DecisionSubScores {
  revenueScore: number;         // 0–350: direct/indirect revenue impact
  riskScore: number;            // 0–250: operational risk if not addressed
  urgencyScore: number;         // 0–150: time sensitivity
  timeEfficiencyScore: number;  // 0–100: quick win bonus (less effort = higher score)
  cashFlowScore: number;        // 0–100: speed of cash collection
  customerImpactScore: number;  // 0–30: customer retention effect
  technicianImpactScore: number; // 0–20: technician throughput effect
  knowledgeImpactScore: number;  // 0–20: institutional knowledge value
}

/** Computed score + metadata for one recommendation */
export interface DecisionScore {
  recommendationId: string;
  recommendationKey: string;
  shopId: string;
  subScores: DecisionSubScores;
  rawScore: number;             // sum of sub-scores (0–1020 max)
  confidenceMultiplier: number; // 0.5–1.0 from SI-5 confidence
  decisionScore: number;        // rawScore × confidenceMultiplier, capped 0–1000
  estimatedRevenue: number | null;
  estimatedTimeMinutes: number;
  rationale: DecisionRationale;
}

/** Human-readable scoring explanation */
export interface DecisionRationale {
  topFactor: string;
  revenueExplain: string;
  urgencyExplain: string;
  timeExplain: string;
  confidenceExplain: string;
}

/** A ranked, actionable item in the Action Queue */
export interface RankedAction {
  rank: number;
  recommendation: Recommendation;
  score: DecisionScore;
  quickActions: QuickAction[];
  whyItMatters: string;
  expectedImpact: string;
}

/** A quick action button in the UI — navigation only, never auto-modifies data */
export type QuickActionType =
  | 'open_invoice'
  | 'open_estimate'
  | 'open_job'
  | 'open_repair_order'
  | 'open_inventory'
  | 'open_customer'
  | 'view_evidence'
  | 'mark_complete'
  | 'dismiss';

export interface QuickAction {
  type: QuickActionType;
  label: string;
  module?: string; // app route to navigate to
  entityId?: string;
}

/** The ranked action queue for a shop */
export interface ActionQueue {
  shopId: string;
  date: string;
  rankedActions: RankedAction[];
  totalOpenRecommendations: number;
  generatedAt: string;
}

/** Executive Score breakdown (0–100) */
export interface ExecutiveScore {
  overall: number;              // 0–100
  revenueHealth: number;        // 0–25
  efficiency: number;           // 0–25
  riskControl: number;          // 0–20
  cashFlow: number;             // 0–20
  knowledgeGrowth: number;      // 0–10
  trend: 'up' | 'down' | 'stable';
  breakdown: ExecutiveScoreBreakdown;
}

export interface ExecutiveScoreBreakdown {
  revenueExplain: string;
  efficiencyExplain: string;
  riskExplain: string;
  cashFlowExplain: string;
  knowledgeExplain: string;
}

/** Today's potential impact estimates */
export interface TodaysImpact {
  potentialRevenueToday: number;
  potentialCashCollection: number;
  potentialJobsClosed: number;
  potentialEstimatesConverted: number;
  potentialKnowledgeAdded: number;
}

/** Stored decision ranking row from DB */
export interface DecisionRankingRow {
  id: string;
  shopId: string;
  rankingDate: string;
  rankedActions: RankedAction[];
  executiveScore: number;
  potentialRevenueToday: number;
  potentialCashCollection: number;
  potentialJobsClosed: number;
  potentialEstimatesConverted: number;
  potentialKnowledgeAdded: number;
  generatedAt: string;
}
