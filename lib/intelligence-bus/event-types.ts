/**
 * lib/intelligence-bus/event-types.ts
 *
 * Strongly typed event contracts for the Redline Intelligence Bus.
 * Every event extends RibBaseEvent which provides the required envelope fields.
 * Handlers receive a RibEvent discriminated union — no `any` types.
 */

// ---------------------------------------------------------------------------
// Base envelope — every RIB event includes these fields
// ---------------------------------------------------------------------------

export interface RibBaseEvent {
  /** Globally unique event identifier (UUID v4) */
  eventId: string;
  /** ISO-8601 timestamp when the event occurred */
  timestamp: string;
  /** Multi-tenant organization identifier */
  organizationId: string;
  /** Shop this event belongs to */
  shopId: string;
  /** Technician who triggered the action (null for system events) */
  technicianId: string | null;
  /** Vehicle involved in this event */
  vehicleId: string | null;
  /** Diagnostic session this event is part of */
  diagnosticSessionId: string | null;
  /** Groups related events across handlers (trace ID) */
  correlationId: string;
  /** Event schema version for forward-compatibility */
  schemaVersion: '1.0';
  /** Discriminator — narrows to a concrete event type */
  eventType: RibEventType;
}

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

export type RibEventType =
  | 'vehicle.connected'
  | 'vehicle.identified'
  | 'vehicle.disconnected'
  | 'vehicle.mileage_updated'
  | 'diagnostic.session.created'
  | 'diagnostic.session.completed'
  | 'diagnostic.module.detected'
  | 'diagnostic.dtc.read'
  | 'diagnostic.freeze_frame.captured'
  | 'diagnostic.live_data.captured'
  | 'diagnostic.waveform.uploaded'
  | 'diagnostic.measurement.recorded'
  | 'diagnostic.image.uploaded'
  | 'diagnostic.pdf.uploaded'
  | 'diagnostic.reasoning.requested'
  | 'diagnostic.reasoning.completed'
  | 'diagnostic.claude_review.completed'
  | 'diagnostic.hypothesis.updated'
  | 'diagnostic.next_test.generated'
  | 'diagnostic.technician_result.entered'
  | 'repair.verified'
  | 'repair.recommendation.created'
  | 'service.completed'
  | 'job_card.updated'
  | 'estimate.approved'
  | 'invoice.paid'
  | 'customer.notified'
  | 'vehicle.health.updated'
  | 'fleet.health.updated'
  | 'inventory.recommendation.created'
  | 'failure.predicted';

// ---------------------------------------------------------------------------
// Concrete event interfaces
// ---------------------------------------------------------------------------

export interface VehicleConnectedEvent extends RibBaseEvent {
  eventType: 'vehicle.connected';
  vin: string | null;
  hardwareType: string;        // 'SIMULATED' | 'J2534_PASSTHRU' | etc.
  bridgeDeviceId: string | null;
  protocolDetected: string | null;
}

export interface VehicleIdentifiedEvent extends RibBaseEvent {
  eventType: 'vehicle.identified';
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  engineCode: string | null;
  ecuCount: number;
}

export interface VehicleDisconnectedEvent extends RibBaseEvent {
  eventType: 'vehicle.disconnected';
  durationSeconds: number;
}

export interface VehicleMileageUpdatedEvent extends RibBaseEvent {
  eventType: 'vehicle.mileage_updated';
  previousOdometerKm: number | null;
  currentOdometerKm: number;
  source: 'manual' | 'obd' | 'bridge';
}

export interface DiagnosticSessionCreatedEvent extends RibBaseEvent {
  eventType: 'diagnostic.session.created';
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  complaintText: string | null;
}

export interface DiagnosticSessionCompletedEvent extends RibBaseEvent {
  eventType: 'diagnostic.session.completed';
  finalStatus: string;
  dtcCodesFound: string[];
  hypothesisCount: number;
  confirmedRepair: boolean;
  totalDurationMinutes: number;
}

export interface DiagnosticModuleDetectedEvent extends RibBaseEvent {
  eventType: 'diagnostic.module.detected';
  moduleId: string;
  moduleName: string;
  address: string;
  protocol: string;
  dtcCount: number;
}

