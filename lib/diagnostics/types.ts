/**
 * lib/diagnostics/types.ts
 *
 * Canonical typed domain model for the RedlineD1 Diagnostic Orchestrator.
 * All AI-derived statements are distinguishable from verified service info.
 * Confidence is never represented as proof.
 * Every measurement carries unit + timestamp + source.
 * Every evidence record carries source type + quality + verification state.
 */

import { z } from 'zod';

// ── Enums / literal unions ─────────────────────────────────────────────────────

export type DiagnosticSessionStatus =
  | 'CASE_CREATED'
  | 'VEHICLE_IDENTIFIED'
  | 'INPUT_VALIDATED'
  | 'BASELINE_SCAN_COMPLETE'
  | 'SYSTEM_CLASSIFIED'
  | 'EVIDENCE_RETRIEVED'
  | 'HYPOTHESES_GENERATED'
  | 'SAFETY_REVIEWED'
  | 'NEXT_TEST_SELECTED'
  | 'AWAITING_TEST_RESULT'
  | 'TEST_RESULT_RECORDED'
  | 'HYPOTHESES_UPDATED'
  | 'FAULT_CONFIRMED'
  | 'REPAIR_RECOMMENDED'
  | 'REPAIR_PERFORMED'
  | 'POST_REPAIR_SCAN_COMPLETE'
  | 'REPAIR_VERIFIED'
  | 'CASE_CLOSED';

export type DiagnosticInterfaceType =
  | 'SIMULATED'
  | 'J2534_PASSTHRU'
  | 'BLUETOOTH_ELM327'
  | 'WIFI_ELM327'
  | 'OBD_LINK'
  | 'VENDOR_SPECIFIC'
  | 'BRIDGE';

export type DiagnosticProtocolType =
  | 'ISO_15765_4_CAN'
  | 'ISO_14230_4_KWP'
  | 'ISO_9141_2'
  | 'SAE_J1850_PWM'
  | 'SAE_J1850_VPW'
  | 'SAE_J1939'
  | 'ISO_15765_4_CAN_11BIT_500K'
  | 'ISO_15765_4_CAN_29BIT_500K'
  | 'ISO_15765_4_CAN_11BIT_250K'
  | 'ISO_15765_4_CAN_29BIT_250K'
  | 'UNKNOWN';

export type DtcType = 'CONFIRMED' | 'PENDING' | 'PERMANENT' | 'HISTORY';
export type DtcSystem = 'POWERTRAIN' | 'BODY' | 'CHASSIS' | 'NETWORK' | 'UNKNOWN';

export type EvidenceSourceType =
  | 'SCAN_DATA'
  | 'TECHNICIAN_MEASUREMENT'
  | 'FREEZE_FRAME'
  | 'LIVE_DATA'
  | 'PHOTO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'PRIOR_CASE'
  | 'RULE_INFERENCE'
  | 'AI_INFERENCE'         // distinguishable from verified sources
  | 'OEM_SPECIFICATION'
  | 'TSB'
  | 'TECHNICIAN_NOTE'
  | 'VEHICLE_HISTORY';

export type EvidenceQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type EvidenceVerificationState = 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'PENDING';

export type ConfidenceBand =
  | 'WEAK_HYPOTHESIS'      // 0–39
  | 'POSSIBLE'             // 40–59
  | 'LEADING_HYPOTHESIS'   // 60–79
  | 'STRONGLY_SUPPORTED'   // 80–94
  | 'CONFIRMED';           // 95–100 requires direct evidence + repair verification

export type SafetyCriticality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type ReviewSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFORMATIONAL';
export type ReviewApprovalState = 'APPROVED' | 'APPROVED_WITH_CAVEATS' | 'REJECTED' | 'REQUIRES_MORE_DATA';

export type FeedbackType =
  | 'USEFUL'
  | 'NOT_USEFUL'
  | 'INCORRECT'
  | 'UNSAFE'
  | 'WRONG_VEHICLE'
  | 'WRONG_SPECIFICATION'
  | 'WRONG_CONNECTOR'
  | 'MISSING_TEST'
  | 'OTHER';

export type BridgePairingStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

// ── Measurement ───────────────────────────────────────────────────────────────

export interface DiagnosticMeasurement {
  value: number | string;
  unit: string;
  timestamp: string;        // ISO-8601
  sourceModule: string;     // e.g. 'ECM', 'TCM', 'SIM'
  testConditions?: string;  // e.g. 'key-on engine-off', 'idle 750rpm'
  rawValue?: string;        // hex or raw byte string
}

// ── Vehicle ───────────────────────────────────────────────────────────────────

