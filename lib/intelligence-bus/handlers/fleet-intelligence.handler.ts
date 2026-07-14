/**
 * lib/intelligence-bus/handlers/fleet-intelligence.handler.ts
 *
 * Fleet Intelligence subscriber.
 *
 * Subscribes to:
 *   repair.verified, vehicle.health.updated, diagnostic.session.completed
 *
 * Bridges RIB events into the existing FleetIntelligenceEngine
 * via the platform events API — keeps engines decoupled from the bus.
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  VehicleHealthUpdatedEvent,
  DiagnosticSessionCompletedEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerFleetIntelligenceHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'fleet_intelligence',
    'Fleet Intelligence',
    [
      'repair.verified',
      'vehicle.health.updated',
      'diagnostic.session.completed',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'repair.verified':
          await handleRepairVerified(event as RepairVerifiedEvent);
          break;
        case 'vehicle.health.updated':
          await handleVehicleHealthUpdated(event as VehicleHealthUpdatedEvent);
          break;
        case 'diagnostic.session.completed':
          await handleSessionCompleted(event as DiagnosticSessionCompletedEvent);
          break;
      }
    },
  );
}

async function handleRepairVerified(event: RepairVerifiedEvent): Promise<void> {
  // Future: re-trigger fleet analysis for the customer's fleet
  console.log('[Fleet] repair verified, triggering fleet re-analysis', {
    vehicleId: event.vehicleId,
    customerId: event.repairCaseId,
    outcome: event.outcomeStatus,
  });
}

async function handleVehicleHealthUpdated(event: VehicleHealthUpdatedEvent): Promise<void> {
  // Future: refresh fleet health score when individual vehicle score changes
  console.log('[Fleet] vehicle health updated', {
    vehicleId: event.vehicleId,
    score: event.overallScore,
  });
}

async function handleSessionCompleted(event: DiagnosticSessionCompletedEvent): Promise<void> {
  // Future: incorporate diagnostic findings into fleet trend analysis
  console.log('[Fleet] diagnostic session completed', {
    sessionId: event.diagnosticSessionId,
    dtcCount: event.dtcCodesFound.length,
    confirmedRepair: event.confirmedRepair,
  });
}
