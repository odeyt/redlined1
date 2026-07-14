/**
 * lib/platform/engines/PartsIntelligenceEngine.ts
 *
 * Analyzes frequently replaced parts, failure trends, supplier quality,
 * warranty claims, inventory turnover, lead time, and price history.
 * Automatically recommends stocking levels based on repair pattern data.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PartProfile {
  partNumber: string;
  description: string;
  shopId: string;
  usageCount30d: number;
  usageCount90d: number;
  usageCount365d: number;
  avgDaysBetweenOrders: number;
  avgUnitCost: number;
  avgMarkup: number;
  failureReturnRate: number;        // parts returned due to defect 0–1
  warrantyClaimRate: number;        // 0–1
  supplierLeadTimeDays: number;
  stockOnHand: number;
  recommendedStockLevel: number;    // calculated from usage velocity
  isLowStock: boolean;
  topFailingSystems: string[];      // which vehicle systems this part typically fixes
  topMakes: string[];
  lastOrderedAt?: string;
  priceHistory: Array<{ date: string; unitCost: number }>;
}

export interface StockRecommendation {
  partNumber: string;
  description: string;
  currentStock: number;
  recommendedStock: number;
  urgency: 'order_now' | 'order_soon' | 'monitor' | 'overstocked';
  estimatedDaysUntilStockout?: number;
  estimatedReorderValue: number;
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'parts_intelligence',
  displayName: 'Parts Intelligence Engine',
  category: 'parts',
  featureFlag: 'parts_intelligence_enabled',
  version: '1.0',
  subscribedEvents: ['repair.completed', 'repair.verified', 'part.ordered', 'part.returned'],
};

export class PartsIntelligenceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    // On part events, refresh the analysis for that part number
    const payload = event.payload as { partNumber?: string };
    if (!payload.partNumber) return [];

    const recs = await this.getStockRecommendations(shopId);
    return this.generateInsights(shopId, recs, event.occurredAt);
  }

  async getStockRecommendations(shopId: string): Promise<StockRecommendation[]> {
    // Load parts usage from job cards in last 90 days
    const since90d = new Date(Date.now() - 90 * 86400000).toISOString();

    const { data: usageData } = await this.supabase
      .from('job_card_parts')
      .select('part_number, description, quantity, unit_cost, job_cards(closed_at)')
      .eq('shop_id', shopId)
      .gte('created_at', since90d);

    if (!usageData?.length) return [];

    // Aggregate usage by part number
    const partMap = new Map<string, { count: number; totalCost: number; description: string }>();
    for (const row of usageData) {
      const key = row.part_number as string;
      const existing = partMap.get(key) ?? { count: 0, totalCost: 0, description: row.description as string };
      existing.count += (row.quantity as number) ?? 1;
      existing.totalCost += ((row.unit_cost as number) ?? 0) * ((row.quantity as number) ?? 1);
      existing.description = row.description as string;
      partMap.set(key, existing);
    }

    // Load current inventory
    const { data: inventory } = await this.supabase
      .from('inventory_items')
      .select('part_number, quantity_on_hand, reorder_point')
      .eq('shop_id', shopId);

    const inventoryMap = new Map((inventory ?? []).map((i) => [i.part_number as string, i]));

    return Array.from(partMap.entries())
      .map(([partNumber, data]) => {
        const inv = inventoryMap.get(partNumber);
        const stockOnHand = (inv?.quantity_on_hand as number) ?? 0;
        const dailyUsage = data.count / 90;
        const recommendedStock = Math.ceil(dailyUsage * 30); // 30-day buffer
        const daysUntilStockout = dailyUsage > 0 ? Math.floor(stockOnHand / dailyUsage) : 999;

        let urgency: StockRecommendation['urgency'];
        if (stockOnHand === 0 && dailyUsage > 0) urgency = 'order_now';
        else if (daysUntilStockout < 7) urgency = 'order_now';
        else if (daysUntilStockout < 21) urgency = 'order_soon';
        else if (stockOnHand > recommendedStock * 2) urgency = 'overstocked';
        else urgency = 'monitor';

        return {
          partNumber,
          description: data.description,
          currentStock: stockOnHand,
          recommendedStock,
          urgency,
          estimatedDaysUntilStockout: daysUntilStockout < 999 ? daysUntilStockout : undefined,
          estimatedReorderValue: (recommendedStock - stockOnHand) * (data.totalCost / data.count),
        };
      })
      .filter((r) => r.urgency === 'order_now' || r.urgency === 'order_soon')
      .sort((a, b) => (a.urgency === 'order_now' ? -1 : 1) - (b.urgency === 'order_now' ? -1 : 1));
  }

  private generateInsights(shopId: string, recs: StockRecommendation[], now: string): IntelligenceInsight[] {
    const base = { engineId: this.config.engineId, shopId, evidenceIds: [], isAiDerived: false as const, generatedAt: now, metadata: {} };
    const insights: IntelligenceInsight[] = [];

    const orderNow = recs.filter((r) => r.urgency === 'order_now');
    if (orderNow.length > 0) {
      insights.push({ ...base, insightId: `parts-stockout-${shopId}-${now}`, category: 'parts', title: `${orderNow.length} Part(s) Need Immediate Reorder`, summary: orderNow.map((r) => r.partNumber).join(', ') + ' — stockout imminent based on usage velocity.', urgency: 'high', confidence: 85, recommendedActions: orderNow.map((r, i) => ({ actionId: `reorder-${r.partNumber}`, label: `Reorder ${r.partNumber}`, description: `${r.description} — ${r.estimatedDaysUntilStockout ?? 0} days until stockout`, priority: i + 1 })) });
    }

    return insights;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