export interface DiagnosticDtcReadEvent extends RibBaseEvent {
  eventType: 'diagnostic.dtc.read';
  dtcCode: string;
  description: string | null;
  system: string | null;
  moduleId: string | null;
  isPending: boolean;
  isPermanent: boolean;
  odometerKm: number | null;
}

export interface DiagnosticFreezeFrameCapturedEvent extends RibBaseEvent {
  eventType: 'diagnostic.freeze_frame.captured';
  dtcCode: string;
  parameters: Record<string, { value: number; unit: string }>;
  capturedAt: string;
}

export interface DiagnosticLiveDataCapturedEvent extends RibBaseEvent {
  eventType: 'diagnostic.live_data.captured';
  durationSeconds: number;
  sampleCount: number;
  pidCodes: string[];
  captureId: string;
}

export interface DiagnosticWaveformUploadedEvent extends RibBaseEvent {
  eventType: 'diagnostic.waveform.uploaded';
  fileId: string;
  channel: string;
  durationMs: number;
  sampleRate: number;
}

export interface DiagnosticMeasurementRecordedEvent extends RibBaseEvent {
  eventType: 'diagnostic.measurement.recorded';
  measurementType: string;
  value: number;
  unit: string;
  sourceModule: string;
  passOrFail: 'pass' | 'fail' | 'inconclusive' | null;
}

export interface DiagnosticImageUploadedEvent extends RibBaseEvent {
  eventType: 'diagnostic.image.uploaded';
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string | null;
}

export interface DiagnosticPdfUploadedEvent extends RibBaseEvent {
  eventType: 'diagnostic.pdf.uploaded';
  fileId: string;
  fileName: string;
  sizeBytes: number;
  documentType: 'tsb' | 'wiring_diagram' | 'service_manual' | 'estimate' | 'other';
}

export interface DiagnosticReasoningRequestedEvent extends RibBaseEvent {
  eventType: 'diagnostic.reasoning.requested';
  providerName: string;
  modelName: string;
  promptVersion: string;
  dtcCodes: string[];
  hypothesisCount: number;
}

export interface DiagnosticReasoningCompletedEvent extends RibBaseEvent {
  eventType: 'diagnostic.reasoning.completed';
  providerName: string;
  modelName: string;
  hypothesesGenerated: number;
  primaryHypothesis: string | null;
  confidenceScore: number;
  durationMs: number;
  isSimulated: boolean;
}

export interface DiagnosticClaudeReviewCompletedEvent extends RibBaseEvent {
  eventType: 'diagnostic.claude_review.completed';
  reviewedHypotheses: number;
  agreementLevel: 'agree' | 'partial' | 'disagree';
  additionalInsights: boolean;
  confidenceAdjustment: number;
  durationMs: number;
}

export interface DiagnosticHypothesisUpdatedEvent extends RibBaseEvent {
  eventType: 'diagnostic.hypothesis.updated';
  hypothesisId: string;
  description: string;
  confidenceScore: number;
  confidenceBand: string;
  action: 'created' | 'updated' | 'promoted' | 'dismissed';
  isAiDerived: boolean;
}

export interface DiagnosticNextTestGeneratedEvent extends RibBaseEvent {
  eventType: 'diagnostic.next_test.generated';
  testPlanId: string;
  testCount: number;
  primaryTestDescription: string;
  estimatedMinutes: number;
}

export interface DiagnosticTechnicianResultEnteredEvent extends RibBaseEvent {
  eventType: 'diagnostic.technician_result.entered';
  testResultId: string;
  testDescription: string;
  outcome: 'pass' | 'fail' | 'inconclusive';
  value: string | null;
  unit: string | null;
  notes: string | null;
}

export interface RepairVerifiedEvent extends RibBaseEvent {
  eventType: 'repair.verified';
  repairCaseId: string;
  dtcCodesFixed: string[];
  rootCause: string;
  partsReplaced: string[];
  laborMinutes: number;
  outcomeStatus: 'resolved' | 'partial' | 'comeback';
  technicianNotes: string | null;
  totalCost: number | null;
  customerId: string | null;
}

export interface RepairRecommendationCreatedEvent extends RibBaseEvent {
  eventType: 'repair.recommendation.created';
  recommendationId: string;
  description: string;
  estimatedCost: number | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  basedOnHypothesis: string | null;
}

