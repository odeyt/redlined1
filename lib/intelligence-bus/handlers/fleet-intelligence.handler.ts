/**
 * lib/intelligence-bus/handlers/fleet-intelligence.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  VehicleHealthUpdatedEvent,
  DiagnosticSessionCompletedEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerFleetIntelligenceHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
      console.log('[Fleet] repair verified, triggering fleet re-analysis', { vehicleId: event.vehicleId, outcome: event.outcomeStatus });
    }),
    bus.subscribe('vehicle.health.updated', async (event: VehicleHealthUpdatedEvent) => {
      console.log('[Fleet] vehicle health updated', { vehicleId: event.vehicleId, score: event.overallScore });
    }),
    bus.subscribe('diagnostic.session.completed', async (event: DiagnosticSessionCompletedEvent) => {
      console.log('[Fleet] diagnostic session completed', { sessionId: event.diagnosticSessionId, dtcCount: event.dtcCodesFound.length, confirmedRepair: event.confirmedRepair });
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
