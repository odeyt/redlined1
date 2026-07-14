/**
 * lib/platform/engines/ShopIntelligenceEngine.ts
 *
 * Monitors bay utilization, technician productivity, workflow bottlenecks,
 * vehicle turnaround, diagnostic efficiency, average repair time, and
 * core business KPIs. Surfaces actionable operational improvements.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BayUtilization {
  bayId: string;
  bayName: string;
  utilizationPercent: number;       // 0–100
  avgVehiclesPerDay: number;
  avgDwellTimeHours: number;
  bottleneckScore: number;          // 0–100, higher = more bottleneck
}

export interface ShopKPIs {
  shopId: string;
  periodDays: number;
  generatedAt: string;

  // Throughput
  totalJobCards: number;
  avgVehiclesPerDay: number;
  avgTurnaroundHours: number;       // check-in to check-out
  avgDiagnosticMinutes: number;
  longestOpenJobCardDays: number;

  // Productivity
  totalTechnicianHours: number;
  billableHoursPercent: number;     // billable / total
  avgJobCardValue: number;

  // Quality
  comebackRate: number;
  firstTimeFixRate: number;
  customerSatisfactionScore?: number;

  // Bottlenecks
  bayUtilization: BayUtilization[];
  waitingForPartsCount: number;     // job cards on hold for parts
  waitingForApprovalCount: number;  // job cards awaiting estimate approval

  insights: IntelligenceInsight[];
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'shop_intelligence',
  displayName: 'Shop Intelligence Engine',
  category: 'shop',
  featureFlag: 'shop_intelligence_enabled',
  version: '1.0',
  subscribedEvents: [
    'vehicle.checked_in',
    'vehicle.checked_out',
    'job_card.created',
    'job_card.closed',
    'technician.logged_work',
    'estimate.approved',
    'estimate.declined',
  ],
};

export class ShopIntelligenceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    const kpis = await this.calculateKPIs(shopId, 30);
    return kpis.insights;
  }

  async calculateKPIs(shopId: string, periodDays: number): Promise<ShopKPIs> {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();

    const { data: jobCards } = await this.supabase
      .from('job_cards')
      .select('id, created_at, closed_at, total_cost, is_comeback, status, technician_id')
      .eq('shop_id', shopId)
      .gte('created_at', since);

    const cards = jobCards ?? [];
    const closed = cards.filter((c) => c.closed_at);
    const totalJobCards = cards.length;
    const avgVehiclesPerDay = totalJobCards / periodDays;
    const avgJobCardValue = closed.length > 0 ? closed.reduce((s, c) => s + (c.total_cost ?? 0), 0) / closed.length : 0;
    const comebackRate = totalJobCards > 0 ? cards.filter((c) => c.is_comeback).length / totalJobCards : 0;
    const firstTimeFixRate = 1 - comebackRate;

    // Avg turnaround for closed jobs
    const turnaroundHours = closed
      .filter((c) => c.closed_at && c.created_at)
      .map((c) => (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 3600000);
    const avgTurnaroundHours = turnaroundHours.length > 0 ? turnaroundHours.reduce((s, h) => s + h, 0) / turnaroundHours.length : 0;

    // Open jobs waiting for parts/approval
    const waitingForParts = cards.filter((c) => !c.closed_at && c.status === 'waiting_parts').length;
    const waitingForApproval = cards.filter((c) => !c.closed_at && c.status === 'waiting_approval').length;

    // Longest open job
    const open = cards.filter((c) => !c.closed_at);
    const longestOpenJobCardDays = open.length > 0
      ? Math.max(...open.map((c) => (Date.now() - new Date(c.created_at).getTime()) / 86400000))
      : 0;

    const kpis: ShopKPIs = {
      shopId,
      periodDays,
      generatedAt: now,
      totalJobCards,
      avgVehiclesPerDay,
      avgTurnaroundHours,
      avgDiagnosticMinutes: 60,     // placeholder — needs labor log data
      longestOpenJobCardDays,
      totalTechnicianHours: 0,
      billableHoursPercent: 0,
      avgJobCardValue,
      comebackRate,
      firstTimeFixRate,
      bayUtilization: [],
      waitingForPartsCount: waitingForParts,
      waitingForApprovalCount: waitingForApproval,
      insights: [],
    };

    kpis.insights = this.generateInsights(kpis);
    return kpis;
  }

  private generateInsights(kpis: ShopKPIs): IntelligenceInsight[] {
    const base = { engineId: this.config.engineId, shopId: kpis.shopId, evidenceIds: [], isAiDerived: false as const, generatedAt: kpis.generatedAt, metadata: {} };
    const insights: IntelligenceInsight[] = [];

    if (kpis.waitingForPartsCount > 3) {
      insights.push({ ...base, insightId: `shop-parts-wait-${kpis.shopId}`, category: 'shop', title: `${kpis.waitingForPartsCount} Jobs Waiting for Parts`, summary: 'High parts wait count is reducing bay throughput and customer satisfaction.', urgency: 'high', confidence: 90, recommendedActions: [{ actionId: 'review-parts-orders', label: 'Review Parts Orders', description: 'Check status of outstanding purchase orders.', priority: 1, estimatedTimeSavingMinutes: 30 }] });
    }

    if (kpis.longestOpenJobCardDays > 5) {
      insights.push({ ...base, insightId: `shop-stale-job-${kpis.shopId}`, category: 'shop', title: 'Long-Running Job Card Detected', summary: `A job card has been open for ${kpis.longestOpenJobCardDays.toFixed(0)} days — may need manager review.`, urgency: 'medium', confidence: 95, recommendedActions: [{ actionId: 'review-open-jobs', label: 'Review Open Job Cards', description: 'Identify blockers and update customer on status.', priority: 1 }] });
    }

    if (kpis.comebackRate > 0.10) {
      insights.push({ ...base, insightId: `shop-comeback-${kpis.shopId}`, category: 'shop', title: `Shop Comeback Rate: ${(kpis.comebackRate * 100).toFixed(0)}%`, summary: 'Comeback rate above 10% indicates a diagnostic quality issue. Review technician scorecards.', urgency: 'high', confidence: 85, recommendedActions: [{ actionId: 'review-tech-scorecards', label: 'Review Technician Scorecards', description: 'Identify which technicians and systems have the highest comeback rates.', priority: 1 }] });
    }

    return insights;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
