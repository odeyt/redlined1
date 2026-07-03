// ============================================================
// RedlineD1 — Automotive Knowledge Graph
// TypeScript Types
// Sprint 4 — Foundation Layer
// ============================================================

// ── Node Types ───────────────────────────────────────────────

export type GraphNodeType =
  | 'manufacturer'
  | 'model'
  | 'platform'
  | 'year'
  | 'engine'
  | 'transmission'
  | 'ecu'
  | 'module'
  | 'dtc'
  | 'symptom'
  | 'test'
  | 'measurement'
  | 'part'
  | 'repair_procedure'
  | 'labor_operation'
  | 'technician'
  | 'tool'
  | 'supplier'
  | 'outcome'
  | 'comeback'
  | 'warranty'
  | 'lesson'
  | 'customer_segment'
  | 'region'
  | 'fuel_type'
  | 'market';

// ── Edge Types ───────────────────────────────────────────────

export type GraphEdgeType =
  | 'HAS_MODEL'
  | 'HAS_PLATFORM'
  | 'HAS_ENGINE'
  | 'HAS_TRANSMISSION'
  | 'USES_ECU'
  | 'HAS_DTC'
  | 'HAS_SYMPTOM'
  | 'REQUIRES_TEST'
  | 'TEST_CONFIRMS'
  | 'TEST_RULES_OUT'
  | 'USES_PART'
  | 'REPAIRED_BY'
  | 'PERFORMED_BY'
  | 'RESULTED_IN'
  | 'CAUSED_BY'
  | 'CORRELATED_WITH'
  | 'LEADS_TO'
  | 'PREVENTS'
  | 'HAS_OUTCOME'
  | 'HAS_COMEBACK'
  | 'HAS_WARRANTY'
  | 'LEARNED_FROM'
  | 'SIMILAR_TO'
  | 'COMMON_ON'
  | 'FAILS_WITH'
  | 'FIXED_BY'
  | 'MISDIAGNOSED_AS'
  | 'CHECK_FIRST'
  | 'REQUIRES_TOOL'
  | 'SUPPLIED_BY';

// ── Core Graph Entities ──────────────────────────────────────

