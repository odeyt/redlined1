// SI-11: Intelligence Learning Engine
// Deterministic only. No AI. No embeddings. No external calls.
// All functions return safe fallbacks on failure — never throws.

import { getAdminDb } from '@/lib/supabaseServer';
import { calculateRuleProfile } from './LearningScoring';
import type {
  FeedbackSubmission,
  LearningCalculationResult,
  LearningHealthStatus,
  RulePerformanceSummary,
} from './types';

export const MINIMUM_SAMPLE_SIZE = 20;

// ── Submit Feedback ───────────────────────────────────────────────────────────

export async function submitFeedback(
  shopId: string,
  userId: string | null,
  input: FeedbackSubmission,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getAdminDb();

    // Validate scores 1-5
    if (input.usefulnessScore !== undefined && (input.usefulnessScore < 1 || input.usefulnessScore > 5)) {
      return { ok: false, error: 'usefulness_score must be 1-5' };
    }
    if (input.accuracyScore !== undefined && (input.accuracyScore < 1 || input.accuracyScore > 5)) {
      return { ok: false, error: 'accuracy_score must be 1-5' };
    }
    if (input.trustScore !== undefined && (input.trustScore < 1 || input.trustScore > 5)) {
      return { ok: false, error: 'trust_score must be 1-5' };
    }

    const { error } = await db.from('recommendation_feedback').insert({
      shop_id:          shopId,
      recommendation_id: input.recommendationId,
      user_id:          userId,
      feedback_type:    input.feedbackType,
      usefulness_score: input.usefulnessScore ?? null,
      accuracy_score:   input.accuracyScore ?? null,
      trust_score:      input.trustScore ?? null,
      result_status:    input.resultStatus ?? 'unknown',
      reason_code:      input.reasonCode ?? null,
      comment:          input.comment ?? null,
      metadata:         {},
    });

    if (error) return { ok: false, error: error.message };

    // If realized revenue/time provided, create attribution record (fire and forget)
    if (input.realizedRevenue !== undefined || input.realizedTimeSavedMinutes !== undefined) {
      void Promise.resolve(
        db.from('recommendation_value_attribution').insert({
          shop_id:                     shopId,
          recommendation_id:           input.recommendationId,
          realized_revenue:            input.realizedRevenue ?? null,
          realized_time_saved_minutes: input.realizedTimeSavedMinutes ?? null,
          attribution_status:          'pending',
          attribution_method:          'manual',
          metadata:                    {},
        }),
      ).catch(() => { /* silent fire-and-forget */ });
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'internal_error' };
  }
}

// ── Calculate Rule Learning Profile ──────────────────────────────────────────

