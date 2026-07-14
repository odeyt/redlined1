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

// Event types
export type {
  RibBaseEvent,
  RibEvent,
  RibEventType,
  RibEventOfType,
  // All concrete event interfaces
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

// Schemas
export { RibEventSchema, RibBaseSchema } from './schemas';

// Subscriber types
export type { RibHandler, RibTypedHandler, RibSubscription, RibSubscriberInfo } from './subscriber';

// Dispatcher
export { RibEventDispatcher } from './event-dispatcher';
export type { DispatchResult } from './event-dispatcher';

// Middleware
export { defaultMiddlewarePipeline, loggingMiddleware, validationMiddleware, correlationMiddleware } from './middleware';
export type { RibMiddlewareFn } from './middleware';
export { RibValidationError } from './middleware/validation';

// Handler registration
export { initializeRibHandlers, activeSubscriberIds } from './handlers/index';
export type { RibHandlerFlags } from './handlers/index';
