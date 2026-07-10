// SI-11: Intelligence Learning Engine — Types
// Deterministic only. No AI. No embeddings. No external calls.

export type RecommendationFeedbackType =
  | 'correct'
  | 'incorrect'
  | 'partially_correct'
  | 'useful'
  | 'not_useful'
  | 'needs_more_information';

export type RecommendationResultStatus =
  | 'unknown'
  | 'successful'
  | 'partially_successful'
  | 'unsuccessful'
  | 'not_measured';

export interface RecommendationFeedback {
  id: string;
  shopId: string;
  recommendationId: string;
  userId: string | null;
  feedbackType: RecommendationFeedbackType;
  usefulnessScore: number | null;  // 1-5
  accuracyScore: number | null;    // 1-5
  trustScore: number | null;       // 1-5
  resultStatus: RecommendationResultStatus | null;
  reasonCode: string | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationLearningProfile {
  id: string;
  shopId: string;
  ruleKey: string;
  category: string;
  totalRecommendations: number;
  actedUponCount: number;
  completedCount: number;
  dismissedCount: number;
  correctCount: number;
  incorrectCount: number;
  partiallyCorrectCount: number;
  successfulOutcomeCount: number;
  failedOutcomeCount: number;
  totalRevenueRealized: number;
  averageRevenueRealized: number;
  averageUsefulness: number;
  averageAccuracy: number;
  averageTrust: number;
  learnedConfidenceAdjustment: number;
  rankingAdjustment: number;
  sampleSize: number;
  lastCalculatedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationLearningEvent {
  id: string;
  shopId: string;
  recommendationId: string | null;
  ruleKey: string | null;
  eventType: string;
  previousValue: number | null;
  newValue: number | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RecommendationValueAttribution {
  id: string;
  shopId: string;
  recommendationId: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  expectedRevenue: number | null;
  realizedRevenue: number | null;
  expectedTimeSavedMinutes: number | null;
  realizedTimeSavedMinutes: number | null;
  riskReductionScore: number | null;
  attributionStatus: 'pending' | 'verified' | 'rejected';
  attributionMethod: 'manual' | 'automatic';
  verifiedBy: string | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LearningCalculationInput {
  shopId: string;
  ruleKey: string;
  category: string;
  feedbackRows: RecommendationFeedback[];
  attributionRows: RecommendationValueAttribution[];
  totalRecommendations: number;
  actedUponCount: number;
  completedCount: number;
  dismissedCount: number;
}

export interface LearningCalculationResult {
  ruleKey: string;
  sampleSize: number;
  belowMinimumSample: boolean;
  correctnessRate: number;
  actionRate: number;
  successRate: number;
  dismissRate: number;
  averageUsefulness: number;
  averageAccuracy: number;
  averageTrust: number;
  totalRevenueRealized: number;
  averageRevenueRealized: number;
  confidenceAdjustment: number;
  rankingAdjustment: number;
  status: 'collecting_data' | 'active' | 'low_performing' | 'trusted';
}

export interface RulePerformanceSummary {
  ruleKey: string;
  category: string;
  sampleSize: number;
  status: LearningCalculationResult['status'];
  correctnessRate: number;
  actionRate: number;
  averageUsefulness: number;
  confidenceAdjustment: number;
  rankingAdjustment: number;
  totalRevenueRealized: number;
  lastCalculatedAt: string | null;
}

export interface FeedbackSubmission {
  recommendationId: string;
  feedbackType: RecommendationFeedbackType;
  usefulnessScore?: number;
  accuracyScore?: number;
  trustScore?: number;
  resultStatus?: RecommendationResultStatus;
  reasonCode?: string;
  comment?: string;
  realizedRevenue?: number;
  realizedTimeSavedMinutes?: number;
}

export interface LearningHealthStatus {
  shopId: string;
  totalRules: number;
  rulesCollectingData: number;
  rulesTrusted: number;
  rulesLowPerforming: number;
  rulesActive: number;
  totalFeedbackSubmitted: number;
  totalVerifiedAttributions: number;
  totalVerifiedRevenue: number;
  averageUsefulnessAllRules: number;
  lastRecalculatedAt: string | null;
  learningEnabled: boolean;
  adjustmentsEnabled: boolean;
}
