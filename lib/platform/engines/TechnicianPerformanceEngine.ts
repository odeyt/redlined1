/**
 * lib/platform/engines/TechnicianPerformanceEngine.ts
 *
 * Measures diagnostic accuracy, average diagnostic time, comeback rate,
 * first-time fix rate, and efficiency. Generates technician scorecards
 * and personalized training recommendations based on knowledge gaps.
 *
 * Scorecards are visible to shop owners/managers only — never to the technician's
 * peers unless explicitly shared by the owner.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TechnicianScorecard {
  technicianId: string;
  technicianName: string;
  shopId: string;
  periodDays: number;
  generatedAt: string;

  // Core KPIs
  totalJobCards: number;
  firstTimeFixRate: number;        // 0–1
  comebackRate: number;            // 0–1
  avgDiagnosticMinutes: number;
  avgRepairMinutes: number;
  totalRevenue: number;            // billable revenue attributed

  // Quality indicators
  diagnosticAccuracyScore: number; // 0–100, deterministic
  efficiencyScore: number;         // 0–100 (actual vs estimated labor)
  overallScore: number;            // 0–100, weighted composite

  // Knowledge profile
  strongSystems: string[];         // where first-time fix > 90%
  weakSystems: string[];           // where comeback rate > 10%
  certifiedSystems: string[];      // from technician profile

  // Training
  trainingRecommendations: TrainingRecommendation[];
  knowledgeGaps: string[];

  // Trend
  scoreTrend: 'improving' | 'stable' | 'declining';
  previousScore?: number;
}

export interface TrainingRecommendation {
  topic: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  resourceType: 'tsb' | 'course' | 'mentor' | 'practice';
  relatedDtcCodes?: string[];
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'technician_performance',
  displayName: 'Technician Performance Engine',
  category: 'technician',
  featureFlag: 'technician_performance_enabled',
  version: '1.0',
  subscribedEvents: ['repair.completed', 'repair.verified', 'job_card.closed'],
};

export class TechnicianPerformanceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    if (!event.technicianId) return [];
    const scorecard = await this.generateScorecard(shopId, event.technicianId, 90);
    return this.generateInsights(scorecard);
  }

  async generateScorecard(shopId: string, technicianId: string, periodDays: number): Promise<TechnicianScorecard> {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();

    const { data: jobCards } = await this.supabase
      .from('job_cards')
      .select('id, technician_id, total_cost, is_comeback, services_performed, created_at, closed_at, dtc_codes, system_category')
      .eq('shop_id', shopId)
      .eq('technician_id', technicianId)
      .gte('created_at', since)
      .not('closed_at', 'is', null);

    const { data: techProfile } = await this.supabase
      .from('shop_users')
      .select('name, certifications')
      .eq('user_id', technicianId)
      .eq('shop_id', shopId)
      .maybeSingle();

    const cards = jobCards ?? [];
    const totalJobCards = cards.length;
    const comebacks = cards.filter((c) => c.is_comeback).length;
    const comebackRate = totalJobCards > 0 ? comebacks / totalJobCards : 0;
    const firstTimeFixRate = 1 - comebackRate;
    const totalRevenue = cards.reduce((s, c) => s + (c.total_cost ?? 0), 0);

    // System breakdown
    const systemMap = new Map<string, { total: number; comebacks: number }>();
    for (const card of cards) {
      const sys = (card.system_category as string) ?? 'Unknown';
      const entry = systemMap.get(sys) ?? { total: 0, comebacks: 0 };
      entry.total++;
      if (card.is_comeback) entry.comebacks++;
      systemMap.set(sys, entry);
    }

    const strongSystems = Array.from(systemMap.entries())
      .filter(([, v]) => v.total >= 3 && (1 - v.comebacks / v.total) >= 0.9)
      .map(([k]) => k);
    const weakSystems = Array.from(systemMap.entries())
      .filter(([, v]) => v.total >= 2 && v.comebacks / v.total >= 0.1)
      .map(([k]) => k);

    const diagnosticAccuracyScore = Math.round(firstTimeFixRate * 100);
    const efficiencyScore = 75; // placeholder — needs estimated vs actual labor
    const overallScore = Math.round(diagnosticAccuracyScore * 0.6 + efficiencyScore * 0.4);

    const trainingRecommendations: TrainingRecommendation[] = weakSystems.map((sys) => ({
      topic: sys,
      reason: `Comeback rate in ${sys} exceeds 10%`,
      priority: 'high' as const,
      resourceType: 'mentor' as const,
    }));

    return {
      technicianId,
      technicianName: (techProfile as { name?: string } | null)?.name ?? 'Unknown',
      shopId,
      periodDays,
      generatedAt: now,
      totalJobCards,
      firstTimeFixRate,
      comebackRate,
      avgDiagnosticMinutes: 45, // placeholder
      avgRepairMinutes: 120,    // placeholder
      totalRevenue,
      diagnosticAccuracyScore,
      efficiencyScore,
      overallScore,
      strongSystems,
      weakSystems,
      certifiedSystems: ((techProfile as { certifications?: string[] } | null)?.certifications) ?? [],
      trainingRecommendations,
      knowledgeGaps: weakSystems,
      scoreTrend: 'stable',
    };
  }

  private generateInsights(scorecard: TechnicianScorecard): IntelligenceInsight[] {
    const insights: IntelligenceInsight[] = [];
    const base = { engineId: this.config.engineId, shopId: scorecard.shopId, entityId: scorecard.technicianId, entityType: 'technician', evidenceIds: [], isAiDerived: false as const, generatedAt: scorecard.generatedAt, metadata: {} };

    if (scorecard.comebackRate > 0.15) {
      insights.push({ ...base, insightId: `tech-comeback-${scorecard.technicianId}`, category: 'technician', title: `High Comeback Rate: ${(scorecard.comebackRate * 100).toFixed(0)}%`, summary: `${scorecard.technicianName}'s comeback rate is above the 15% threshold. Systems affected: ${scorecard.weakSystems.join(', ') || 'multiple'}.`, urgency: 'high', confidence: 85, recommendedActions: [{ actionId: 'tech-training', label: 'Schedule Training Review', description: 'Review comeback cases and identify diagnostic pattern gaps.', priority: 1 }] });
    }

    if (scorecard.firstTimeFixRate >= 0.95 && scorecard.totalJobCards >= 10) {
      insights.push({ ...base, insightId: `tech-excellence-${scorecard.technicianId}`, category: 'technician', title: 'Technician Excellence Detected', summary: `${scorecard.technicianName} achieved a ${(scorecard.firstTimeFixRate * 100).toFixed(0)}% first-time fix rate over ${scorecard.periodDays} days.`, urgency: 'informational', confidence: 90, recommendedActions: [{ actionId: 'tech-mentor', label: 'Assign as Mentor', description: 'Consider pairing this technician with lower performers.', priority: 1 }] });
    }

    return insights;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
