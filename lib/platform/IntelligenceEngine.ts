/**
 * lib/platform/IntelligenceEngine.ts
 *
 * The core plugin contract for the RedlineD1 Automotive Intelligence Platform.
 * Every intelligence engine implements this interface.
 * The platform registry discovers, initializes, and routes events to engines.
 *
 * Design principles:
 * - Engines are stateless between runs — all state lives in Supabase
 * - Engines consume IntelligencePlatformEvents and emit IntelligenceInsights
 * - Engines never call each other directly — they publish to the event bus
 * - Every engine has a feature flag; disabled engines receive no events
 * - Network effect: every verified repair strengthens ALL engines
 */

// ── Event system ──────────────────────────────────────────────────────────────

export type PlatformEventType =
  | 'repair.completed'
  | 'repair.verified'
  | 'dtc.scanned'
  | 'diagnosis.session.completed'
  | 'vehicle.checked_in'
  | 'vehicle.checked_out'
  | 'job_card.created'
  | 'job_card.closed'
  | 'inspection.completed'
  | 'customer.visited'
  | 'technician.logged_work'
  | 'part.ordered'
  | 'part.returned'
  | 'invoice.created'
  | 'payment.received'
  | 'estimate.approved'
  | 'estimate.declined'
  | 'fleet.vehicle.added'
  | 'fleet.vehicle.removed';

export interface IntelligencePlatformEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: PlatformEventType;
  shopId: string;
  entityId?: string;
  entityType?: string;
  vehicleId?: string;
  customerId?: string;
  technicianId?: string;
  payload: TPayload;
  occurredAt: string;   // ISO-8601
  schemaVersion: '1.0';
}

// ── Insight — what every engine can produce ────────────────────────────────────

export type InsightCategory =
  | 'fleet'
  | 'predictive'
  | 'repair'
  | 'technician'
  | 'vehicle_health'
  | 'customer'
  | 'parts'
  | 'revenue'
  | 'shop'
  | 'knowledge_graph';

export type InsightUrgency = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export interface IntelligenceInsight {
  insightId: string;
  engineId: string;
  category: InsightCategory;
  shopId: string;
  entityId?: string;
  entityType?: string;
  title: string;
  summary: string;
  urgency: InsightUrgency;
  confidence: number;           // 0–100, deterministic
  evidenceIds: string[];
  recommendedActions: RecommendedAction[];
  expiresAt?: string;
  metadata: Record<string, unknown>;
  generatedAt: string;
  isAiDerived: boolean;         // always explicit
}

export interface RecommendedAction {
  actionId: string;
  label: string;
  description: string;
  estimatedRevenueImpact?: number;  // in shop currency
  estimatedTimeSavingMinutes?: number;
  priority: number;                 // 1 = highest
  deepLink?: string;                // route in app
}

// ── Engine contract ────────────────────────────────────────────────────────────

export interface IntelligenceEngineConfig {
  engineId: string;
  displayName: string;
  category: InsightCategory;
  featureFlag: string;             // KnownFlagKey — must be OFF by default
  version: string;
  subscribedEvents: PlatformEventType[];
}

export interface IntelligenceEngine<
  TInput = IntelligencePlatformEvent,
  TOutput = IntelligenceInsight[],
> {
  readonly config: IntelligenceEngineConfig;

  /**
   * Process a platform event and return zero or more insights.
   * Must be idempotent — same event → same insights (except for time-based scores).
   */
  process(event: TInput, shopId: string): Promise<TOutput>;

  /**
   * Health check — returns true if engine is operational.
   */
  isHealthy(): Promise<boolean>;
}

// ── Registry entry ─────────────────────────────────────────────────────────────

export interface EngineRegistryEntry {
  engine: IntelligenceEngine;
  isEnabled: boolean;
  lastProcessedAt?: string;
  totalEventsProcessed: number;
  totalInsightsGenerated: number;
  errorCount: number;
}