export interface AutomotiveGraphNode {
  id: string;
  shopId: string | null;
  nodeType: GraphNodeType;
  canonicalName: string;
  displayName: string;
  normalizedKey: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  confidenceScore: number;
  isGlobal: boolean;
  isAnonymized: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomotiveGraphEdge {
  id: string;
  shopId: string | null;
  fromNodeId: string;
  toNodeId: string;
  edgeType: GraphEdgeType;
  weight: number;
  evidenceCount: number;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  isGlobal: boolean;
  isAnonymized: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomotiveGraphObservation {
  id: string;
  shopId: string;
  repairCaseId: string | null;
  repairOrderId: string | null;
  vehicleId: string | null;
  observationType: ObservationType;
  observationValue: string;
  normalizedValue: string | null;
  measurementUnit: string | null;
  measurementNumeric: number | null;
  confidenceScore: number;
  technicianId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AutomotiveGraphLesson {
  id: string;
  shopId: string;
  repairCaseId: string | null;
  title: string;
  problem: string | null;
  whatWasWrong: string | null;
  whatFooledUs: string | null;
  finalFix: string | null;
  checkFirstNextTime: string | null;
  commonMistake: string | null;
  recommendation: string | null;
  tags: string[];
  confidenceScore: number;
  verifiedStatus: LessonVerifiedStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomotiveGraphMetric {
  id: string;
  shopId: string | null;
  metricScope: MetricScope;
  metricKey: string;
  metricValue: number;
  metadata: Record<string, unknown>;
  calculatedAt: string;
}

// ── Sub-types ────────────────────────────────────────────────

export type ObservationType =
  | 'dtc_present'
  | 'symptom_observed'
  | 'test_performed'
  | 'measurement_recorded'
  | 'part_replaced'
  | 'repair_procedure_applied'
  | 'outcome_resolved'
  | 'outcome_partial'
  | 'outcome_comeback'
  | 'technician_assigned';

export type LessonVerifiedStatus =
  | 'pending'
  | 'tech_verified'
  | 'senior_verified'
  | 'published';

export type MetricScope =
  | 'global'
  | 'shop'
  | 'technician'
  | 'make_model'
  | 'dtc'
  | 'repair_procedure';

// ── Input Types for Graph Population ─────────────────────────

export interface UpsertGraphNodeInput {
  shopId: string | null;
  nodeType: GraphNodeType;
  canonicalName: string;
  displayName: string;
  normalizedKey: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  confidenceScore?: number;
  isGlobal?: boolean;
  isAnonymized?: boolean;
}

export interface CreateGraphEdgeInput {
  shopId: string | null;
  fromNodeId: string;
  toNodeId: string;
  edgeType: GraphEdgeType;
  weight?: number;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  isGlobal?: boolean;
  isAnonymized?: boolean;
}

export interface RecordObservationInput {
  shopId: string;
  repairCaseId?: string;
  repairOrderId?: string;
  vehicleId?: string;
  observationType: ObservationType;
  observationValue: string;
  normalizedValue?: string;
  measurementUnit?: string;
  measurementNumeric?: number;
  confidenceScore?: number;
  technicianId?: string;
}

export interface CreateLessonInput {
  shopId: string;
  repairCaseId?: string;
  title: string;
  problem?: string;
  whatWasWrong?: string;
  whatFooledUs?: string;
  finalFix?: string;
  checkFirstNextTime?: string;
  commonMistake?: string;
  recommendation?: string;
  tags?: string[];
}

// ── Repair Case → Graph Mapping ──────────────────────────────

export interface RepairCaseToGraphInput {
  repairCaseId: string;
  shopId: string;

  // Vehicle identity
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  transmission: string | null;
  vin?: string | null;

  // Diagnostic data
  dtcCodes: string[];
  symptoms: string[];
  testsPerformed: string[];

  // Repair data
  partsReplaced: string[];
  finalFix: string | null;
  concern: string | null;
  cause: string | null;
  correction: string | null;

  // People
  technicianNames: string[];

  // Outcome
  outcome: 'resolved' | 'partial' | 'comeback' | 'unknown';
  lessonLearned: string | null;

  // Confidence
  verificationStatus: 'pending' | 'tech_verified' | 'thirty_day_verified' | 'gold_verified';
}

// ── Query Result Types ───────────────────────────────────────

export interface SimilarRepairMatch {
  repairCaseId: string;
  shopId: string;
  similarityScore: number;
  matchReasons: SimilarityMatchReason[];

  // Case summary
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  dtcCodes: string[];
  symptoms: string[];
  finalFix: string | null;
  outcome: string;
  verificationStatus: string;

  // Graph evidence
  sharedNodes: AutomotiveGraphNode[];
  sharedEdges: AutomotiveGraphEdge[];
  confidence: number;
}

export interface SimilarityMatchReason {
  type: 'dtc_match' | 'symptom_match' | 'make_model_match' | 'engine_match' | 'part_match' | 'procedure_match';
  value: string;
  weight: number;
}

export interface SecondOpinionGraphContext {
  repairCaseId: string | null;
  vehicleContext: {
    make: string | null;
    model: string | null;
    year: string | null;
    engine: string | null;
    transmission: string | null;
  };
  dtcNodes: AutomotiveGraphNode[];
  symptomNodes: AutomotiveGraphNode[];
  suggestedTests: Array<{ node: AutomotiveGraphNode; confidence: number; evidenceCount: number }>;
  historicalFixes: Array<{ node: AutomotiveGraphNode; successRate: number; evidenceCount: number }>;
  commonPitfalls: string[];
  relatedLessons: AutomotiveGraphLesson[];
  similarCaseCount: number;
}

export interface TechnicianLearningSignal {
  technicianName: string;
  shopId: string;

  strengths: TechnicianStrength[];
  areasForGrowth: TechnicianGrowthArea[];
  suggestedLessons: AutomotiveGraphLesson[];

  stats: {
    totalRepairs: number;
    firstTimeFixRate: number;
    comebackRate: number;
    avgDiagnosisTime: number | null;
    strongPlatforms: string[];
    challengingDtcCodes: string[];
  };
}

export interface TechnicianStrength {
  area: string;
  description: string;
  evidenceCount: number;
  confidence: number;
}

export interface TechnicianGrowthArea {
  area: string;
  description: string;
  relatedComebacks: number;
  suggestedAction: string;
}

// ── Graph Status (for admin dashboard) ───────────────────────

export interface GraphStatus {
  nodeCount: number;
  edgeCount: number;
  observationCount: number;
  lessonCount: number;
  lastUpdated: string | null;
  nodeBreakdown: Partial<Record<GraphNodeType, number>>;
  edgeBreakdown: Partial<Record<GraphEdgeType, number>>;
}