export async function calculateRuleLearningProfile(
  shopId: string,
  ruleKey: string,
): Promise<LearningCalculationResult | null> {
  try {
    const db = getAdminDb();

    // Get feedback for this rule's recommendations
    const { data: recIds } = await db
      .from('recommendations')
      .select('id')
      .eq('shop_id', shopId)
      .eq('recommendation_key', ruleKey);

    const ids = (recIds ?? []).map((r: { id: string }) => r.id);

    const { data: feedbackRows } = ids.length > 0
      ? await db
          .from('recommendation_feedback')
          .select('*')
          .eq('shop_id', shopId)
          .in('recommendation_id', ids)
      : { data: [] };

    // Get recommendation counts
    const { count: totalRecs }     = await db
      .from('recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('recommendation_key', ruleKey);

    const { count: completedCount } = await db
      .from('recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('recommendation_key', ruleKey)
      .eq('status', 'completed');

    const { count: dismissedCount } = await db
      .from('recommendations')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('recommendation_key', ruleKey)
      .eq('status', 'dismissed');

    // Get verified attributions
    const { data: attributionRows } = ids.length > 0
      ? await db
          .from('recommendation_value_attribution')
          .select('*')
          .eq('shop_id', shopId)
          .eq('attribution_status', 'verified')
          .in('recommendation_id', ids)
      : { data: [] };

    const { data: catRow } = await db
      .from('recommendations')
      .select('category')
      .eq('shop_id', shopId)
      .eq('recommendation_key', ruleKey)
      .limit(1)
      .maybeSingle();

    const category = (catRow as { category?: string } | null)?.category ?? 'general';

    // Map DB rows to typed objects
    const typedFeedback = (feedbackRows ?? []).map((r: Record<string, unknown>) => ({
      id:               r.id as string,
      shopId:           r.shop_id as string,
      recommendationId: r.recommendation_id as string,
      userId:           r.user_id as string | null,
      feedbackType:     r.feedback_type as import('./types').RecommendationFeedbackType,
      usefulnessScore:  r.usefulness_score as number | null,
      accuracyScore:    r.accuracy_score as number | null,
      trustScore:       r.trust_score as number | null,
      resultStatus:     r.result_status as import('./types').RecommendationResultStatus | null,
      reasonCode:       r.reason_code as string | null,
      comment:          r.comment as string | null,
      metadata:         (r.metadata ?? {}) as Record<string, unknown>,
      createdAt:        r.created_at as string,
      updatedAt:        r.updated_at as string,
    }));

    const typedAttributions = (attributionRows ?? []).map((r: Record<string, unknown>) => ({
      id:                         r.id as string,
      shopId:                     r.shop_id as string,
      recommendationId:           r.recommendation_id as string,
      sourceEntityType:           r.source_entity_type as string | null,
      sourceEntityId:             r.source_entity_id as string | null,
      expectedRevenue:            r.expected_revenue as number | null,
      realizedRevenue:            r.realized_revenue as number | null,
      expectedTimeSavedMinutes:   r.expected_time_saved_minutes as number | null,
      realizedTimeSavedMinutes:   r.realized_time_saved_minutes as number | null,
      riskReductionScore:         r.risk_reduction_score as number | null,
      attributionStatus:          r.attribution_status as 'pending' | 'verified' | 'rejected',
      attributionMethod:          r.attribution_method as 'manual' | 'automatic',
      verifiedBy:                 r.verified_by as string | null,
      verifiedAt:                 r.verified_at as string | null,
      metadata:                   (r.metadata ?? {}) as Record<string, unknown>,
      createdAt:                  r.created_at as string,
      updatedAt:                  r.updated_at as string,
    }));

    return calculateRuleProfile({
      shopId,
      ruleKey,
      category,
      feedbackRows: typedFeedback,
      attributionRows: typedAttributions,
      totalRecommendations: totalRecs ?? 0,
      actedUponCount: completedCount ?? 0,
      completedCount: completedCount ?? 0,
      dismissedCount: dismissedCount ?? 0,
    });
  } catch {
    return null;
  }
}

// ── Recalculate All Profiles for Shop ────────────────────────────────────────

export async function recalculateShopLearningProfiles(
  shopId: string,
): Promise<{ updated: number; skipped: number }> {
  try {
    const db = getAdminDb();

    // Get all distinct rule keys for this shop
    const { data: ruleRows } = await db
      .from('recommendations')
      .select('recommendation_key, category')
      .eq('shop_id', shopId);

    const rules = [
      ...new Map(
        (ruleRows ?? []).map((r: { recommendation_key: string; category: string }) => [r.recommendation_key, r]),
      ).values(),
    ] as Array<{ recommendation_key: string; category: string }>;

    let updated = 0;
    let skipped = 0;

    for (const rule of rules) {
      const result = await calculateRuleLearningProfile(shopId, rule.recommendation_key);
      if (!result) { skipped++; continue; }

      await db.from('recommendation_learning_profiles').upsert({
        shop_id:                       shopId,
        rule_key:                      rule.recommendation_key,
        category:                      rule.category,
        total_recommendations:         result.sampleSize,
        correct_count:                 0,
        incorrect_count:               0,
        partially_correct_count:       0,
        successful_outcome_count:      0,
        failed_outcome_count:          0,
        total_revenue_realized:        result.totalRevenueRealized,
        average_revenue_realized:      result.averageRevenueRealized,
        average_usefulness:            result.averageUsefulness,
        average_accuracy:              result.averageAccuracy,
        average_trust:                 result.averageTrust,
        learned_confidence_adjustment: result.confidenceAdjustment,
        ranking_adjustment:            result.rankingAdjustment,
        sample_size:                   result.sampleSize,
        last_calculated_at:            new Date().toISOString(),
        updated_at:                    new Date().toISOString(),
      }, { onConflict: 'shop_id,rule_key' });

      // Audit log
      await db.from('recommendation_learning_events').insert({
        shop_id:    shopId,
        rule_key:   rule.recommendation_key,
        event_type: 'profile_recalculated',
        new_value:  result.confidenceAdjustment,
        reason:     `sample_size=${result.sampleSize} status=${result.status}`,
        metadata:   { status: result.status },
      });

      updated++;
    }

    return { updated, skipped };
  } catch {
    return { updated: 0, skipped: 0 };
  }
}

// ── Get Rule Performance ──────────────────────────────────────────────────────

export async function getRulePerformance(
  shopId: string,
  ruleKey: string,
): Promise<RulePerformanceSummary | null> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from('recommendation_learning_profiles')
      .select('*')
      .eq('shop_id', shopId)
      .eq('rule_key', ruleKey)
      .maybeSingle();

    if (!data) return null;

    const row = data as Record<string, unknown>;

    return {
      ruleKey:               row.rule_key as string,
      category:              row.category as string,
      sampleSize:            row.sample_size as number,
      status:                (row.sample_size as number) < MINIMUM_SAMPLE_SIZE ? 'collecting_data' : 'active',
      correctnessRate:       0, // computed live from feedback
      actionRate:            (row.total_recommendations as number) > 0
        ? (row.acted_upon_count as number) / (row.total_recommendations as number)
        : 0,
      averageUsefulness:     row.average_usefulness as number,
      confidenceAdjustment:  row.learned_confidence_adjustment as number,
      rankingAdjustment:     row.ranking_adjustment as number,
      totalRevenueRealized:  row.total_revenue_realized as number,
      lastCalculatedAt:      row.last_calculated_at as string | null,
    };
  } catch {
    return null;
  }
}

