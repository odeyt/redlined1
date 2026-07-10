// SI-12: Learning Adapter — integrates with SI-11, non-blocking, flags must be ON

import { supabase } from '@/lib/supabase';

async function isFlagEnabled(flagKey: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', flagKey)
      .maybeSingle();
    return data?.enabled === true;
  } catch {
    return false;
  }
}

export async function recordSuggestionFeedback(input: {
  shopId: string;
  suggestionKey: string;
  feedbackType: 'accepted' | 'dismissed' | 'completed' | 'no_action';
  estimateApproved?: boolean;
  realizedRevenue?: number;
}): Promise<void> {
  try {
    const [learningOn, feedbackOn, outcomeOn] = await Promise.all([
      isFlagEnabled('intelligence_learning_engine'),
      isFlagEnabled('recommendation_feedback'),
      isFlagEnabled('service_advisor_outcome_tracking'),
    ]);

    if (!learningOn || !feedbackOn) return;

    // Map to SI-11 feedback type
    const feedbackTypeMap: Record<string, string> = {
      accepted: 'useful',
      dismissed: 'not_useful',
      completed: 'useful',
      no_action: 'not_useful',
    };

    await supabase.from('recommendation_learning_events').insert({
      shop_id: input.shopId,
      rule_key: `sa_${input.suggestionKey}`,
      event_type: `service_advisor_${input.feedbackType}`,
      metadata: {
        source: 'si12_service_advisor',
        suggestion_key: input.suggestionKey,
        feedback_type: feedbackTypeMap[input.feedbackType] ?? 'unknown',
        estimate_approved: input.estimateApproved ?? null,
      },
    });

    if (outcomeOn && input.realizedRevenue != null && input.estimateApproved) {
      await supabase.from('recommendation_value_attribution').insert({
        shop_id: input.shopId,
        recommendation_id: null,
        realized_revenue: input.realizedRevenue,
        attribution_status: 'pending',
        attribution_method: 'manual',
        metadata: { source: 'si12_service_advisor', suggestion_key: input.suggestionKey },
      });
    }
  } catch {
    // Non-blocking — never surface to caller
  }
}

export async function recordExplanationUsed(shopId: string, estimateId: string | null): Promise<void> {
  try {
    const on = await isFlagEnabled('intelligence_learning_engine');
    if (!on) return;

    await supabase.from('recommendation_learning_events').insert({
      shop_id: shopId,
      rule_key: 'sa_customer_explanation',
      event_type: 'explanation_used',
      metadata: { source: 'si12_service_advisor', estimate_id: estimateId },
    });
  } catch {
    // Non-blocking
  }
}

export async function recordFollowUpCompleted(shopId: string, estimateId: string): Promise<void> {
  try {
    const on = await isFlagEnabled('intelligence_learning_engine');
    if (!on) return;

    await supabase.from('recommendation_learning_events').insert({
      shop_id: shopId,
      rule_key: 'sa_follow_up',
      event_type: 'follow_up_completed',
      metadata: { source: 'si12_service_advisor', estimate_id: estimateId },
    });
  } catch {
    // Non-blocking
  }
}
