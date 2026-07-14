/**
 * lib/platform/SelfImprovingLoop.ts
 *
 * Every completed repair becomes training evidence.
 * Every verified repair increases confidence in related patterns.
 * Every failed recommendation decreases confidence.
 * Historical evidence is NEVER overwritten — full audit trail maintained.
 *
 * This is the core feedback mechanism that makes the platform increasingly
 * valuable as more verified repair data is collected.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type FeedbackSignal =
  | 'repair_verified_resolved'   // +confidence
  | 'repair_verified_comeback'   // -confidence
  | 'recommendation_accepted'   // +confidence
  | 'recommendation_declined'   // -confidence (mild)
  | 'diagnosis_correct'         // +confidence
  | 'diagnosis_incorrect';      // -confidence

export interface LearningEvent {
  signalType: FeedbackSignal;
  shopId: string;
  targetId: string;               // pattern ID, recommendation ID, etc.
  targetType: 'repair_pattern' | 'insight' | 'recommendation' | 'hypothesis';
  vehicleId?: string;
  technicianId?: string;
  notes?: string;
  occurredAt: string;
}

const SIGNAL_DELTA: Record<FeedbackSignal, number> = {
  repair_verified_resolved:  +5,
  diagnosis_correct:         +3,
  recommendation_accepted:   +2,
  recommendation_declined:   -1,
  diagnosis_incorrect:       -3,
  repair_verified_comeback:  -5,
};

const CONFIDENCE_FLOOR = 10;   // never drops below this
const CONFIDENCE_CEILING = 100;

export class SelfImprovingLoop {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Apply a learning signal. Updates confidence in the target entity.
   * Writes an immutable audit record — never overwrites previous signals.
   */
  async applySignal(event: LearningEvent): Promise<void> {
    const delta = SIGNAL_DELTA[event.signalType];

    // Write immutable audit record first — never skip this
    await this.supabase.from('rd1_learning_events').insert({
      signal_type: event.signalType,
      shop_id: event.shopId,
      target_id: event.targetId,
      target_type: event.targetType,
      delta,
      vehicle_id: event.vehicleId ?? null,
      technician_id: event.technicianId ?? null,
      notes: event.notes ?? null,
      occurred_at: event.occurredAt,
    });

    // Update confidence on the target entity
    if (event.targetType === 'repair_pattern') {
      await this.updateRepairPatternConfidence(event.targetId, delta);
    } else if (event.targetType === 'insight') {
      await this.updateInsightOutcome(event.targetId, event.signalType);
    }
  }

  private async updateRepairPatternConfidence(patternId: string, delta: number): Promise<void> {
    const { data: pattern } = await this.supabase
      .from('rd1_repair_patterns')
      .select('confidence_score, evidence_count')
      .eq('id', patternId)
      .single();

    if (!pattern) return;

    const newScore = Math.max(
      CONFIDENCE_FLOOR,
      Math.min(CONFIDENCE_CEILING, pattern.confidence_score + delta),
    );

    await this.supabase
      .from('rd1_repair_patterns')
      .update({
        confidence_score: newScore,
        evidence_count: delta > 0 ? pattern.evidence_count + 1 : pattern.evidence_count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patternId);
  }

  private async updateInsightOutcome(insightId: string, signal: FeedbackSignal): Promise<void> {
    const isPositive = SIGNAL_DELTA[signal] > 0;
    await this.supabase
      .from('rd1_platform_insights')
      .update({
        metadata: this.supabase.rpc as unknown as Record<string, unknown>,
      })
      .eq('insight_id', insightId);

    // Track outcome on the insight for future model calibration
    await this.supabase.from('rd1_insight_outcomes').insert({
      insight_id: insightId,
      signal_type: signal,
      was_positive: isPositive,
      occurred_at: new Date().toISOString(),
    });
  }

  /**
   * Anonymize and promote high-confidence shop-specific patterns to global patterns.
   * Runs as a background job. Only promotes patterns with evidence_count >= 5 and
   * confidence_score >= 80 and success_rate >= 0.85.
   */
  async promoteToGlobalPatterns(shopId: string): Promise<number> {
    const { data: candidates } = await this.supabase
      .from('rd1_repair_patterns')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_global', false)
      .gte('evidence_count', 5)
      .gte('confidence_score', 80)
      .gte('success_rate', 0.85);

    if (!candidates?.length) return 0;

    let promoted = 0;
    for (const pattern of candidates) {
      // Check if a global pattern for this DTC+root_cause already exists
      const globalKey = [
        'global',
        (pattern.dtc_codes as string[]).sort().join(','),
        (pattern.confirmed_root_cause as string).toLowerCase().trim(),
      ].join('|');

      const { data: existing } = await this.supabase
        .from('rd1_repair_patterns')
        .select('id, evidence_count, success_rate, confidence_score')
        .eq('pattern_key', globalKey)
        .maybeSingle();

      if (existing) {
        // Merge evidence into existing global pattern
        const n = existing.evidence_count;
        const m = pattern.evidence_count as number;
        await this.supabase.from('rd1_repair_patterns').update({
          evidence_count: n + m,
          success_rate: (existing.success_rate * n + (pattern.success_rate as number) * m) / (n + m),
          confidence_score: Math.min(100, existing.confidence_score + Math.floor(m * 2)),
          last_verified_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        // Create new global anonymous pattern
        await this.supabase.from('rd1_repair_patterns').insert({
          shop_id: null,
          pattern_key: globalKey,
          is_global: true,
          make: pattern.make,
          model: null,               // anonymize specific model
          engine_code: pattern.engine_code,
          dtc_codes: pattern.dtc_codes,
          symptoms: pattern.symptoms,
          confirmed_root_cause: pattern.confirmed_root_cause,
          repair_procedure: pattern.repair_procedure,
          parts_required: pattern.parts_required,
          avg_repair_time_minutes: pattern.avg_repair_time_minutes,
          avg_parts_cost: 0,         // anonymize cost
          success_rate: pattern.success_rate,
          comeback_rate: pattern.comeback_rate,
          evidence_count: pattern.evidence_count,
          confidence_score: pattern.confidence_score,
          last_verified_at: new Date().toISOString(),
        });
        promoted++;
      }
    }

    return promoted;
  }
}
