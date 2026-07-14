/**
 * lib/platform/engines/PredictiveFailureEngine.ts
 *
 * Predicts failures before they occur using mileage, age, DTC history,
 * live data, previous repairs, and known failure patterns from the Knowledge Graph.
 *
 * Outputs: likelihood scores, remaining useful life estimates,
 * recommended inspections, and preventative maintenance schedules.
 *
 * V1: deterministic rules + knowledge graph patterns.
 * V2: ML model trained on anonymized repair history.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FailurePrediction {
  vehicleId: string;
  shopId: string;
  component: string;
  system: string;
  failureLikelihood: number;        // 0–100
  remainingUsefulLifeKm?: number;
  remainingUsefulLifeDays?: number;
  confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceSources: string[];
  recommendedAction: string;
  urgency: 'immediate' | 'soon' | 'scheduled' | 'monitor';
  estimatedRepairCost?: number;
  predictedAt: string;
  isAiDerived: false;               // V1 is deterministic
}

export interface PreventativeMaintenanceItem {
  vehicleId: string;
  service: string;
  dueAtKm?: number;
  dueByDate?: string;
  overdue: boolean;
  overdueByKm?: number;
  priority: 'urgent' | 'soon' | 'routine';
}

export interface PredictiveReport {
  vehicleId: string;
  shopId: string;
  analyzedAt: string;
  currentOdometerKm: number;
  vehicleAgeDays: number;
  predictions: FailurePrediction[];
  maintenanceSchedule: PreventativeMaintenanceItem[];
  overallRiskScore: number;         // 0–100
  insights: IntelligenceInsight[];
}

// ── V1 deterministic failure thresholds (mileage-based) ───────────────────────

interface FailureThreshold {
  component: string;
  system: string;
  intervalKm: number;
  warningAtPercent: number;         // warn when this % of interval elapsed since last service
  relatedDtcPatterns: RegExp[];
}

const FAILURE_THRESHOLDS: FailureThreshold[] = [
  { component: 'Engine Oil & Filter', system: 'Lubrication', intervalKm: 10000, warningAtPercent: 0.85, relatedDtcPatterns: [/P0521/, /P0524/] },
  { component: 'Air Filter', system: 'Induction', intervalKm: 30000, warningAtPercent: 0.9, relatedDtcPatterns: [/P0171/, /P0174/] },
  { component: 'Spark Plugs', system: 'Ignition', intervalKm: 60000, warningAtPercent: 0.85, relatedDtcPatterns: [/P030[0-9]/, /P0316/] },
  { component: 'Timing Belt', system: 'Engine', intervalKm: 100000, warningAtPercent: 0.8, relatedDtcPatterns: [/P0016/, /P0017/, /P0018/, /P0019/] },
  { component: 'Coolant Flush', system: 'Cooling', intervalKm: 60000, warningAtPercent: 0.9, relatedDtcPatterns: [/P0116/, /P0117/, /P0118/] },
  { component: 'Transmission Fluid', system: 'Drivetrain', intervalKm: 60000, warningAtPercent: 0.85, relatedDtcPatterns: [/P07\d\d/, /P08\d\d/] },
  { component: 'Brake Fluid', system: 'Brakes', intervalKm: 40000, warningAtPercent: 0.8, relatedDtcPatterns: [/C0\d\d\d/] },
  { component: 'Differential Fluid', system: 'Drivetrain', intervalKm: 50000, warningAtPercent: 0.85, relatedDtcPatterns: [] },
  { component: '12V Battery', system: 'Electrical', intervalKm: 60000, warningAtPercent: 0.7, relatedDtcPatterns: [/B1\d\d\d/, /U0\d\d\d/] },
  { component: 'Cabin Air Filter', system: 'HVAC', intervalKm: 20000, warningAtPercent: 0.9, relatedDtcPatterns: [] },
];

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'predictive_failure',
  displayName: 'Predictive Failure Engine',
  category: 'predictive',
  featureFlag: 'predictive_failure_enabled',
  version: '1.0',
  subscribedEvents: ['vehicle.checked_in', 'repair.verified', 'dtc.scanned', 'job_card.closed'],
};

export class PredictiveFailureEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    if (!event.vehicleId) return [];
    const report = await this.analyzeVehicle(shopId, event.vehicleId);
    return report.insights;
  }

  async analyzeVehicle(shopId: string, vehicleId: string): Promise<PredictiveReport> {
    const now = new Date().toISOString();

    const { data: vehicle } = await this.supabase
      .from('vehicles')
      .select('id, odometer_km, year, make, model, vin, created_at')
      .eq('id', vehicleId)
      .eq('shop_id', shopId)
      .single();

    if (!vehicle) return this.emptyReport(vehicleId, shopId, now);

    const odometerKm = vehicle.odometer_km ?? 0;
    const vehicleYear = vehicle.year ?? new Date().getFullYear();
    const vehicleAgeDays = Math.floor((Date.now() - new Date(`${vehicleYear}-01-01`).getTime()) / 86400000);

    // Load repair history to determine last service dates
    const { data: repairs } = await this.supabase
      .from('job_cards')
      .select('services_performed, dtc_codes, closed_at, odometer_km_in')
      .eq('vehicle_id', vehicleId)
      .eq('shop_id', shopId)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false });

    const dtcHistory = (repairs ?? []).flatMap((r) => (r.dtc_codes as string[]) ?? []);

    const predictions: FailurePrediction[] = [];
    const maintenanceItems: PreventativeMaintenanceItem[] = [];

    for (const threshold of FAILURE_THRESHOLDS) {
      const lastServiceKm = this.findLastServiceKm(threshold.component, repairs ?? []);
      const kmSinceService = odometerKm - (lastServiceKm ?? 0);
      const progressPct = kmSinceService / threshold.intervalKm;
      const hasDtcSignal = dtcHistory.some((dtc) => threshold.relatedDtcPatterns.some((p) => p.test(dtc)));

      const dueAtKm = (lastServiceKm ?? 0) + threshold.intervalKm;
      const overdue = odometerKm > dueAtKm;
      const overdueByKm = overdue ? odometerKm - dueAtKm : undefined;

      if (overdue || progressPct >= threshold.warningAtPercent || hasDtcSignal) {
        maintenanceItems.push({
          vehicleId,
          service: threshold.component,
          dueAtKm,
          overdue,
          overdueByKm,
          priority: overdue ? 'urgent' : progressPct >= 0.95 ? 'soon' : 'routine',
        });

        if (hasDtcSignal || overdue) {
          const likelihoodBase = overdue ? 70 : 45;
          const dtcBonus = hasDtcSignal ? 20 : 0;
          predictions.push({
            vehicleId,
            shopId,
            component: threshold.component,
            system: threshold.system,
            failureLikelihood: Math.min(100, likelihoodBase + dtcBonus),
            remainingUsefulLifeKm: overdue ? 0 : dueAtKm - odometerKm,
            confidenceBand: hasDtcSignal ? 'HIGH' : 'MEDIUM',
            evidenceSources: hasDtcSignal ? ['dtc_history', 'mileage'] : ['mileage'],
            recommendedAction: `Inspect and service ${threshold.component}`,
            urgency: overdue ? 'immediate' : 'soon',
            predictedAt: now,
            isAiDerived: false,
          });
        }
      }
    }

    const overallRiskScore = Math.min(
      100,
      Math.round(predictions.reduce((s, p) => s + p.failureLikelihood * 0.1, 0)),
    );

    const insights = this.generateInsights(shopId, vehicleId, predictions, maintenanceItems, overallRiskScore, now);

    return { vehicleId, shopId, analyzedAt: now, currentOdometerKm: odometerKm, vehicleAgeDays, predictions, maintenanceSchedule: maintenanceItems, overallRiskScore, insights };
  }

  private findLastServiceKm(
    component: string,
    repairs: Array<{ services_performed?: string[]; odometer_km_in?: number }>,
  ): number | undefined {
    for (const repair of repairs) {
      const services = (repair.services_performed as string[]) ?? [];
      if (services.some((s) => s.toLowerCase().includes(component.toLowerCase().split(' ')[0]))) {
        return repair.odometer_km_in ?? undefined;
      }
    }
    return undefined;
  }

  private generateInsights(
    shopId: string,
    vehicleId: string,
    predictions: FailurePrediction[],
    maintenance: PreventativeMaintenanceItem[],
    riskScore: number,
    now: string,
  ): IntelligenceInsight[] {
    const insights: IntelligenceInsight[] = [];
    const base = { engineId: this.config.engineId, shopId, entityId: vehicleId, entityType: 'vehicle', evidenceIds: [], isAiDerived: false as const, generatedAt: now, metadata: {} };

    const urgent = maintenance.filter((m) => m.priority === 'urgent');
    if (urgent.length > 0) {
      insights.push({ ...base, insightId: `pred-urgent-${vehicleId}-${now}`, category: 'predictive', title: `${urgent.length} Overdue Service Item(s)`, summary: urgent.map((m) => m.service).join(', ') + ' — overdue and may cause damage.', urgency: 'critical', confidence: 90, recommendedActions: urgent.map((m, i) => ({ actionId: `pm-${i}`, label: `Service ${m.service}`, description: `Overdue by ${m.overdueByKm?.toLocaleString() ?? '?'} km`, priority: i + 1 })) });
    }

    if (riskScore >= 60) {
      insights.push({ ...base, insightId: `pred-risk-${vehicleId}-${now}`, category: 'predictive', title: `High Failure Risk: ${riskScore}/100`, summary: `This vehicle has a high risk score based on mileage and DTC history. Recommend comprehensive inspection.`, urgency: 'high', confidence: 75, recommendedActions: [{ actionId: 'comprehensive-inspection', label: 'Book Comprehensive Inspection', description: 'Multi-point inspection to assess all flagged systems.', priority: 1 }] });
    }

    return insights;
  }

  private emptyReport(vehicleId: string, shopId: string, now: string): PredictiveReport {
    return { vehicleId, shopId, analyzedAt: now, currentOdometerKm: 0, vehicleAgeDays: 0, predictions: [], maintenanceSchedule: [], overallRiskScore: 0, insights: [] };
  }

  async isHealthy(): Promise<boolean> { return true; }
}
