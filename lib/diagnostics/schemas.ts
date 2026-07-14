/**
 * lib/diagnostics/schemas.ts
 *
 * Zod v4 schemas for runtime validation of all diagnostic domain types.
 * Used at API boundaries and before persisting AI-generated structured output.
 */

import { z } from 'zod';

// ── Primitives ─────────────────────────────────────────────────────────────────

export const DiagnosticMeasurementSchema = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  timestamp: z.string(),
  sourceModule: z.string(),
  testConditions: z.string().optional(),
  rawValue: z.string().optional(),
});

export const SafetyCriticalitySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const DiagnosticSafetyWarningSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  criticality: SafetyCriticalitySchema,
  message: z.string(),
  detail: z.string().optional(),
  blocksAction: z.string().optional(),
});

// ── Confidence ─────────────────────────────────────────────────────────────────

export const ConfidenceBandSchema = z.enum([
  'WEAK_HYPOTHESIS',
  'POSSIBLE',
  'LEADING_HYPOTHESIS',
  'STRONGLY_SUPPORTED',
  'CONFIRMED',
]);

export const DiagnosticConfidenceResultSchema = z.object({
  score: z.number().min(0).max(100),
  band: ConfidenceBandSchema,
  evidenceCompleteness: z.number().min(0).max(1),
  confirmationStatus: z.enum(['UNCONFIRMED', 'PARTIALLY_CONFIRMED', 'CONFIRMED']),
  positiveFactors: z.array(z.string()),
  negativeFactors: z.array(z.string()),
  isAiInferenceOnly: z.boolean(),
  hasRepairVerification: z.boolean(),
  calculatedAt: z.string(),
});

// ── Reasoning result (from OpenAI structured output) ──────────────────────────

export const DiagnosticReasoningResultSchema = z.object({
  caseSummary: z.string().min(1),
  identifiedSystem: z.string().min(1),
  dtcRelationships: z.string(),
  hypotheses: z.array(z.object({
    description: z.string(),
    confidenceNote: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    assumptions: z.array(z.string()),
  })).min(1),
  contradictions: z.array(z.string()),
  missingData: z.array(z.string()),
  nextRecommendedTest: z.object({
    title: z.string(),
    rationale: z.string(),
    requiredTools: z.array(z.string()),
    testConditions: z.string(),
    expectedResults: z.string(),
    decisionBranches: z.array(z.object({
      condition: z.string(),
      conclusion: z.string(),
    })),
  }),
  safetyWarnings: z.array(DiagnosticSafetyWarningSchema),
  componentsNotToReplaceYet: z.array(z.string()),
  evidenceQuality: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']),
  provisionalConfidence: z.number().min(0).max(100),
  assumptions: z.array(z.string()),
});

// ── Review result (from Claude structured output) ─────────────────────────────

export const DiagnosticReviewResultSchema = z.object({
  agreesWithPrimary: z.boolean(),
  disagreementPoints: z.array(z.string()),
  unsupportedAssumptions: z.array(z.string()),
  missingPrerequisiteTests: z.array(z.string()),
  unsafeRecommendations: z.array(z.string()),
  evidenceQualityConcerns: z.array(z.string()),
  suggestedCorrections: z.array(z.string()),
  severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR', 'INFORMATIONAL']),
  approvalState: z.enum(['APPROVED', 'APPROVED_WITH_CAVEATS', 'REJECTED', 'REQUIRES_MORE_DATA']),
});

// ── Session create ─────────────────────────────────────────────────────────────

export const CreateDiagnosticSessionSchema = z.object({
  shopId: z.string().uuid(),
  technicianId: z.string().uuid(),
  vehicleId: z.string().uuid().optional(),
  jobCardId: z.string().uuid().optional(),
  isSimulated: z.boolean().default(true),
});

// ── Scan upload (from bridge) ──────────────────────────────────────────────────

