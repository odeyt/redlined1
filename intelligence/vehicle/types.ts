// SI-10: Vehicle Intelligence Engine — Types
// Deterministic only. No AI. No embeddings.

// ── Status enums ──────────────────────────────────────────────

export type VehicleIntelligenceStatus =
  | 'unavailable'
  | 'limited'
  | 'building'
  | 'ready'
  | 'stale'
  | 'error';

export type VehicleHealthStatus =
  | 'healthy'
  | 'monitor'
  | 'attention'
  | 'high_risk'
  | 'unknown';

// ── Pattern types ──────────────────────────────────────────────

export interface VehicleRepairPattern {
  category: string;
  count: number;
  lastSeen: string;
  technicianId?: string | null;
}

export interface VehicleDtcPattern {
  code: string;
  description: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
}

export interface VehiclePartPattern {
  partName: string;
  count: number;
  lastUsed: string;
}

export interface VehicleDeclinedWork {
  estimateId: string;
  title: string;
  total: number;
  declinedAt: string;
  daysSinceDecline: number;
  category: string;
}

export interface VehicleRecommendedCheck {
  key: string;
  title: string;
  rationale: string;       // must reference known data, not conjecture
  confidence: number;      // 0.0–1.0
  priority: 'critical' | 'high' | 'medium' | 'low';
  basedOn: string;         // what data supports this check
}

export interface VehicleRiskSignal {
  key: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  confidence: number;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface VehicleRepairLesson {
  repairCaseId: string;
  concern: string;
  category: string;
  resolution: string | null;
  technicianId: string | null;
  completedAt: string;
  verifiedSuccessful: boolean;
}

// ── Core profile ───────────────────────────────────────────────

export interface VehicleIntelligenceProfile {
  id: string;
  shopId: string;
  vehicleId: string;
  healthScore: number | null;
  healthStatus: VehicleHealthStatus;
  intelligenceStatus: VehicleIntelligenceStatus;
  visitCount: number;
  completedRepairCount: number;
  repairCaseCount: number;
  openEstimateCount: number;
  declinedEstimateCount: number;
  unpaidInvoiceCount: number;
  comebackCount: number;
  warrantyCount: number;
  totalRevenue: number;
  averageInvoiceValue: number;
  lastVisitAt: string | null;
  lastCompletedRepairAt: string | null;
  latestMileage: number | null;
  commonConcerns: VehicleRepairPattern[];
  commonDtcs: VehicleDtcPattern[];
  commonRepairs: VehicleRepairPattern[];
  commonParts: VehiclePartPattern[];
  declinedWork: VehicleDeclinedWork[];
  repairLessons: VehicleRepairLesson[];
  riskSignals: VehicleRiskSignal[];
  recommendedChecks: VehicleRecommendedCheck[];
  metadata: Record<string, unknown>;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Event ──────────────────────────────────────────────────────

export interface VehicleIntelligenceEvent {
  id: string;
  shopId: string;
  vehicleId: string;
  eventType: string;
  sourceType: string | null;
  sourceId: string | null;
  eventDate: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── Signal ────────────────────────────────────────────────────

export interface VehicleIntelligenceSignal {
  id: string;
  shopId: string;
  vehicleId: string;
  signalKey: string;
  signalType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string | null;
  confidence: number;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Context and result ─────────────────────────────────────────

export interface VehicleIntelligenceContext {
  shopId: string;
  vehicleId: string;
  visitCount: number;
  completedJobCount: number;
  repairCaseCount: number;
  comebackCount: number;
  declinedEstimateCount: number;
  unpaidInvoiceCount: number;
  openEstimateCount: number;
  concerns: VehicleRepairPattern[];
  dtcs: VehicleDtcPattern[];
  parts: VehiclePartPattern[];
  declinedWork: VehicleDeclinedWork[];
  repairLessons: VehicleRepairLesson[];
  latestMileage: number | null;
  totalRevenue: number;
  hasCompleteHistory: boolean;
}

export interface VehicleIntelligenceBuildResult {
  profile: VehicleIntelligenceProfile;
  signals: VehicleIntelligenceSignal[];
  isNew: boolean;
  durationMs: number;
  warnings: string[];
}
