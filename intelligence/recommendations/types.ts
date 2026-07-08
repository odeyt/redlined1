export type RecommendationCategory =
  | 'revenue'
  | 'operations'
  | 'customer_followup'
  | 'unpaid_invoices'
  | 'estimates'
  | 'inventory'
  | 'technician'
  | 'repair_intelligence'
  | 'risk'
  | 'growth'
  | 'system';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationStatus = 'open' | 'completed' | 'dismissed' | 'expired';

export interface RecommendationAction {
  id?: string;
  shopId: string;
  recommendationId?: string;
  actionLabel: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  status: 'available' | 'completed';
  createdAt?: string;
  completedAt?: string | null;
}

export interface Recommendation {
  id?: string;
  shopId: string;
  recommendationKey: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description?: string;
  reason?: string;
  estimatedRevenue?: number | null;
  confidence: number;
  status: RecommendationStatus;
  sourceEventId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actionType?: string | null;
  actionPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
  actions?: RecommendationAction[];
}

export interface RecommendationRuleResult {
  recommendationKey: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  reason: string;
  estimatedRevenue?: number | null;
  confidence: number;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actions: Array<{ label: string; actionType: string; payload?: Record<string, unknown> }>;
  expiresAt?: string | null;
}

export interface RecommendationContext {
  shopId: string;
  now: Date;
  signals: Record<string, number | string | null>;
  rawData: Record<string, unknown>;
}

export interface RecommendationRule {
  key: string;
  evaluate(ctx: RecommendationContext): RecommendationRuleResult | null;
}