// ── Get Shop Learning Summary ─────────────────────────────────────────────────

export async function getShopLearningSummary(shopId: string): Promise<LearningHealthStatus | null> {
  try {
    const db = getAdminDb();

    const { data: profiles } = await db
      .from('recommendation_learning_profiles')
      .select('*')
      .eq('shop_id', shopId);

    const { count: feedbackCount } = await db
      .from('recommendation_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId);

    const { data: verifiedAttributions } = await db
      .from('recommendation_value_attribution')
      .select('realized_revenue')
      .eq('shop_id', shopId)
      .eq('attribution_status', 'verified');

    const { data: learningFlag } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'intelligence_learning_engine')
      .maybeSingle();

    const { data: adjustFlag } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'learning_score_adjustments')
      .maybeSingle();

    const ps  = (profiles ?? []) as Array<Record<string, unknown>>;
    const attrs = (verifiedAttributions ?? []) as Array<{ realized_revenue: number | null }>;
    const totalRevenue = attrs.reduce((s, a) => s + (a.realized_revenue ?? 0), 0);
    const usefulnessAll = ps.filter(p => (p.average_usefulness as number) > 0);

    return {
      shopId,
      totalRules:              ps.length,
      rulesCollectingData:     ps.filter(p => (p.sample_size as number) < MINIMUM_SAMPLE_SIZE).length,
      rulesTrusted:            ps.filter(p =>
        (p.sample_size as number) >= MINIMUM_SAMPLE_SIZE &&
        (p.learned_confidence_adjustment as number) > 3
      ).length,
      rulesLowPerforming:      ps.filter(p =>
        (p.sample_size as number) >= MINIMUM_SAMPLE_SIZE &&
        (p.learned_confidence_adjustment as number) < -3
      ).length,
      rulesActive:             ps.filter(p => (p.sample_size as number) >= MINIMUM_SAMPLE_SIZE).length,
      totalFeedbackSubmitted:  feedbackCount ?? 0,
      totalVerifiedAttributions: attrs.length,
      totalVerifiedRevenue:    totalRevenue,
      averageUsefulnessAllRules: usefulnessAll.length > 0
        ? usefulnessAll.reduce((s, p) => s + (p.average_usefulness as number), 0) / usefulnessAll.length
        : 0,
      lastRecalculatedAt: ps.reduce((latest, p) => {
        const t = p.last_calculated_at as string | null;
        if (!t) return latest;
        if (!latest) return t;
        return t > latest ? t : latest;
      }, null as string | null),
      learningEnabled:     !!(learningFlag as { enabled?: boolean } | null)?.enabled,
      adjustmentsEnabled:  !!(adjustFlag as { enabled?: boolean } | null)?.enabled,
    };
  } catch {
    return null;
  }
}

// Alias for external consumers
export async function getLearningHealth(shopId: string): Promise<LearningHealthStatus | null> {
  return getShopLearningSummary(shopId);
}
