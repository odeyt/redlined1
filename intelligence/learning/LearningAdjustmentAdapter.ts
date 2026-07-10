// SI-11: Learning Adjustment Adapter
// Applies learned confidence/ranking adjustments to existing recommendations.
// Returns the base recommendation unchanged on any failure — never throws.

import { getAdminDb } from '@/lib/supabaseServer';
import { MINIMUM_SAMPLE_SIZE } from './IntelligenceLearningEngine';

async function isAdjustmentsEnabled(_shopId: string): Promise<boolean> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'learning_score_adjustments')
      .maybeSingle();
    return !!(data as { enabled?: boolean } | null)?.enabled;
  } catch {
    return false;
  }
}

export async function getConfidenceAdjustment(shopId: string, ruleKey: string): Promise<number> {
  try {
    if (!(await isAdjustmentsEnabled(shopId))) return 0;
    const db = getAdminDb();
    const { data } = await db
      .from('recommendation_learning_profiles')
      .select('learned_confidence_adjustment, sample_size')
      .eq('shop_id', shopId)
      .eq('rule_key', ruleKey)
      .maybeSingle();
    if (!data) return 0;
    const row = data as { learned_confidence_adjustment: number; sample_size: number };
    if (row.sample_size < MINIMUM_SAMPLE_SIZE) return 0;
    return row.learned_confidence_adjustment ?? 0;
  } catch {
    return 0;
  }
}

export async function getRankingAdjustment(shopId: string, ruleKey: string): Promise<number> {
  try {
    if (!(await isAdjustmentsEnabled(shopId))) return 0;
    const db = getAdminDb();
    const { data } = await db
      .from('recommendation_learning_profiles')
      .select('ranking_adjustment, sample_size')
      .eq('shop_id', shopId)
      .eq('rule_key', ruleKey)
      .maybeSingle();
    if (!data) return 0;
    const row = data as { ranking_adjustment: number; sample_size: number };
    if (row.sample_size < MINIMUM_SAMPLE_SIZE) return 0;
    return row.ranking_adjustment ?? 0;
  } catch {
    return 0;
  }
}

interface BaseRecommendation {
  id: string;
  shopId: string;
  recommendationKey: string;
  confidence: number;
  score?: number;
  metadata?: Record<string, unknown>;
}

export type LearningAdjustedRecommendation<T extends BaseRecommendation> = T & {
  learningAdjustment?: {
    confidenceDelta: number;
    rankingDelta: number;
    reason: string;
    sampleSize: number;
  };
};

export async function applyLearningAdjustment<T extends BaseRecommendation>(
  base: T,
): Promise<T & { learningAdjustment?: { confidenceDelta: number; rankingDelta: number; reason: string; sampleSize: number } }> {
  try {
    const [confAdj, rankAdj] = await Promise.all([
      getConfidenceAdjustment(base.shopId, base.recommendationKey),
      getRankingAdjustment(base.shopId, base.recommendationKey),
    ]);

    if (confAdj === 0 && rankAdj === 0) return base;

    const db = getAdminDb();
    const { data: profile } = await db
      .from('recommendation_learning_profiles')
      .select('sample_size')
      .eq('shop_id', base.shopId)
      .eq('rule_key', base.recommendationKey)
      .maybeSingle();
    const sampleSize = (profile as { sample_size?: number } | null)?.sample_size ?? 0;

    return {
      ...base,
      confidence: base.confidence + confAdj,
      learningAdjustment: {
        confidenceDelta: confAdj,
        rankingDelta:    rankAdj,
        reason:          `Learned from ${sampleSize} verified outcomes`,
        sampleSize,
      },
    };
  } catch {
    return base; // always return base on failure
  }
}
