/**
 * RedlineD1 — Evidence & Reasoning Engine (ERE)
 * Sprint 6 — Core Type Definitions
 *
 * The ERE sits between the Knowledge Graph and the LLM.
 * These types are provider-agnostic. No AI SDK imports allowed here.
 */

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'dtc'
  | 'symptom'
  | 'test'
  | 'measurement'
  | 'part'
  | 'repair_procedure'
  | 'repair_outcome'
  | 'technician_lesson'
  | 'technician_confidence'
  | 'verified_status'
  | 'comeback'
  | 'warranty';

export type EvidenceSource = 'repair_case' | 'knowledge_graph' | 'technician' | 'system';

export interface Evidence {
  id: string;
  type: EvidenceType;
  value: string;
  weight: number;
  source: EvidenceSource;
  repairCaseId: string | null;
  verified: boolean;
  confidence: number; // 0-100
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Evidence Weights ─────────────────────────────────────────────────────────

export interface EvidenceWeights {
  verified_repair: number;
  gold_verified: number;
  successful_repair: number;
  comeback_penalty: number;
  warranty_failure_penalty: number;
  lesson_learned: number;
  scope_capture: number;
  voltage_measurement: number;
  pressure_measurement: number;
  oscilloscope: number;
  programming_success: number;
  smoke_test: number;
  compression_test: number;
  dtc_match: number;
  symptom_match: number;
  part_match: number;
  procedure_match: number;
}

export const DEFAULT_EVIDENCE_WEIGHTS: EvidenceWeights = {
  verified_repair:          100,
  gold_verified:            150,
  successful_repair:         80,
  comeback_penalty:        -100,
  warranty_failure_penalty:  -75,
  lesson_learned:            40,
  scope_capture:             35,
  voltage_measurement:       40,
  pressure_measurement:      40,
  oscilloscope:              60,
  programming_success:       50,
  smoke_test:                45,
  compression_test:          45,
  dtc_match:                 50,
  symptom_match:             30,
  part_match:                25,
  procedure_match:           35,
};

// ─── Confidence ───────────────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  factor: string;
  impact: number; // positive or negative
  description: string;
}

export interface ConfidenceResult {
  overall: number; // 0-100, clamped
  breakdown: ConfidenceBreakdown[];
  evidenceCount: number;
  verifiedRepairCount: number;
  comebackPenalty: number;
  unknownRisk: 'low' | 'medium' | 'high';
  reasoning: string;
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface EvidenceSupportItem {
  evidenceId: string;
  type: EvidenceType;
  value: string;
  weight: number;
  verified: boolean;
}

export interface Recommendation {
  rank: number;
  action: string;
  reason: string;
  confidence: number; // 0-100
  evidenceSupport: EvidenceSupportItem[];
  evidenceCount: number;
  verifiedRepairs: number;
  avgComebackRate: number | null; // 0-1
  technicianAgreement: number | null; // 0-1 ratio
  sources: string[];
}

// ─── Known Unknowns ───────────────────────────────────────────────────────────

export interface KnownUnknown {
  type: 'missing_measurement' | 'missing_test' | 'missing_data' | 'conflicting_evidence' | 'low_confidence';
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAction: string;
}

// ─── Reasoning Timeline ───────────────────────────────────────────────────────

export interface ReasoningTimelineStep {
  step: number;
  label: string;
  completedAt: string;
  durationMs: number;
  detail?: string;
}

export interface ReasoningTimeline {
  steps: ReasoningTimelineStep[];
  totalMs: number;
}

// ─── LLM Context (ContextBuilder output) ─────────────────────────────────────

export interface LessonSummary {
  title: string;
  whatWasWrong: string | null;
  whatFooledUs: string | null;
  finalFix: string | null;
  checkFirstNextTime: string | null;
  commonMistake: string | null;
  verifiedStatus: string;
  confidence: number;
}

export interface SimilarRepairSummary {
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  dtcCodes: string[];
  symptoms: string[];
  finalFix: string | null;
  similarityScore: number;
  confidence: number;
  verificationStatus: string;
  outcome: string;
}

export interface LLMContext {
  vehicle: {
    make: string | null;
    model: string | null;
    year: string | null;
    engine: string | null;
    transmission: string | null;
    mileage: number | null;
    vin: string | null;
  };
  complaint: string | null;
  cause: string | null;
  symptoms: string[];
  dtcCodes: string[];
  topEvidence: Evidence[];
  topLessons: LessonSummary[];
  topSimilarRepairs: SimilarRepairSummary[];
  topRecommendations: Recommendation[];
  confidence: ConfidenceResult;
  knownUnknowns: KnownUnknown[];
  generatedAt: string;
  cacheKey: string;
}

// ─── Engine I/O ───────────────────────────────────────────────────────────────

export interface ReasoningInput {
  repairCaseId: string;
  shopId: string;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  engine?: string | null;
  transmission?: string | null;
  mileage?: number | null;
  vin?: string | null;
  complaint?: string | null;
  cause?: string | null;
  dtcCodes: string[];
  symptoms: string[];
  testsPerformed: string[];
  partsReplaced: string[];
  finalFix?: string | null;
  lessonLearned?: string | null;
  confidenceScore?: number | null;
  verificationStatus: string;
  outcomes?: Array<{
    outcome: string;
    comeback: boolean;
    warrantyClaim: boolean;
    verifiedFix: boolean;
  }>;
  similarRepairs?: SimilarRepairSummary[];
  lessons?: LessonSummary[];
  // Optional weight overrides (future: shop-level config)
  weightOverrides?: Partial<EvidenceWeights>;
}

export interface ReasoningResult {
  input: ReasoningInput;
  evidence: Evidence[];
  confidence: ConfidenceResult;
  recommendations: Recommendation[];
  knownUnknowns: KnownUnknown[];
  timeline: ReasoningTimeline;
  llmContext: LLMContext;
  cacheKey: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T;
  cachedAt: number; // Date.now()
  ttlMs: number;
  key: string;
}

export const CACHE_TTL = {
  SIMILAR_REPAIRS:   5 * 60 * 1000,  // 5 min
  CONFIDENCE:        2 * 60 * 1000,  // 2 min
  RECOMMENDATIONS:   5 * 60 * 1000,  // 5 min
  GRAPH_LOOKUP:      3 * 60 * 1000,  // 3 min
} as const;
