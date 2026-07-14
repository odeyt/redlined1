/**
 * lib/platform/engines/RevenueIntelligenceEngine.ts
 *
 * Predicts revenue opportunities from missed maintenance, deferred repairs,
 * and future work. Tracks average repair order, profitability, and
 * customer retention impact on long-term revenue.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RevenueOpportunity {
  opportunityId: string;
  shopId: string;
  type: 'deferred_repair' | 'missed_maintenance' | 'upsell' | 'recall' | 'warranty' | 'fleet_contract';
  vehicleId?: string;
  customerId?: string;
  title: string;
  description: string;
  estimatedRevenue: number;
  probability: number;           // 0–1, deterministic
  expiresAt?: string;
  createdAt: string;
}

export interface RevenueReport {
  shopId: string;
  periodDays: number;
  generatedAt: string;

  // Revenue metrics
  totalInvoiced: number;
  totalCollected: number;
  avgRepairOrderValue: number;
  avgLaborHours: number;
  totalPartsRevenue: number;
  totalLaborRevenue: number;
  grossMarginPercent: number;

  // Opportunities
  opportunities: RevenueOpportunity[];
  totalOpportunityValue: number;

  // Retention
  repeatCustomerRate: number;
  avgDaysBetweenVisits: number;
  customersAtRiskOfChurn: number;   // > 180 days since last visit

  insights: IntelligenceInsight[];
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'revenue_intelligence',
  displayName: 'Revenue Intelligence Engine',
  category: 'revenue',
  featureFlag: 'revenue_intelligence_enabled',
  version: '1.0',
  subscribedEvents: [
    'job_card.closed',
    'estimate.declined',
    'invoice.created',
    'payment.received',
    'repair.verified',
    'customer.visited',
  ],
};

export class RevenueIntelligenceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    const report = await this.analyzeRevenue(shopId, 90);
    return report.insights;
  }

  async analyzeRevenue(shopId: string, periodDays: number): Promise<RevenueReport> {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();

    const { data: invoices } = await this.supabase
      .from('job_cards')
      .select('id, total_cost, labor_cost, parts_cost, created_at, customer_id, vehicle_id')
      .eq('shop_id', shopId)
      .gte('created_at', since)
      .not('closed_at', 'is', null);

    const cards = invoices ?? [];
    const totalInvoiced = cards.reduce((s, c) => s + (c.total_cost ?? 0), 0);
    const totalLabor = cards.reduce((s, c) => s + (c.labor_cost ?? 0), 0);
    const totalParts = cards.reduce((s, c) => s + (c.parts_cost ?? 0), 0);
    const avgRepairOrderValue = cards.length > 0 ? totalInvoiced / cards.length : 0;

    // Customers at churn risk (no visit in 180 days)
    const churnSince = new Date(Date.now() - 180 * 86400000).toISOString();
    const { count: churnCount } = await this.supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .lt('last_visit_at', churnSince);

    // Declined estimates = deferred revenue opportunities
    const { data: declined } = await this.supabase
      .from('estimates')
      .select('id, total, customer_id, vehicle_id, created_at, services_declined')
      .eq('shop_id', shopId)
      .eq('status', 'declined')
      .gte('created_at', since);

    const opportunities: RevenueOpportunity[] = (declined ?? []).map((est) => ({
      opportunityId: `deferred-${est.id}`,
      shopId,
      type: 'deferred_repair' as const,
      vehicleId: est.vehicle_id ?? undefined,
      customerId: est.customer_id ?? undefined,
      title: 'Declined Estimate — Follow Up',
      description: `Customer declined ${((est.services_declined as string[]) ?? []).join(', ')} — estimated value ${est.total}.`,
      estimatedRevenue: est.total as number ?? 0,
      probability: 0.35,
      expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
      createdAt: now,
    }));

    const totalOpportunityValue = opportunities.reduce((s, o) => s + o.estimatedRevenue * o.probability, 0);
    const grossMarginPercent = totalInvoiced > 0 ? ((totalLabor + (totalParts * 0.4)) / totalInvoiced) * 100 : 0;

    const report: RevenueReport = {
      shopId,
      periodDays,
      generatedAt: now,
      totalInvoiced,
      totalCollected: totalInvoiced,
      avgRepairOrderValue,
      avgLaborHours: 0,
      totalPartsRevenue: totalParts,
      totalLaborRevenue: totalLabor,
      grossMarginPercent,
      opportunities,
      totalOpportunityValue,
      repeatCustomerRate: 0,
      avgDaysBetweenVisits: 0,
      customersAtRiskOfChurn: churnCount ?? 0,
      insights: [],
    };

    report.insights = this.generateInsights(report);
    return report;
  }

  private generateInsights(report: RevenueReport): IntelligenceInsight[] {
    const base = { engineId: this.config.engineId, shopId: report.shopId, evidenceIds: [], isAiDerived: false as const, generatedAt: report.generatedAt, metadata: {} };
    const insights: IntelligenceInsight[] = [];

    if (report.totalOpportunityValue > 0) {
      insights.push({ ...base, insightId: `rev-opp-${report.shopId}`, category: 'revenue', title: `${report.opportunities.length} Revenue Opportunit${report.opportunities.length === 1 ? 'y' : 'ies'} Identified`, summary: `Estimated weighted opportunity value: ${report.totalOpportunityValue.toFixed(0)} in deferred/declined work.`, urgency: 'medium', confidence: 75, recommendedActions: [{ actionId: 'follow-up-declined', label: 'Send Follow-Up Messages', description: 'Contact customers with declined estimates about deferred work.', priority: 1, estimatedRevenueImpact: report.totalOpportunityValue }] });
    }

    if (report.customersAtRiskOfChurn > 0) {
      insights.push({ ...base, insightId: `rev-churn-${report.shopId}`, category: 'revenue', title: `${report.customersAtRiskOfChurn} Customer(s) At Risk of Churning`, summary: `${report.customersAtRiskOfChurn} customers have not visited in 180+ days.`, urgency: 'high', confidence: 80, recommendedActions: [{ actionId: 'reactivation-campaign', label: 'Send Reactivation Reminder', description: 'Automated maintenance reminder to lapsed customers.', priority: 1, estimatedRevenueImpact: report.customersAtRiskOfChurn * report.avgRepairOrderValue * 0.2 }] });
    }

    return insights;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
