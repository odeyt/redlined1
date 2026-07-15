/**
 * lib/intelligence-bus/schemas.ts
 *
 * Zod v4 schemas for every RIB event type. Mirrors the TypeScript interfaces
 * in event-types.ts and is the authoritative validation layer at API boundaries.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Base schema — shared by all events
// ---------------------------------------------------------------------------

const RibPayloadReferenceSchema = z.object({
  storageProvider: z.enum(['supabase_storage', 's3', 'local']),
  objectKey: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  schemaVersion: z.string().min(1),
  accessClassification: z.enum(['shop_private', 'tenant_private', 'global_anonymized']),
});

const RibBaseSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal('1.0'),

  // Causality envelope
  occurredAt: z.string().datetime({ offset: true }),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().nullable(),
  eventDepth: z.number().int().min(0).max(10),
  originModule: z.string().min(1),

  // Tenant
  organizationId: z.string().uuid(),
  shopId: z.string().uuid(),

  // Actor
  technicianId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  diagnosticSessionId: z.string().uuid().nullable(),
});

// ---------------------------------------------------------------------------
// Per-event schemas
// ---------------------------------------------------------------------------

const VehicleConnectedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.connected'),
  vin: z.string().nullable(),
  hardwareType: z.string().min(1),
  bridgeDeviceId: z.string().nullable(),
  protocolDetected: z.string().nullable(),
});

const VehicleIdentifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.identified'),
  vin: z.string().min(1),
  year: z.number().int().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  engineCode: z.string().nullable(),
  ecuCount: z.number().int().nonnegative(),
});

const VehicleDisconnectedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.disconnected'),
  durationSeconds: z.number().nonnegative(),
});

const VehicleMileageUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.mileage_updated'),
  previousOdometerKm: z.number().nonnegative().nullable(),
  currentOdometerKm: z.number().nonnegative(),
  source: z.enum(['manual', 'obd', 'bridge']),
});

const DiagnosticSessionCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.session.created'),
  vehicleYear: z.number().int().nullable(),
  vehicleMake: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  complaintText: z.string().nullable(),
});

const DiagnosticSessionCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.session.completed'),
  finalStatus: z.string().min(1),
  dtcCodesFound: z.array(z.string()),
  hypothesisCount: z.number().int().nonnegative(),
  confirmedRepair: z.boolean(),
  totalDurationMinutes: z.number().nonnegative(),
});

const DiagnosticModuleDetectedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.module.detected'),
  moduleId: z.string().min(1),
  moduleName: z.string().min(1),
  address: z.string().min(1),
  protocol: z.string().min(1),
  dtcCount: z.number().int().nonnegative(),
});

const DiagnosticDtcReadSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.dtc.read'),
  dtcCode: z.string().min(1),
  description: z.string().nullable(),
  system: z.string().nullable(),
  moduleId: z.string().nullable(),
  isPending: z.boolean(),
  isPermanent: z.boolean(),
  odometerKm: z.number().nonnegative().nullable(),
});

const DiagnosticFreezeFrameCapturedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.freeze_frame.captured'),
  dtcCode: z.string().min(1),
  parameters: z.record(z.string(), z.object({ value: z.number(), unit: z.string() })),
  capturedAt: z.string().datetime({ offset: true }),
});

const DiagnosticLiveDataCapturedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.live_data.captured'),
  durationSeconds: z.number().nonnegative(),
  sampleCount: z.number().int().nonnegative(),
  pidCodes: z.array(z.string()),
  captureId: z.string().uuid(),
  storageRef: RibPayloadReferenceSchema.nullable(),
});

const DiagnosticWaveformUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.waveform.uploaded'),
  channel: z.string().min(1),
  durationMs: z.number().nonnegative(),
  sampleRate: z.number().positive(),
  storageRef: RibPayloadReferenceSchema,
});

const DiagnosticMeasurementRecordedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.measurement.recorded'),
  measurementType: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  sourceModule: z.string().min(1),
  passOrFail: z.enum(['pass', 'fail', 'inconclusive']).nullable(),
});

const DiagnosticImageUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.image.uploaded'),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  capturedAt: z.string().datetime({ offset: true }).nullable(),
  storageRef: RibPayloadReferenceSchema,
});

const DiagnosticPdfUploadedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.pdf.uploaded'),
  fileName: z.string().min(1),
  documentType: z.enum(['tsb', 'wiring_diagram', 'service_manual', 'estimate', 'other']),
  storageRef: RibPayloadReferenceSchema,
});

const DiagnosticReasoningRequestedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.reasoning.requested'),
  providerName: z.string().min(1),
  modelName: z.string().min(1),
  promptVersion: z.string().min(1),
  dtcCodes: z.array(z.string()),
  hypothesisCount: z.number().int().nonnegative(),
});

const DiagnosticReasoningCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.reasoning.completed'),
  providerName: z.string().min(1),
  modelName: z.string().min(1),
  hypothesesGenerated: z.number().int().nonnegative(),
  primaryHypothesis: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1),
  durationMs: z.number().nonnegative(),
  isSimulated: z.boolean(),
});

const DiagnosticClaudeReviewCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.claude_review.completed'),
  reviewedHypotheses: z.number().int().nonnegative(),
  agreementLevel: z.enum(['agree', 'partial', 'disagree']),
  additionalInsights: z.boolean(),
  confidenceAdjustment: z.number(),
  durationMs: z.number().nonnegative(),
});

const DiagnosticHypothesisUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.hypothesis.updated'),
  hypothesisId: z.string().uuid(),
  description: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  confidenceBand: z.string().min(1),
  action: z.enum(['created', 'updated', 'promoted', 'dismissed']),
  isAiDerived: z.boolean(),
});

const DiagnosticNextTestGeneratedSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.next_test.generated'),
  testPlanId: z.string().uuid(),
  testCount: z.number().int().positive(),
  primaryTestDescription: z.string().min(1),
  estimatedMinutes: z.number().nonnegative(),
});

const DiagnosticTechnicianResultEnteredSchema = RibBaseSchema.extend({
  eventType: z.literal('diagnostic.technician_result.entered'),
  testResultId: z.string().uuid(),
  testDescription: z.string().min(1),
  outcome: z.enum(['pass', 'fail', 'inconclusive']),
  value: z.string().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

const RepairVerifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('repair.verified'),
  repairCaseId: z.string().uuid(),
  dtcCodesFixed: z.array(z.string()),
  rootCause: z.string().min(1),
  partsReplaced: z.array(z.string()),
  laborMinutes: z.number().nonnegative(),
  outcomeStatus: z.enum(['resolved', 'partial', 'comeback']),
  technicianNotes: z.string().nullable(),
  totalCost: z.number().nonnegative().nullable(),
  customerId: z.string().uuid().nullable(),
});

const RepairRecommendationCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('repair.recommendation.created'),
  recommendationId: z.string().uuid(),
  description: z.string().min(1),
  estimatedCost: z.number().nonnegative().nullable(),
  urgency: z.enum(['critical', 'high', 'medium', 'low']),
  basedOnHypothesis: z.string().nullable(),
});

const ServiceCompletedSchema = RibBaseSchema.extend({
  eventType: z.literal('service.completed'),
  serviceType: z.string().min(1),
  laborMinutes: z.number().nonnegative(),
  partsUsed: z.array(z.string()),
  nextServiceDueKm: z.number().nonnegative().nullable(),
  nextServiceDueDate: z.string().nullable(),
});

const JobCardUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('job_card.updated'),
  jobCardId: z.string().uuid(),
  previousStatus: z.string().min(1),
  newStatus: z.string().min(1),
  customerId: z.string().uuid().nullable(),
  estimatedCompletionAt: z.string().nullable(),
});

const EstimateApprovedSchema = RibBaseSchema.extend({
  eventType: z.literal('estimate.approved'),
  estimateId: z.string().uuid(),
  approvedAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  customerId: z.string().uuid().nullable(),
  lineItemCount: z.number().int().positive(),
});

const InvoicePaidSchema = RibBaseSchema.extend({
  eventType: z.literal('invoice.paid'),
  invoiceId: z.string().uuid(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  customerId: z.string().uuid().nullable(),
  paymentMethod: z.string().min(1),
});

const CustomerNotifiedSchema = RibBaseSchema.extend({
  eventType: z.literal('customer.notified'),
  customerId: z.string().uuid(),
  channel: z.enum(['sms', 'email', 'line', 'whatsapp', 'push', 'in_app']),
  notificationType: z.string().min(1),
  success: z.boolean(),
});

const VehicleHealthUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('vehicle.health.updated'),
  overallScore: z.number().min(0).max(100),
  previousScore: z.number().min(0).max(100).nullable(),
  systemScores: z.record(z.string(), z.number().min(0).max(100)),
  criticalSystemsAffected: z.array(z.string()),
});

const FleetHealthUpdatedSchema = RibBaseSchema.extend({
  eventType: z.literal('fleet.health.updated'),
  customerId: z.string().uuid(),
  fleetSize: z.number().int().positive(),
  fleetHealthScore: z.number().min(0).max(100),
  highMaintenanceCount: z.number().int().nonnegative(),
  recurringPatternCount: z.number().int().nonnegative(),
});

const InventoryRecommendationCreatedSchema = RibBaseSchema.extend({
  eventType: z.literal('inventory.recommendation.created'),
  partNumber: z.string().nullable(),
  partName: z.string().min(1),
  currentStock: z.number().int().nonnegative(),
  recommendedReorderQty: z.number().int().positive(),
  urgency: z.enum(['critical', 'high', 'medium', 'low']),
  estimatedDaysUntilStockout: z.number().int().nonnegative().nullable(),
});

const FailurePredictedSchema = RibBaseSchema.extend({
  eventType: z.literal('failure.predicted'),
  predictionId: z.string().uuid(),
  componentName: z.string().min(1),
  failureProbability: z.number().min(0).max(1),
  estimatedMileageAtFailure: z.number().nonnegative().nullable(),
  estimatedDaysUntilFailure: z.number().int().nonnegative().nullable(),
  evidenceType: z.string().min(1),
  isAiDerived: z.literal(false),
});

// ---------------------------------------------------------------------------
// Master discriminated union schema
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

export type RibEventSchemaInput = z.input<typeof RibEventSchema>;
export type RibEventSchemaOutput = z.output<typeof RibEventSchema>;
