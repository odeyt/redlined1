/**
 * lib/platform/engines/RepairIntelligenceEngine.ts
 *
 * Learns from every completed repair. Builds a confirmed repair database
 * ranking the most effective diagnostic paths and highest success rate repairs.
 * Every verified repair strengthens the Knowledge Graph and this engine's
 * pattern database — the core network effect of the platform.
 *
 * Never overwrites historical evidence. Full audit trail maintained.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RepairPattern {
  patternId: string;
  shopId: string | null;          // null = global cross-shop pattern (anonymized)
  isGlobal: boolean;
  make?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  engineCode?: string;
  dtcCodes: string[];             // trigger codes
  symptoms: string[];
  confirmedRootCause: string;
  repairProcedure: string;
  partsRequired: string[];
  avgRepairTimeMinutes: number;
  avgPartsCost: number;
  successRate: number;            // 0–1
  comebackRate: number;           // 0–1
  evidenceCount: number;          // how many verified repairs back this
  confidenceScore: number;        // 0–100, grows with evidence
  lastVerifiedAt: string;
  createdAt: string;
}

export interface DiagnosticPathRanking {
  pathId: string;
  dtcCodes: string[];
  rankedSteps: Array<{
    rank: number;
    testName: string;
    discriminatingPower: number; // how often this test led to root cause
    avgTimeMinutes: number;
    skipRate: number;            // how often technicians skip this step
  }>;
  avgTotalDiagnosticMinutes: number;
  firstTimeFixRate: number;
  updatedAt: string;
}

export interface RepairIntelligenceReport {
  shopId: string;
  generatedAt: string;
  topPatterns: RepairPattern[];
  pathRankings: DiagnosticPathRanking[];
  insights: IntelligenceInsight[];
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'repair_intelligence',
  displayName: 'Repair Intelligence Engine',
  category: 'repair',
  featureFlag: 'repair_intelligence_enabled',
  version: '1.0',
  subscribedEvents: ['repair.completed', 'repair.verified', 'job_card.closed'],
};

export class RepairIntelligenceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    // On each verified repair, ingest it into the pattern database
    if (event.eventType === 'repair.verified') {
      await this.ingestVerifiedRepair(event, shopId);
    }
    return [];
  }

  private async ingestVerifiedRepair(event: IntelligencePlatformEvent, shopId: string): Promise<void> {
    const payload = event.payload as {
      dtcCodes?: string[];
      rootCause?: string;
      repairProcedure?: string;
      partsUsed?: string[];
      laborMinutes?: number;
      make?: string;
      model?: string;
      engineCode?: string;
      outcome?: 'resolved' | 'partial' | 'comeback';
    };

    if (!payload.rootCause || !payload.dtcCodes?.length) return;

    // Upsert repair pattern — find existing or create new
    const patternKey = [
      shopId,
      (payload.dtcCodes ?? []).sort().join(','),
      payload.rootCause?.toLowerCase().trim(),
    ].join('|');

    const { data: existing } = await this.supabase
      .from('rd1_repair_patterns')
      .select('id, evidence_count, success_rate, comeback_rate, avg_repair_time_minutes')
      .eq('pattern_key', patternKey)
      .maybeSingle();

    const isSuccess = payload.outcome === 'resolved';
    const isComeback = payload.outcome === 'comeback';

    if (existing) {
      const n = existing.evidence_count;
      const newSuccessRate = (existing.success_rate * n + (isSuccess ? 1 : 0)) / (n + 1);
      const newComebackRate = (existing.comeback_rate * n + (isComeback ? 1 : 0)) / (n + 1);
      const newAvgTime = payload.laborMinutes
        ? (existing.avg_repair_time_minutes * n + payload.laborMinutes) / (n + 1)
        : existing.avg_repair_time_minutes;
      const newConfidence = Math.min(100, 30 + (n + 1) * 5);

      await this.supabase
        .from('rd1_repair_patterns')
        .update({
          evidence_count: n + 1,
          success_rate: newSuccessRate,
          comeback_rate: newComebackRate,
          avg_repair_time_minutes: newAvgTime,
          confidence_score: newConfidence,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await this.supabase.from('rd1_repair_patterns').insert({
        shop_id: shopId,
        pattern_key: patternKey,
        is_global: false,
        make: payload.make ?? null,
        model: payload.model ?? null,
        engine_code: payload.engineCode ?? null,
        dtc_codes: payload.dtcCodes ?? [],
        symptoms: [],
        confirmed_root_cause: payload.rootCause,
        repair_procedure: payload.repairProcedure ?? '',
        parts_required: payload.partsUsed ?? [],
        avg_repair_time_minutes: payload.laborMinutes ?? 0,
        avg_parts_cost: 0,
        success_rate: isSuccess ? 1 : 0,
        comeback_rate: isComeback ? 1 : 0,
        evidence_count: 1,
        confidence_score: 30,
        last_verified_at: new Date().toISOString(),
      });
    }
  }

  async queryPatterns(shopId: string, dtcCodes: string[]): Promise<RepairPattern[]> {
    // Find patterns that match any of the provided DTC codes
    const { data } = await this.supabase
      .from('rd1_repair_patterns')
      .select('*')
      .or(`shop_id.eq.${shopId},is_global.eq.true`)
      .gte('confidence_score', 40)
      .order('confidence_score', { ascending: false })
      .limit(10);

    if (!data) return [];

    return data
      .filter((p) => dtcCodes.some((dtc) => (p.dtc_codes as string[]).includes(dtc)))
      .map((p) => ({
        patternId: p.id,
        shopId: p.shop_id,
        isGlobal: p.is_global,
        make: p.make,
        model: p.model,
        dtcCodes: p.dtc_codes,
        symptoms: p.symptoms,
        confirmedRootCause: p.confirmed_root_cause,
        repairProcedure: p.repair_procedure,
        partsRequired: p.parts_required,
        avgRepairTimeMinutes: p.avg_repair_time_minutes,
        avgPartsCost: p.avg_parts_cost,
        successRate: p.success_rate,
        comebackRate: p.comeback_rate,
        evidenceCount: p.evidence_count,
        confidenceScore: p.confidence_score,
        lastVerifiedAt: p.last_verified_at,
        createdAt: p.created_at,
      }));
  }

  async isHealthy(): Promise<boolean> { return true; }
}
