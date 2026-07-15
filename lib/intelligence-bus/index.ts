/**
 * lib/intelligence-bus/index.ts
 *
 * Redline Intelligence Bus — public API surface.
 * Import from here, not from internal files directly.
 */

// Bus singleton + class
export { intelligenceBus, RibEventBus } from './bus';
export type { RibPublishResult } from './bus';

// Publisher helpers
export { publish, createPublisher } from './publisher';

// Loop guard helpers
export { derivedFrom, loopGuard, LoopGuard, RibLoopError, MAX_EVENTS_PER_CORRELATION } from './loop-guard';

// Payload governance
export { payloadGuardMiddleware, RibPayloadSizeError, RibSecretLeakError, MAX_EVENT_PAYLOAD_BYTES } from './payload-guard';

// Idempotency
export { runIdempotent, buildIdempotencyKey } from './idempotency';
export type { HandlerMeta, DeliveryStatus, DeliveryRecord, IdempotentRunResult } from './idempotency';

// Event types
export type {
  RibBaseEvent,
  RibEvent,
  RibEventType,
  RibEventOfType,
  RibPayloadReference,
  VehicleConnectedEvent,
  VehicleIdentifiedEvent,
  VehicleDisconnectedEvent,
  VehicleMileageUpdatedEvent,
  DiagnosticSessionCreatedEvent,
  DiagnosticSessionCompletedEvent,
  DiagnosticModuleDetectedEvent,
  DiagnosticDtcReadEvent,
  DiagnosticFreezeFrameCapturedEvent,
  DiagnosticLiveDataCapturedEvent,
  DiagnosticWaveformUploadedEvent,
  DiagnosticMeasurementRecordedEvent,
  DiagnosticImageUploadedEvent,
  DiagnosticPdfUploadedEvent,
  DiagnosticReasoningRequestedEvent,
  DiagnosticReasoningCompletedEvent,
  DiagnosticClaudeReviewCompletedEvent,
  DiagnosticHypothesisUpdatedEvent,
  DiagnosticNextTestGeneratedEvent,
  DiagnosticTechnicianResultEnteredEvent,
  RepairVerifiedEvent,
  RepairRecommendationCreatedEvent,
  ServiceCompletedEvent,
  JobCardUpdatedEvent,
  EstimateApprovedEvent,
  InvoicePaidEvent,
  CustomerNotifiedEvent,
  VehicleHealthUpdatedEvent,
  FleetHealthUpdatedEvent,
  InventoryRecommendationCreatedEvent,
  FailurePredictedEvent,
} from './event-types';
export { MAX_EVENT_DEPTH, RIB_SCHEMA_VERSION, REPLAY_SUPPRESSED_EVENT_TYPES } from './event-types';

// Schemas
export { RibEventSchema } from './schemas';

// Dispatcher
export { RibEventDispatcher } from './event-dispatcher';
export type { DispatchResult, RibSubscription, RibSubscriberInfo } from './event-dispatcher';

// Middleware
export { defaultMiddlewarePipeline, loggingMiddleware, validationMiddleware, correlationMiddleware } from './middleware';
export type { RibMiddlewareFn } from './middleware';
export { RibValidationError } from './middleware/validation';

// Handler registration
export { initializeRibHandlers, activeSubscriberIds } from './handlers/index';
export type { RibHandlerFlags } from './handlers/index';
