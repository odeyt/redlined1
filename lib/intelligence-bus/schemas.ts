/**
 * lib/intelligence-bus/schemas.ts
 *
 * Zod v4 schemas for RIB event validation.
 * Every event published to the bus is validated before dispatch.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Base envelope schema
// ---------------------------------------------------------------------------

export const RibBaseSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  organizationId: z.string().min(1),
  shopId: z.string().uuid(),
  technicianId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  diagnosticSessionId: z.string().uuid().nullable(),
  correlationId: z.string().min(1),
  schemaVersion: z.literal('1.0'),
});

// ---------------------------------------------------------------------------
// Concrete event schemas
// ---------------------------------------------------------------------------

export const VehicleConnectedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.connected'),
  vin: z.string().nullable(),
  hardwareType: z.string(),
  bridgeDeviceId: z.string().nullable(),
  protocolDetected: z.string().nullable(),
});

export const VehicleIdentifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.identified'),
  vin: z.string(),
  year: z.number().int().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  engineCode: z.string().nullable(),
  ecuCount: z.number().int(),
});

export const VehicleDisconnectedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.disconnected'),
  durationSeconds: z.number(),
});

export const VehicleMileageUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.mileage_updated'),
  previousOdometerKm: z.number().nullable(),
  currentOdometerKm: z.number(),
  source: z.enum(['manual', 'obd', 'bridge']),
});

export const DiagnosticSessionCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.session.created'),
  vehicleYear: z.number().int().nullable(),
  vehicleMake: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  complaintText: z.string().nullable(),
});

export const DiagnosticSessionCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.session.completed'),
  finalStatus: z.string(),
  dtcCodesFound: z.array(z.string()),
  hypothesisCount: z.number().int(),
  confirmedRepair: z.boolean(),
  totalDurationMinutes: z.number(),
});

export const DiagnosticModuleDetectedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.module.detected'),
  moduleId: z.string(),
  moduleName: z.string(),
  address: z.string(),
  protocol: z.string(),
  dtcCount: z.number().int(),
});

export const DiagnosticDtcReadSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.dtc.read'),
  dtcCode: z.string().min(1),
  description: z.string().nullable(),
  system: z.string().nullable(),
  moduleId: z.string().nullable(),
  isPending: z.boolean(),
  isPermanent: z.boolean(),
  odometerKm: z.number().nullable(),
});

export const DiagnosticFreezeFrameCapturedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.freeze_frame.captured'),
  dtcCode: z.string(),
  parameters: z.record(z.string(), z.object({ value: z.number(), unit: z.string() })),
  capturedAt: z.string().datetime(),
});

export const DiagnosticLiveDataCapturedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.live_data.captured'),
  durationSeconds: z.number(),
  sampleCount: z.number().int(),
  pidCodes: z.array(z.string()),
  captureId: z.string().uuid(),
});

export const DiagnosticWaveformUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.waveform.uploaded'),
  fileId: z.string().uuid(),
  channel: z.string(),
  durationMs: z.number(),
  sampleRate: z.number(),
});

export const DiagnosticMeasurementRecordedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.measurement.recorded'),
  measurementType: z.string(),
  value: z.number(),
  unit: z.string(),
  sourceModule: z.string(),
  passOrFail: z.enum(['pass', 'fail', 'inconclusive']).nullable(),
});

export const DiagnosticImageUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.image.uploaded'),
  fileId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  capturedAt: z.string().datetime().nullable(),
});

export const DiagnosticPdfUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.pdf.uploaded'),
  fileId: z.string().uuid(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  documentType: z.enum(['tsb', 'wiring_diagram', 'service_manual', 'estimate', 'other']),
});

export const DiagnosticReasoningRequestedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.reasoning.requested'),
  providerName: z.string(),
  modelName: z.string(),
  promptVersion: z.string(),
  dtcCodes: z.array(z.string()),
  hypothesisCount: z.number().int(),
});

export const DiagnosticReasoningCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.reasoning.completed'),
  providerName: z.string(),
  modelName: z.string(),
  hypothesesGenerated: z.number().int(),
  primaryHypothesis: z.string().nullable(),
  confidenceScore: z.number().min(0).max(100),
  durationMs: z.number(),
  isSimulated: z.boolean(),
});

export const DiagnosticClaudeReviewCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.claude_review.completed'),
  reviewedHypotheses: z.number().int(),
  agreementLevel: z.enum(['agree', 'partial', 'disagree']),
  additionalInsights: z.boolean(),
  confidenceAdjustment: z.number(),
  durationMs: z.number(),
});

export const DiagnosticHypothesisUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.hypothesis.updated'),
  hypothesisId: z.string().uuid(),
  description: z.string(),
  confidenceScore: z.number().min(0).max(100),
  confidenceBand: z.string(),
  action: z.enum(['created', 'updated', 'promoted', 'dismissed']),
  isAiDerived: z.boolean(),
});

export const DiagnosticNextTestGeneratedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.next_test.generated'),
  testPlanId: z.string().uuid(),
  testCount: z.number().int(),
  primaryTestDescription: z.string(),
  estimatedMinutes: z.number(),
});

export const DiagnosticTechnicianResultEnteredSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.technician_result.entered'),
  testResultId: z.string().uuid(),
  testDescription: z.string(),
  outcome: z.enum(['pass', 'fail', 'inconclusive']),
  value: z.string().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

export const RepairVerifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('repair.verified'),
  repairCaseId: z.string().uuid(),
  dtcCodesFixed: z.array(z.string()),
  rootCause: z.string(),
  partsReplaced: z.array(z.string()),
  laborMinutes: z.number(),
  outcomeStatus: z.enum(['resolved', 'partial', 'comeback']),
  technicianNotes: z.string().nullable(),
  totalCost: z.number().nullable(),
  customerId: z.string().uuid().nullable(),
});

export const RepairRecommendationCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('repair.recommendation.created'),
  recommendationId: z.string().uuid(),
  description: z.string(),
  estimatedCost: z.number().nullable(),
  urgency: z.enum(['critical', 'high', 'medium', 'low']),
  basedOnHypothesis: z.string().nullable(),
});

export const ServiceCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('service.completed'),
  serviceType: z.string(),
  laborMinutes: z.number(),
  partsUsed: z.array(z.string()),
  nextServiceDueKm: z.number().nullable(),
  nextServiceDueDate: z.string().nullable(),
});

export const JobCardUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('job_card.updated'),
  jobCardId: z.string().uuid(),
  previousStatus: z.string(),
  newStatus: z.string(),
  customerId: z.string().uuid().nullable(),
  estimatedCompletionAt: z.string().nullable(),
});

export const EstimateApprovedSchema = RibBaseSchema.extend({
  eventType: z.literal('estimate.approved'),
  estimateId: z.string().uuid(),
  approvedAmount: z.number(),
  currency: z.string(),
  customerId: z.string().uuid().nullable(),
  lineItemCount: z.number().int(),
});

export const InvoicePaidSchema = RibBaseSchema.extend({
  eventType: z.literal('invoice.paid'),
  invoiceId: z.string().uuid(),
  amount: z.number(),
  currency: z.string(),
  customerId: z.string().uuid().nullable(),
  paymentMethod: z.string(),
});

export const CustomerNotifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('customer.notified'),
  customerId: z.string().uuid(),
  channel: z.enum(['sms', 'email', 'line', 'whatsapp', 'push', 'in_app']),
  notificationType: z.string(),
  success: z.boolean(),
});

export const VehicleHealthUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.health.updated'),
  overallScore: z.number().min(0).max(100),
  previousScore: z.number().min(0).max(100).nullable(),
  systemScores: z.record(z.string(), z.number()),
  criticalSystemsAffected: z.array(z.string()),
});

export const FleetHealthUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('fleet.health.updated'),
  customerId: z.string().uuid(),
  fleetSize: z.number().int(),
  fleetHealthScore: z.number().min(0).max(100),
  highMaintenanceCount: z.number().int(),
  recurringPatternCount: z.number().int(),
});

export const InventoryRecommendationCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('inventory.recommendation.created'),
  partNumber: z.string().nullable(),
  partName: z.string(),
  currentStock: z.number().int(),
  recommendedReorderQty: z.number().int(),
  urgency: z.enum(['critical', 'high', 'medium', 'low']),
  estimatedDaysUntilStockout: z.number().int().nullable(),
});

export const FailurePredictedSchema = RibBaseSchema.extend({
  eventType: z.literal('failure.predicted'),
  predictionId: z.string().uuid(),
  componentName: z.string(),
  failureProbability: z.number().min(0).max(1),
  estimatedMileageAtFailure: z.number().nullable(),
  estimatedDaysUntilFailure: z.number().int().nullable(),
  evidenceType: z.string(),
  isAiDerived: z.literal(false),
});

// ---------------------------------------------------------------------------
// Discriminated union schema — validates any RibEvent
// ---------------------------------------------------------------------------

export const RibEventSchema = z.discriminatedUnion('eventType', [
  VehicleConnectedSchema,
  VehicleIdentifiedSchema,
  VehicleDisconnectedSchema,
  VehicleMileageUpdatedSchema,
  DiagnosticSessionCreatedSchema,
  DiagnosticSessionCompletedSchema,
  DiagnosticModuleDetectedSchema,
  DiagnosticDtcReadSchema,
  DiagnosticFreezeFrameCapturedSchema,
  DiagnosticLiveDataCapturedSchema,
  DiagnosticWaveformUploadedSchema,
  DiagnosticMeasurementRecordedSchema,
  DiagnosticImageUploadedSchema,
  DiagnosticPdfUploadedSchema,
  DiagnosticReasoningRequestedSchema,
  DiagnosticReasoningCompletedSchema,
  DiagnosticClaudeReviewCompletedSchema,
  DiagnosticHypothesisUpdatedSchema,
  DiagnosticNextTestGeneratedSchema,
  DiagnosticTechnicianResultEnteredSchema,
  RepairVerifiedSchema,
  RepairRecommendationCreatedSchema,
  ServiceCompletedSchema,
  JobCardUpdatedSchema,
  EstimateApprovedSchema,
  InvoicePaidSchema,
  CustomerNotifiedSchema,
  VehicleHealthUpdatedSchema,
  FleetHealthUpdatedSchema,
  InventoryRecommendationCreatedSchema,
  FailurePredictedSchema,
]);

export type RibEventInput = z.input<typeof RibEventSchema>;
export type RibEventOutput = z.output<typeof RibEventSchema>;