export interface DiagnosticVehicle {
  vehicleId?: string;       // Supabase vehicle.id if linked
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engineCode?: string;
  fuelType?: string;
  transmissionType?: string;
  odometerKm?: number;
  vinSource: 'SCAN' | 'MANUAL' | 'VEHICLE_RECORD';
  identificationConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ── Interface / Protocol ──────────────────────────────────────────────────────

export interface DiagnosticInterface {
  id: string;
  type: DiagnosticInterfaceType;
  displayName: string;
  vendorName?: string;
  dllPath?: string;
  firmwareVersion?: string;
  isSimulated: boolean;
  connectedAt?: string;
}

export interface DiagnosticProtocol {
  type: DiagnosticProtocolType;
  baudRate?: number;
  canId?: string;
  connectedAt: string;
  moduleAddress?: string;
}

// ── Module (ECU) ──────────────────────────────────────────────────────────────

export interface DiagnosticModule {
  id: string;
  sessionId: string;
  shopId: string;
  name: string;            // e.g. 'Engine Control Module'
  address: string;         // e.g. '0x7E0'
  protocol: DiagnosticProtocolType;
  supportsObd: boolean;
  ecuId?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  calibrationId?: string;
  rawIdentification?: Record<string, string>;
  scannedAt: string;
}

// ── DTC ───────────────────────────────────────────────────────────────────────

export interface DiagnosticDtc {
  id: string;
  sessionId: string;
  shopId: string;
  moduleId: string;
  code: string;            // e.g. 'P0420'
  type: DtcType;
  system: DtcSystem;
  description?: string;
  rawPayload?: string;
  scannedAt: string;
}

// ── Freeze Frame ─────────────────────────────────────────────────────────────

export interface DiagnosticFreezeFrame {
  id: string;
  sessionId: string;
  shopId: string;
  dtcCode: string;
  moduleId: string;
  parameters: DiagnosticMeasurement[];
  rawPayload: string;
  capturedAt: string;
}

// ── PID ──────────────────────────────────────────────────────────────────────

export interface DiagnosticPidDefinition {
  pid: string;              // e.g. '0x0C'
  name: string;
  unit: string;
  formula: string;
  minValue?: number;
  maxValue?: number;
  byteLength: number;
  isOemVerified: boolean;
  source: string;
}

export interface DiagnosticPidSample {
  id: string;
  captureId: string;
  shopId: string;
  pid: string;
  measurement: DiagnosticMeasurement;
}

export interface DiagnosticLiveDataCapture {
  id: string;
  sessionId: string;
  shopId: string;
  vehicleId?: string;
  label?: string;
  durationSeconds: number;
  sampleRateHz: number;
  testConditions?: string;
  samples: DiagnosticPidSample[];
  rawPayload: Record<string, unknown>;
  capturedAt: string;
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface DiagnosticEvidence {
  id: string;
  sessionId: string;
  shopId: string;
  sourceType: EvidenceSourceType;
  sourceId?: string;        // FK to scan, measurement, file, etc.
  description: string;
  quality: EvidenceQuality;
  verificationState: EvidenceVerificationState;
  supportsHypothesis?: string[];   // hypothesis IDs this supports
  contradicts?: string[];          // hypothesis IDs this contradicts
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

// ── Hypothesis ───────────────────────────────────────────────────────────────

export interface DiagnosticHypothesis {
  id: string;
  sessionId: string;
  shopId: string;
  description: string;
  systemAffected: string;
  componentSuspected?: string;
  evidenceFor: string[];     // evidence IDs
  evidenceAgainst: string[]; // evidence IDs
  assumptionsRequired: string[];
  contradictions: string[];
  confidenceScore: number;   // 0–100
  confidenceBand: ConfidenceBand;
  isAiDerived: boolean;      // always distinguishable
  isProvisional: boolean;    // cannot be confirmed until prerequisites met
  prerequisiteTests: string[]; // test IDs that must complete first
  createdAt: string;
  updatedAt: string;
}

// ── Test Plan ────────────────────────────────────────────────────────────────

export interface DiagnosticTestPlan {
  id: string;
  sessionId: string;
  shopId: string;
  title: string;
  rationale: string;
  targetHypothesisIds: string[];
  requiredTools: string[];
  testConditions: string;
  expectedResults: string;
  decisionBranches: Array<{ condition: string; conclusion: string }>;
  safetyWarnings: DiagnosticSafetyWarning[];
  estimatedMinutes?: number;
  isAiDerived: boolean;
  prerequisitesSatisfied: boolean;
  createdAt: string;
}

export interface DiagnosticTestResult {
  id: string;
  testPlanId: string;
  sessionId: string;
  shopId: string;
  technicianId: string;
  outcome: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIPPED';
  measurements: DiagnosticMeasurement[];
  notes?: string;
  imagesUploaded: string[];  // file IDs
  recordedAt: string;
}

// ── Safety ───────────────────────────────────────────────────────────────────

export interface DiagnosticSafetyWarning {
  id: string;
  ruleId: string;
  criticality: SafetyCriticality;
  message: string;
  detail?: string;
  blocksAction?: string;   // action key this warning blocks
}

// ── AI Reasoning ─────────────────────────────────────────────────────────────

export interface DiagnosticReasoningResult {
  id: string;
  sessionId: string;
  shopId: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  engineVersion: string;
  caseSummary: string;
  identifiedSystem: string;
  dtcRelationships: string;
  hypotheses: Array<{
    description: string;
    confidenceNote: string;  // never raw probability
    evidenceFor: string[];
    evidenceAgainst: string[];
    assumptions: string[];
  }>;
  contradictions: string[];
  missingData: string[];
  nextRecommendedTest: {
    title: string;
    rationale: string;
    requiredTools: string[];
    testConditions: string;
    expectedResults: string;
    decisionBranches: Array<{ condition: string; conclusion: string }>;
  };
  safetyWarnings: DiagnosticSafetyWarning[];
  componentsNotToReplaceYet: string[];
  evidenceQuality: EvidenceQuality;
  provisionalConfidence: number;     // 0–100, never treated as proof
  assumptions: string[];
  isAiDerived: true;                 // always true — never allow confusion
  safetyStatus: 'CLEAR' | 'WARNINGS_PRESENT' | 'BLOCKED';
  validatedAt?: string;              // set after schema validation
  rawResponse?: unknown;             // preserved for audit
  createdAt: string;
}

export interface DiagnosticReviewResult {
  id: string;
  sessionId: string;
  shopId: string;
  primaryReasoningId: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  agreesWithPrimary: boolean;
  disagreementPoints: string[];
  unsupportedAssumptions: string[];
  missingPrerequisiteTests: string[];
  unsafeRecommendations: string[];
  evidenceQualityConcerns: string[];
  suggestedCorrections: string[];
  severity: ReviewSeverity;
  approvalState: ReviewApprovalState;
  isAiDerived: true;
  validatedAt?: string;
  rawResponse?: unknown;
  createdAt: string;
}

// ── Confidence ───────────────────────────────────────────────────────────────

export interface DiagnosticConfidenceResult {
  score: number;             // 0–100, deterministic — never raw AI output
  band: ConfidenceBand;
  evidenceCompleteness: number;  // 0–1
  confirmationStatus: 'UNCONFIRMED' | 'PARTIALLY_CONFIRMED' | 'CONFIRMED';
  positiveFactors: string[];
  negativeFactors: string[];
  isAiInferenceOnly: boolean;    // true → band cannot exceed LEADING_HYPOTHESIS
  hasRepairVerification: boolean;
  calculatedAt: string;
}

// ── Technician Feedback ──────────────────────────────────────────────────────

export interface DiagnosticTechnicianFeedback {
  id: string;
  sessionId: string;
  shopId: string;
  technicianId: string;
  targetId: string;          // reasoning or hypothesis ID
  targetType: 'REASONING' | 'HYPOTHESIS' | 'TEST_PLAN' | 'SAFETY_WARNING';
  feedbackType: FeedbackType;
  notes?: string;
  createdAt: string;
}

// ── Repair Verification ──────────────────────────────────────────────────────

export interface DiagnosticRepairVerification {
  id: string;
  sessionId: string;
  shopId: string;
  jobCardId?: string;
  vehicleId?: string;
  technicianId: string;
  confirmedRootCause: string;
  repairPerformed: string;
  partsUsed: Array<{ partNumber?: string; description: string; quantity: number }>;
  laborHours?: number;
  postRepairDtcs: DiagnosticDtc[];
  postRepairLiveData?: DiagnosticMeasurement[];
  complaintResolved: boolean;
  verificationNotes?: string;
  // Verified repairs become evidence for future cases
  createdAsEvidenceId?: string;
  verifiedAt: string;
}

// ── Bridge ───────────────────────────────────────────────────────────────────

export interface DiagnosticBridgeDevice {
  id: string;
  shopId: string;
  displayName: string;
  machineId: string;         // hashed machine fingerprint, no PII
  osVersion?: string;
  bridgeVersion?: string;
  status: BridgePairingStatus;
  lastSeenAt?: string;
  pairedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
}

export interface DiagnosticBridgePairing {
  id: string;
  shopId: string;
  requestedByUserId: string;
  pairingCode: string;       // short-lived, one-use
  expiresAt: string;
  usedAt?: string;
  bridgeDeviceId?: string;
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}

// ── Session (top-level) ──────────────────────────────────────────────────────

export interface DiagnosticSession {
  id: string;
  shopId: string;
  technicianId: string;
  vehicleId?: string;
  jobCardId?: string;
  vehicle?: DiagnosticVehicle;
  interfaceUsed?: DiagnosticInterface;
  status: DiagnosticSessionStatus;
  isSimulated: boolean;
  modules: DiagnosticModule[];
  dtcs: DiagnosticDtc[];
  freezeFrames: DiagnosticFreezeFrame[];
  liveDataCaptures: DiagnosticLiveDataCapture[];
  evidence: DiagnosticEvidence[];
  hypotheses: DiagnosticHypothesis[];
  testPlans: DiagnosticTestPlan[];
  testResults: DiagnosticTestResult[];
  reasoningRuns: DiagnosticReasoningResult[];
  reviews: DiagnosticReviewResult[];
  confidence?: DiagnosticConfidenceResult;
  feedback: DiagnosticTechnicianFeedback[];
  repairVerification?: DiagnosticRepairVerification;
  savedToJobCardAt?: string;
  createdAt: string;
  updatedAt: string;
}
