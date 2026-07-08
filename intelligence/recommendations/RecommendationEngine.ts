// RecommendationEngine — deterministic, no AI, no external calls.
// Runs registered rules against extracted signals, saves results to DB.
import type { Recommendation, RecommendationContext, RecommendationRuleResult } from './types';
import { ALL_RULES } from '../rules/RuleRegistry';
import { extractSignals } from '../signals/SignalExtractor';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

/**
 * Generate recommendations for a shop.
 * Extracts signals → runs rules → saves to DB. Never throws.
 */
export async function generateRecommendations(shopId: string): Promise<Recommendation[]> {
  try {
    const signals = await extractSignals(shopId);
    const ctx: RecommendationContext = {
      shopId,
      now: new Date(),
      signals,
      rawData: {},
    };

    const results: RecommendationRuleResult[] = [];
    for (const rule of ALL_RULES) {
      try {
        const result = rule.evaluate(ctx);
        if (result) results.push(result);
      } catch { /* individual rule failure must not stop others */ }
    }

    await saveRecommendations(shopId, results);
    return getOpenRecommendations(shopId);
  } catch {
    return [];
  }
}

/**
 * Save rule results to recommendations table.
 * Uses UPSERT on (shop_id, recommendation_key) — never duplicates.
 */
export async function saveRecommendations(shopId: string, results: RecommendationRuleResult[]): Promise<void> {
  if (results.length === 0) return;
  try {
    const db = await getDb();
    const rows = results.map(r => ({
      shop_id:             shopId,
      recommendation_key:  r.recommendationKey,
      category:            r.category,
      priority:            r.priority,
      title:               r.title,
      description:         r.description ?? '',
      reason:              r.reason ?? '',
      estimated_revenue:   r.estimatedRevenue ?? null,
      confidence:          r.confidence,
      status:              'open',
      source_entity_type:  r.sourceEntityType ?? null,
      source_entity_id:    r.sourceEntityId ?? null,
      action_payload:      { actions: r.actions },
      metadata:            {},
      expires_at:          r.expiresAt ?? null,
      updated_at:          new Date().toISOString(),
    }));

    await db.from('recommendations').upsert(rows, {
      onConflict: 'shop_id,recommendation_key',
      ignoreDuplicates: false,
    });
  } catch { /* fail silently */ }
}

/**
 * Get all open recommendations for a shop.
 */
export async function getOpenRecommendations(shopId: string): Promise<Recommendation[]> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('recommendations')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'open')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Dismiss a recommendation.
 */
export async function dismissRecommendation(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('recommendations').update({
      status:       'dismissed',
      dismissed_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }).eq('id', id);
  } catch { /* fail silently */ }
}

/**
 * Mark a recommendation as completed.
 */
export async function completeRecommendation(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('recommendations').update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }).eq('id', id);
  } catch { /* fail silently */ }
}

/**
 * Expire old open recommendations (> 7 days old, still open).
 */
export async function expireOldRecommendations(shopId: string): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    await db.from('recommendations').update({
      status:     'expired',
      updated_at: new Date().toISOString(),
    })
      .eq('shop_id', shopId)
      .eq('status', 'open')
      .lt('updated_at', cutoff.toISOString());
  } catch { /* fail silently */ }
}

function mapRow(r: Record<string, unknown>): Recommendation {
  return {
    id:                  r.id as string,
    shopId:              r.shop_id as string,
    recommendationKey:   r.recommendation_key as string,
    category:            r.category as Recommendation['category'],
    priority:            r.priority as Recommendation['priority'],
    title:               r.title as string,
    description:         r.description as string | undefined,
    reason:              r.reason as string | undefined,
    estimatedRevenue:    r.estimated_revenue as number | null,
    confidence:          Number(r.confidence ?? 0),
    status:              r.status as Recommendation['status'],
    sourceEventId:       r.source_event_id as string | null,
    sourceEntityType:    r.source_entity_type as string | null,
    sourceEntityId:      r.source_entity_id as string | null,
    actionType:          r.action_type as string | null,
    actionPayload:       (r.action_payload as Record<string, unknown>) ?? {},
    metadata:            (r.metadata as Record<string, unknown>) ?? {},
    expiresAt:           r.expires_at as string | null,
    createdAt:           r.created_at as string,
    updatedAt:           r.updated_at as string,
    completedAt:         r.completed_at as string | null,
    dismissedAt:         r.dismissed_at as string | null,
  };
}