export const BridgeScanUploadSchema = z.object({
  schemaVersion: z.string(),
  bridgeId: z.string().uuid(),
  shopId: z.string().uuid(),
  sessionId: z.string().uuid(),
  requestId: z.string().uuid(),
  requestTimestamp: z.string(),
  vehicle: z.object({
    vin: z.string().min(11).max(17),
    vinSource: z.enum(['SCAN', 'MANUAL', 'VEHICLE_RECORD']),
    year: z.number().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
  }),
  modules: z.array(z.object({
    name: z.string(),
    address: z.string(),
    protocol: z.string(),
    supportsObd: z.boolean(),
    rawIdentification: z.record(z.string(), z.string()).optional(),
  })),
  dtcs: z.array(z.object({
    moduleAddress: z.string(),
    code: z.string(),
    type: z.enum(['CONFIRMED', 'PENDING', 'PERMANENT', 'HISTORY']),
    rawPayload: z.string().optional(),
  })),
  freezeFrames: z.array(z.object({
    dtcCode: z.string(),
    moduleAddress: z.string(),
    parameters: z.array(DiagnosticMeasurementSchema),
    rawPayload: z.string(),
  })),
  liveData: z.array(DiagnosticMeasurementSchema).optional(),
  readinessMonitors: z.record(z.string(), z.enum(['COMPLETE', 'INCOMPLETE', 'NOT_SUPPORTED'])).optional(),
});

// ── Bridge pairing ─────────────────────────────────────────────────────────────

export const BridgePairRequestSchema = z.object({
  pairingCode: z.string().min(6).max(12),
  machineId: z.string().min(8).max(128),
  bridgeVersion: z.string(),
  osVersion: z.string().optional(),
  displayName: z.string().min(1).max(100),
});

// ── Technician feedback ────────────────────────────────────────────────────────

export const TechnicianFeedbackSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(['REASONING', 'HYPOTHESIS', 'TEST_PLAN', 'SAFETY_WARNING']),
  feedbackType: z.enum([
    'USEFUL', 'NOT_USEFUL', 'INCORRECT', 'UNSAFE',
    'WRONG_VEHICLE', 'WRONG_SPECIFICATION', 'WRONG_CONNECTOR',
    'MISSING_TEST', 'OTHER',
  ]),
  notes: z.string().max(2000).optional(),
});

// ── Repair verification ────────────────────────────────────────────────────────

export const RepairVerificationSchema = z.object({
  confirmedRootCause: z.string().min(1),
  repairPerformed: z.string().min(1),
  partsUsed: z.array(z.object({
    partNumber: z.string().optional(),
    description: z.string(),
    quantity: z.number().int().positive(),
  })),
  laborHours: z.number().positive().optional(),
  postRepairDtcCodes: z.array(z.string()),
  complaintResolved: z.boolean(),
  verificationNotes: z.string().max(5000).optional(),
});

// ── Test result ────────────────────────────────────────────────────────────────

export const TestResultInputSchema = z.object({
  testPlanId: z.string().uuid(),
  outcome: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE', 'SKIPPED']),
  measurements: z.array(DiagnosticMeasurementSchema),
  notes: z.string().max(5000).optional(),
  imagesUploaded: z.array(z.string()).optional().default([]),
});

export type CreateDiagnosticSessionInput = z.infer<typeof CreateDiagnosticSessionSchema>;
export type BridgeScanUploadInput = z.infer<typeof BridgeScanUploadSchema>;
export type BridgePairRequestInput = z.infer<typeof BridgePairRequestSchema>;
export type DiagnosticReasoningOutput = z.infer<typeof DiagnosticReasoningResultSchema>;
export type DiagnosticReviewOutput = z.infer<typeof DiagnosticReviewResultSchema>;
export type TechnicianFeedbackInput = z.infer<typeof TechnicianFeedbackSchema>;
export type RepairVerificationInput = z.infer<typeof RepairVerificationSchema>;
export type TestResultInput = z.infer<typeof TestResultInputSchema>;
