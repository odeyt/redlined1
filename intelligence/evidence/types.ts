// SI-5: Evidence Engine Types
// All types are deterministic. No AI. No external calls.

export type EvidenceType =
  | 'invoice'
  | 'estimate'
  | 'payment'
  | 'job_card'
  | 'repair_order'
  | 'inventory'
  | 'customer'
  | 'vehicle'
  | 'technician'
  | 'repair_case'
  | 'metric'
  | 'signal'
  | 'history'
  | 'risk'
  | 'system';

export type OutcomeStatus =
  | 'pending'
  | 'completed'
  | 'dismissed'
  | 'ignored'
  | 'expired'
  | 'successful'
  | 'failed';

export interface RecommendationEvidence {
  id?: string;
  shopId: string;
  recommendationId?: string;
  evidenceType: EvidenceType;
  evidenceTitle: string;
  evidenceValue?: string | null;
  evidenceNumeric?: number | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  weight: number;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt?: string;
}

export interface RecommendationOutcome {
  id?: string;
  shopId: string;
  recommendationId: string;
  outcomeStatus: OutcomeStatus;
  outcomeValue?: number | null;
  revenueRealized?: number | null;
  completedBy?: string | null;
  completedAt?: string | null;
  dismissedBy?: string | null;
  dismissedAt?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** All evidence items bundled with computed scores for a single recommendation */
export interface EvidenceBundle {
  recommendationId: string;
  recommendationKey: string;
  items: RecommendationEvidence[];
  score: EvidenceScoreResult;
  confidence: ConfidenceScoreResult;
  explanation: DecisionExplanation;
}

/** Human-readable explanation of a recommendation */
export interface DecisionExplanation {
  summary: string;
  whyItMatters: string;
  evidenceSummary: string[];
  suggestedActions: string[];
  expectedImpact: string;
  dataFreshness: 'live' | 'recent' | 'stale' | 'unknown';
}

export interface EvidenceScoreResult {
  score: number;          // 0–100
  positiveFactors: string[];
  negativeFactors: string[];
  itemCount: number;
  totalWeight: number;
}

export interface ConfidenceScoreResult {
  confidence: number;     // 0–100
  explanation: string;
  positiveFactors: string[];
  negativeFactors: string[];
}

/** Input for recording an outcome from the UI */
export interface RecordOutcomeInput {
  recommendationId: string;
  shopId: string;
  outcomeStatus: OutcomeStatus;
  userId?: string;
  notes?: string;
  revenueRealized?: number;
}
