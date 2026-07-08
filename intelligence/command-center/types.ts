// Owner Command Center contract — types only. No UI built in SI-2.
import type { Recommendation } from '../recommendations/types';
import type { IntelligenceSignal } from '../signals/types';

export interface CommandCenterRisk {
  key: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CommandCenterSummary {
  shopHealthScore: number;               // 0–100
  revenueToday: number;
  revenueOpportunity: number;            // sum of estimated_revenue from open recommendations
  criticalRecommendations: number;
  highPriorityRecommendations: number;
  openRecommendations: Recommendation[];
  risks: CommandCenterRisk[];
  signals: IntelligenceSignal[];
  lastUpdated: string;                   // ISO 8601
}
