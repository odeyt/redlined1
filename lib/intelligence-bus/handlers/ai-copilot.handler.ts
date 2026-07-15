/**
 * lib/intelligence-bus/handlers/ai-copilot.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticReasoningCompletedEvent,
  DiagnosticHypothesisUpdatedEvent,
  VehicleHealthUpdatedEvent,
  RepairVerifiedEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerAiCopilotHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('diagnostic.reasoning.completed', async (event: DiagnosticReasoningCompletedEvent) => {
      console.log('[Copilot] reasoning completed', { sessionId: event.diagnosticSessionId, hypotheses: event.hypothesesGenerated, confidence: event.confidenceScore });
    }),
    bus.subscribe('diagnostic.hypothesis.updated', async (event: DiagnosticHypothesisUpdatedEvent) => {
      console.log('[Copilot] hypothesis updated', { hypothesisId: event.hypothesisId, action: event.action, band: event.confidenceBand });
    }),
    bus.subscribe('vehicle.health.updated', async (event: VehicleHealthUpdatedEvent) => {
      console.log('[Copilot] vehicle health updated', { vehicleId: event.vehicleId, score: event.overallScore, criticalSystems: event.criticalSystemsAffected });
    }),
    bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
      console.log('[Copilot] repair verified', { repairCaseId: event.repairCaseId, outcome: event.outcomeStatus, dtcCodes: event.dtcCodesFixed });
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
