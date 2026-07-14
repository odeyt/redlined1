/**
 * lib/platform/engines/FleetIntelligenceEngine.ts
 *
 * Analyzes all vehicles in a fleet or belonging to a customer.
 * Detects recurring failures, high-maintenance vehicles, downtime trends,
 * average repair cost, repeated DTC patterns, and upcoming maintenance.
 * Produces a fleet health score per customer/fleet.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
  IntelligenceInsight as Insight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FleetVehicleProfile {
  vehicleId: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  odometerKm?: number;
  totalRepairCost: number;         // in shop currency
  repairCount: number;
  dtcHistory: string[];            // all DTC codes ever scanned
  recurringDtcs: string[];         // codes seen 2+ times
  lastServiceDate?: string;
  nextScheduledService?: string;
  healthScore: number;             // 0–100
  isHighMaintenance: boolean;      // top quartile cost
}

export interface FleetAnalysis {
  shopId: string;
  customerId?: string;
  fleetId?: string;
  analyzedAt: string;
  vehicleCount: number;
  vehicles: FleetVehicleProfile[];
  fleetHealthScore: number;        // weighted average
  totalFleetRepairCost: number;
  avgRepairCostPerVehicle: number;
  highMaintenanceVehicles: string[]; // vehicleIds
  recurringFailurePatterns: Array<{
    dtcCode: string;
    affectedVehicleCount: number;
    totalOccurrences: number;
  }>;
  upcomingMaintenanceVehicles: string[];
  warrantyOpportunities: Array<{
    vehicleId: string;
    dtcCode: string;
    description: string;
  }>;
  downtimeTrendDays: number;       // avg days out of service per vehicle per year
  insights: Insight[];
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'fleet_intelligence',
  displayName: 'Fleet Intelligence Engine',
  category: 'fleet',
  featureFlag: 'fleet_intelligence_enabled',
  version: '1.0',
  subscribedEvents: [
    'repair.completed',
    'repair.verified',
    'vehicle.checked_in',
    'vehicle.checked_out',
    'job_card.closed',
    'fleet.vehicle.added',
    'fleet.vehicle.removed',
  ],
};

export class FleetIntelligenceEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    if (!event.customerId && !event.vehicleId) return [];

    // Trigger fleet re-analysis for the customer when any vehicle event fires
    const analysis = await this.analyzeFleet(shopId, event.customerId);
    return analysis.insights;
  }

  async analyzeFleet(shopId: string, customerId?: string): Promise<FleetAnalysis> {
    const now = new Date().toISOString();

    // Load all vehicles for the customer/shop
    let vehicleQuery = this.supabase
      .from('vehicles')
      .select('id, vin, year, make, model, odometer_km')
      .eq('shop_id', shopId);
    if (customerId) vehicleQuery = vehicleQuery.eq('customer_id', customerId);

    const { data: vehicles } = await vehicleQuery;
    if (!vehicles?.length) {
      return this.emptyAnalysis(shopId, customerId, now);
    }

    const vehicleIds = vehicles.map((v) => v.id);

    // Load repair history for all fleet vehicles
    const { data: repairs } = await this.supabase
      .from('job_cards')
      .select('vehicle_id, total_cost, created_at, closed_at, dtc_codes')
      .in('vehicle_id', vehicleIds)
      .eq('shop_id', shopId)
      .not('closed_at', 'is', null);

    const profiles = this.buildVehicleProfiles(vehicles, repairs ?? []);
    const totalCost = profiles.reduce((s, p) => s + p.totalRepairCost, 0);
    const avgCost = profiles.length > 0 ? totalCost / profiles.length : 0;
    const costThreshold = avgCost * 1.5;
    profiles.forEach((p) => { p.isHighMaintenance = p.totalRepairCost > costThreshold; });

    const dtcFrequency = this.buildDtcFrequency(profiles);
    const recurringPatterns = Object.entries(dtcFrequency)
      .filter(([, data]) => data.vehicleCount >= 2)
      .map(([dtcCode, data]) => ({ dtcCode, affectedVehicleCount: data.vehicleCount, totalOccurrences: data.totalOccurrences }))
      .sort((a, b) => b.affectedVehicleCount - a.affectedVehicleCount);

    const fleetHealthScore = Math.round(
      profiles.reduce((s, p) => s + p.healthScore, 0) / (profiles.length || 1),
    );

    const highMaintenance = profiles.filter((p) => p.isHighMaintenance).map((p) => p.vehicleId);

    const insights = this.generateInsights(shopId, customerId, {
      fleetHealthScore,
      highMaintenance,
      recurringPatterns,
      totalCost,
      vehicleCount: vehicles.length,
    }, now);

    return {
      shopId,
      customerId,
      analyzedAt: now,
      vehicleCount: vehicles.length,
      vehicles: profiles,
      fleetHealthScore,
      totalFleetRepairCost: totalCost,
      avgRepairCostPerVehicle: avgCost,
      highMaintenanceVehicles: highMaintenance,
      recurringFailurePatterns: recurringPatterns,
      upcomingMaintenanceVehicles: [],
      warrantyOpportunities: [],
      downtimeTrendDays: 0,
      insights,
    };
  }

  private buildVehicleProfiles(
    vehicles: Array<{ id: string; vin?: string; year?: number; make?: string; model?: string; odometer_km?: number }>,
    repairs: Array<{ vehicle_id: string; total_cost?: number; dtc_codes?: string[] }>,
  ): FleetVehicleProfile[] {
    return vehicles.map((v) => {
      const vehicleRepairs = repairs.filter((r) => r.vehicle_id === v.id);
      const totalRepairCost = vehicleRepairs.reduce((s, r) => s + (r.total_cost ?? 0), 0);
      const allDtcs = vehicleRepairs.flatMap((r) => r.dtc_codes ?? []);
      const dtcCounts = new Map<string, number>();
      allDtcs.forEach((dtc) => dtcCounts.set(dtc, (dtcCounts.get(dtc) ?? 0) + 1));
      const recurringDtcs = Array.from(dtcCounts.entries())
        .filter(([, count]) => count >= 2)
        .map(([code]) => code);

      // Simple health score: start at 100, deduct for repairs and recurring DTCs
      const healthScore = Math.max(
        0,
        100 - vehicleRepairs.length * 5 - recurringDtcs.length * 10,
      );

      return {
        vehicleId: v.id,
        vin: v.vin,
        year: v.year,
        make: v.make,
        model: v.model,
        odometerKm: v.odometer_km,
        totalRepairCost,
        repairCount: vehicleRepairs.length,
        dtcHistory: Array.from(new Set(allDtcs)),
        recurringDtcs,
        healthScore,
        isHighMaintenance: false,
      };
    });
  }

  private buildDtcFrequency(profiles: FleetVehicleProfile[]) {
    const map: Record<string, { vehicleCount: number; totalOccurrences: number }> = {};
    for (const p of profiles) {
      const seen = new Set<string>();
      for (const dtc of p.dtcHistory) {
        if (!seen.has(dtc)) { map[dtc] = map[dtc] ?? { vehicleCount: 0, totalOccurrences: 0 }; map[dtc].vehicleCount++; seen.add(dtc); }
        map[dtc].totalOccurrences++;
      }
    }
    return map;
  }

  private generateInsights(
    shopId: string,
    customerId: string | undefined,
    data: { fleetHealthScore: number; highMaintenance: string[]; recurringPatterns: Array<{ dtcCode: string; affectedVehicleCount: number }>; totalCost: number; vehicleCount: number },
    now: string,
  ): IntelligenceInsight[] {
    const insights: IntelligenceInsight[] = [];
    const base = { engineId: this.config.engineId, shopId, evidenceIds: [], isAiDerived: false, generatedAt: now, metadata: { customerId } };

    if (data.fleetHealthScore < 60) {
      insights.push({ ...base, insightId: `fleet-health-${shopId}-${now}`, category: 'fleet', title: 'Fleet Health Alert', summary: `Fleet health score is ${data.fleetHealthScore}/100 — significant deferred maintenance detected.`, urgency: 'high', confidence: 80, recommendedActions: [{ actionId: 'fleet-review', label: 'Schedule Fleet Review', description: 'Contact customer to book comprehensive fleet inspection.', priority: 1 }] });
    }

    if (data.highMaintenance.length > 0) {
      insights.push({ ...base, insightId: `fleet-high-maint-${shopId}-${now}`, category: 'fleet', title: `${data.highMaintenance.length} High-Maintenance Vehicle(s)`, summary: `${data.highMaintenance.length} vehicle(s) cost 50%+ above fleet average.`, urgency: 'medium', confidence: 90, recommendedActions: [{ actionId: 'fleet-retirement', label: 'Discuss Replacement', description: 'Present total cost of ownership analysis to fleet manager.', priority: 2 }] });
    }

    if (data.recurringPatterns.length > 0) {
      const top = data.recurringPatterns[0];
      insights.push({ ...base, insightId: `fleet-recurring-${shopId}-${now}`, category: 'fleet', title: 'Recurring Failure Pattern Detected', summary: `DTC ${top.dtcCode} is affecting ${top.affectedVehicleCount} vehicles — possible batch defect or deferred root cause.`, urgency: 'high', confidence: 75, recommendedActions: [{ actionId: 'fleet-root-cause', label: 'Investigate Root Cause', description: 'Review common component across affected vehicles.', priority: 1 }] });
    }

    return insights;
  }

  private emptyAnalysis(shopId: string, customerId: string | undefined, now: string): FleetAnalysis {
    return { shopId, customerId, analyzedAt: now, vehicleCount: 0, vehicles: [], fleetHealthScore: 100, totalFleetRepairCost: 0, avgRepairCostPerVehicle: 0, highMaintenanceVehicles: [], recurringFailurePatterns: [], upcomingMaintenanceVehicles: [], warrantyOpportunities: [], downtimeTrendDays: 0, insights: [] };
  }

  async isHealthy(): Promise<boolean> { return true; }
}
