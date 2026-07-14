/**
 * lib/intelligence-bus/handlers/ai-copilot.handler.ts
 *
 * AI Copilot subscriber.
 *
 * Subscribes to:
 *   diagnostic.reasoning.completed, diagnostic.hypothesis.updated,
 *   vehicle.health.updated, repair.verified
 *
 * The Copilot consumes orchestrator output and builds context-aware
 * suggestions for the service advisor / technician UI.
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticReasoningCompletedEvent,
  DiagnosticHypothesisUpdatedEvent,
  VehicleHealthUpdatedEvent,
  RepairVerifiedEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerAiCopilotHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'ai_copilot',
    'AI Copilot',
    [
      'diagnostic.reasoning.completed',
      'diagnostic.hypothesis.updated',
      'vehicle.health.updated',
      'repair.verified',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'diagnostic.reasoning.completed':
          await handleReasoningCompleted(event as DiagnosticReasoningCompletedEvent);
          break;
        case 'diagnostic.hypothesis.updated':
          await handleHypothesisUpdated(event as DiagnosticHypothesisUpdatedEvent);
          break;
        case 'vehicle.health.updated':
          await handleVehicleHealthUpdated(event as VehicleHealthUpdatedEvent);
          break;
        case 'repair.verified':
          await handleRepairVerified(event as RepairVerifiedEvent);
          break;
      }
    },
  );
}

async function handleReasoningCompleted(event: DiagnosticReasoningCompletedEvent): Promise<void> {
  // Future: push copilot suggestions to active technician session via realtime
  console.log('[Copilot] reasoning completed', {
    sessionId: event.diagnosticSessionId,
    hypotheses: event.hypothesesGenerated,
    confidence: event.confidenceScore,
    provider: event.providerName,
  });
}

async function handleHypothesisUpdated(event: DiagnosticHypothesisUpdatedEvent): Promise<void> {
  // Future: update copilot context window with new hypothesis ranking
  console.log('[Copilot] hypothesis updated', {
    hypothesisId: event.hypothesisId,
    action: event.action,
    band: event.confidenceBand,
  });
}

async function handleVehicleHealthUpdated(event: VehicleHealthUpdatedEvent): Promise<void> {
  // Future: surface health insights in copilot sidebar
  console.log('[Copilot] vehicle health updated', {
    vehicleId: event.vehicleId,
    score: event.overallScore,
    criticalSystems: event.criticalSystemsAffected,
  });
}

async function handleRepairVerified(event: RepairVerifiedEvent): Promise<void> {
  // Future: update copilot's repair pattern context
  console.log('[Copilot] repair verified', {
    repairCaseId: event.repairCaseId,
    outcome: event.outcomeStatus,
    dtcCodes: event.dtcCodesFixed,
  });
}
