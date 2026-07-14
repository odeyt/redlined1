/**
 * lib/platform/engines/VehicleHealthScoreEngine.ts
 *
 * Generates a 0–100 vehicle health score across all major systems.
 * Displayed on the vehicle detail page and customer-facing inspection report.
 * Score is deterministic — never AI-derived without explicit labeling.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SystemHealthScore {
  system: string;
  score: number;           // 0–100
  status: 'good' | 'fair' | 'poor' | 'critical' | 'unknown';
  activeDtcs: string[];
  notes: string[];
  lastInspectedAt?: string;
}

export interface VehicleHealthReport {
  vehicleId: string;
  shopId: string;
  vin?: string;
  generatedAt: string;
  overallScore: number;    // 0–100 weighted average
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  urgency: 'none' | 'monitor' | 'service_soon' | 'service_now' | 'do_not_drive';
  systems: SystemHealthScore[];
  pendingFailurePredictions: number;
  deferredRepairCount: number;
  maintenanceOverdueCount: number;
  totalDtcCount: number;
  activeDtcCount: number;
  insights: IntelligenceInsight[];
}

interface SystemConfig {
  name: string;
  weight: number;             // how much this system affects overall score
  dtcPrefixes: string[];      // DTC code prefixes that indicate this system
  criticalDtcPatterns: RegExp[];
}

const SYSTEMS: SystemConfig[] = [
  { name: 'Engine', weight: 0.25, dtcPrefixes: ['P00', 'P01', 'P02', 'P03'], criticalDtcPatterns: [/P0016/, /P0300/, /P0171/, /P0174/] },
  { name: 'Transmission', weight: 0.15, dtcPrefixes: ['P07', 'P08'], criticalDtcPatterns: [/P0700/, /P0715/] },
  { name: 'ABS / Brakes', weight: 0.15, dtcPrefixes: ['C0'], criticalDtcPatterns: [/C0031/, /C0034/, /C0040/] },
  { name: 'HVAC', weight: 0.05, dtcPrefixes: ['B1', 'B2'], criticalDtcPatterns: [] },
  { name: 'Battery / Charging', weight: 0.10, dtcPrefixes: ['B1'], criticalDtcPatterns: [/B1001/, /B1004/] },
  { name: 'Body Electronics', weight: 0.05, dtcPrefixes: ['B0', 'B3'], criticalDtcPatterns: [] },
  { name: 'ADAS', weight: 0.10, dtcPrefixes: ['C1', 'C2'], criticalDtcPatterns: [] },
  { name: 'Network / CAN', weight: 0.10, dtcPrefixes: ['U0', 'U1'], criticalDtcPatterns: [/U0001/, /U0100/] },
  { name: 'Emissions', weight: 0.05, dtcPrefixes: ['P04', 'P05', 'P06'], criticalDtcPatterns: [/P0420/, /P0430/] },
];

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'vehicle_health_score',
  displayName: 'Vehicle Health Score Engine',
  category: 'vehicle_health',
  featureFlag: 'vehicle_health_score_enabled',
  version: '1.0',
  subscribedEvents: ['dtc.scanned', 'repair.completed', 'repair.verified', 'vehicle.checked_in', 'inspection.completed'],
};

export class VehicleHealthScoreEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    if (!event.vehicleId) return [];
    const report = await this.scoreVehicle(shopId, event.vehicleId);
    await this.persistScore(report);
    return report.insights;
  }

  async scoreVehicle(shopId: string, vehicleId: string): Promise<VehicleHealthReport> {
    const now = new Date().toISOString();

    const { data: vehicle } = await this.supabase
      .from('vehicles')
      .select('id, vin')
      .eq('id', vehicleId)
      .eq('shop_id', shopId)
      .single();

    // Load active DTCs from most recent scan
    const { data: recentScan } = await this.supabase
      .from('diagnostic_sessions')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeDtcs: string[] = [];
    if (recentScan) {
      const { data: dtcs } = await this.supabase
        .from('diagnostic_dtcs')
        .select('code, dtc_type')
        .eq('session_id', recentScan.id)
        .in('dtc_type', ['CONFIRMED', 'PENDING']);
      activeDtcs.push(...(dtcs ?? []).map((d) => d.code as string));
    }

    const systems = SYSTEMS.map((sys): SystemHealthScore => {
      const systemDtcs = activeDtcs.filter((dtc) =>
        sys.dtcPrefixes.some((prefix) => dtc.startsWith(prefix)),
      );
      const hasCritical = systemDtcs.some((dtc) =>
        sys.criticalDtcPatterns.some((p) => p.test(dtc)),
      );

      let score: number;
      let status: SystemHealthScore['status'];
      if (systemDtcs.length === 0) { score = 95; status = 'good'; }
      else if (hasCritical) { score = 20; status = 'critical'; }
      else if (systemDtcs.length >= 3) { score = 40; status = 'poor'; }
      else if (systemDtcs.length >= 1) { score = 65; status = 'fair'; }
      else { score = 95; status = 'good'; }

      return { system: sys.name, score, status, activeDtcs: systemDtcs, notes: [], lastInspectedAt: now };
    });

    // Weighted overall score
    const overallScore = Math.round(
      SYSTEMS.reduce((sum, sys, i) => sum + (systems[i].score * sys.weight), 0),
    );

    const riskLevel: VehicleHealthReport['riskLevel'] =
      overallScore >= 80 ? 'low' :
      overallScore >= 60 ? 'medium' :
      overallScore >= 40 ? 'high' : 'critical';

    const urgency: VehicleHealthReport['urgency'] =
      overallScore < 30 ? 'do_not_drive' :
      overallScore < 50 ? 'service_now' :
      overallScore < 70 ? 'service_soon' :
      overallScore < 85 ? 'monitor' : 'none';

    const report: VehicleHealthReport = {
      vehicleId,
      shopId,
      vin: vehicle?.vin,
      generatedAt: now,
      overallScore,
      riskLevel,
      urgency,
      systems,
      pendingFailurePredictions: 0,
      deferredRepairCount: 0,
      maintenanceOverdueCount: 0,
      totalDtcCount: activeDtcs.length,
      activeDtcCount: activeDtcs.length,
      insights: [],
    };

    report.insights = this.generateInsights(report);
    return report;
  }

  private async persistScore(report: VehicleHealthReport): Promise<void> {
    await this.supabase.from('vehicle_health_scores').upsert({
      vehicle_id: report.vehicleId,
      shop_id: report.shopId,
      overall_score: report.overallScore,
      risk_level: report.riskLevel,
      urgency: report.urgency,
      system_scores: report.systems,
      active_dtc_count: report.activeDtcCount,
      scored_at: report.generatedAt,
    }, { onConflict: 'vehicle_id,shop_id' });
  }

  private generateInsights(report: VehicleHealthReport): IntelligenceInsight[] {
    const base = { engineId: this.config.engineId, shopId: report.shopId, entityId: report.vehicleId, entityType: 'vehicle', evidenceIds: [], isAiDerived: false as const, generatedAt: report.generatedAt, metadata: {} };
    const insights: IntelligenceInsight[] = [];

    if (report.urgency === 'do_not_drive' || report.urgency === 'service_now') {
      insights.push({ ...base, insightId: `vhs-critical-${report.vehicleId}`, category: 'vehicle_health', title: `Vehicle Health: ${report.overallScore}/100 — ${report.urgency === 'do_not_drive' ? 'DO NOT DRIVE' : 'SERVICE NOW'}`, summary: `Critical faults detected in: ${report.systems.filter((s) => s.status === 'critical').map((s) => s.system).join(', ')}.`, urgency: 'critical', confidence: 95, recommendedActions: [{ actionId: 'immediate-service', label: 'Book Emergency Service', description: 'Contact customer immediately — vehicle may be unsafe.', priority: 1 }] });
    } else if (report.riskLevel === 'high') {
      insights.push({ ...base, insightId: `vhs-high-${report.vehicleId}`, category: 'vehicle_health', title: `Vehicle Health: ${report.overallScore}/100`, summary: `Multiple systems need attention. Service recommended soon.`, urgency: 'high', confidence: 85, recommendedActions: [{ actionId: 'schedule-service', label: 'Schedule Service', description: 'Multi-point inspection recommended.', priority: 1 }] });
    }

    return insights;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