export interface ServiceCompletedEvent extends RibBaseEvent {
  eventType: 'service.completed';
  serviceType: string;
  laborMinutes: number;
  partsUsed: string[];
  nextServiceDueKm: number | null;
  nextServiceDueDate: string | null;
}

export interface JobCardUpdatedEvent extends RibBaseEvent {
  eventType: 'job_card.updated';
  jobCardId: string;
  previousStatus: string;
  newStatus: string;
  customerId: string | null;
  estimatedCompletionAt: string | null;
}

export interface EstimateApprovedEvent extends RibBaseEvent {
  eventType: 'estimate.approved';
  estimateId: string;
  approvedAmount: number;
  currency: string;
  customerId: string | null;
  lineItemCount: number;
}

export interface InvoicePaidEvent extends RibBaseEvent {
  eventType: 'invoice.paid';
  invoiceId: string;
  amount: number;
  currency: string;
  customerId: string | null;
  paymentMethod: string;
}

export interface CustomerNotifiedEvent extends RibBaseEvent {
  eventType: 'customer.notified';
  customerId: string;
  channel: 'sms' | 'email' | 'line' | 'whatsapp' | 'push' | 'in_app';
  notificationType: string;
  success: boolean;
}

export interface VehicleHealthUpdatedEvent extends RibBaseEvent {
  eventType: 'vehicle.health.updated';
  overallScore: number;
  previousScore: number | null;
  systemScores: Record<string, number>;
  criticalSystemsAffected: string[];
}

export interface FleetHealthUpdatedEvent extends RibBaseEvent {
  eventType: 'fleet.health.updated';
  customerId: string;
  fleetSize: number;
  fleetHealthScore: number;
  highMaintenanceCount: number;
  recurringPatternCount: number;
}

export interface InventoryRecommendationCreatedEvent extends RibBaseEvent {
  eventType: 'inventory.recommendation.created';
  partNumber: string | null;
  partName: string;
  currentStock: number;
  recommendedReorderQty: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedDaysUntilStockout: number | null;
}

export interface FailurePredictedEvent extends RibBaseEvent {
  eventType: 'failure.predicted';
  predictionId: string;
  componentName: string;
  failureProbability: number;
  estimatedMileageAtFailure: number | null;
  estimatedDaysUntilFailure: number | null;
  evidenceType: string;
  isAiDerived: false;  // Predictive engine is always deterministic
}

// ---------------------------------------------------------------------------
// Discriminated union for type-safe handler switching
// ---------------------------------------------------------------------------

export type RibEvent =
  | VehicleConnectedEvent
  | VehicleIdentifiedEvent
  | VehicleDisconnectedEvent
  | VehicleMileageUpdatedEvent
  | DiagnosticSessionCreatedEvent
  | DiagnosticSessionCompletedEvent
  | DiagnosticModuleDetectedEvent
  | DiagnosticDtcReadEvent
  | DiagnosticFreezeFrameCapturedEvent
  | DiagnosticLiveDataCapturedEvent
  | DiagnosticWaveformUploadedEvent
  | DiagnosticMeasurementRecordedEvent
  | DiagnosticImageUploadedEvent
  | DiagnosticPdfUploadedEvent
  | DiagnosticReasoningRequestedEvent
  | DiagnosticReasoningCompletedEvent
  | DiagnosticClaudeReviewCompletedEvent
  | DiagnosticHypothesisUpdatedEvent
  | DiagnosticNextTestGeneratedEvent
  | DiagnosticTechnicianResultEnteredEvent
  | RepairVerifiedEvent
  | RepairRecommendationCreatedEvent
  | ServiceCompletedEvent
  | JobCardUpdatedEvent
  | EstimateApprovedEvent
  | InvoicePaidEvent
  | CustomerNotifiedEvent
  | VehicleHealthUpdatedEvent
  | FleetHealthUpdatedEvent
  | InventoryRecommendationCreatedEvent
  | FailurePredictedEvent;

/** Extracts the concrete event interface for a given eventType literal */
export type RibEventOfType<T extends RibEventType> = Extract<RibEvent, { eventType: T }>;
