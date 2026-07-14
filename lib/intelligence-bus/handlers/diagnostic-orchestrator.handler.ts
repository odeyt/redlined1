/**
 * lib/intelligence-bus/handlers/diagnostic-orchestrator.handler.ts
 *
 * Diagnostic Orchestrator subscriber.
 *
 * Subscribes to:
 *   vehicle.connected, diagnostic.session.created,
 *   diagnostic.measurement.recorded, diagnostic.technician_result.entered
 *
 * Publishes back (via bus):
 *   diagnostic.reasoning.requested, diagnostic.hypothesis.updated,
 *   repair.recommendation.created
 */

import type { RibEventBus } from '../bus';
import type {
  VehicleConnectedEvent,
  DiagnosticSessionCreatedEvent,
  DiagnosticMeasurementRecordedEvent,
  DiagnosticTechnicianResultEnteredEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerDiagnosticOrchestratorHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'diagnostic_orchestrator',
    'Diagnostic Orchestrator',
    [
      'vehicle.connected',
      'diagnostic.session.created',
      'diagnostic.measurement.recorded',
      'diagnostic.technician_result.entered',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'vehicle.connected':
          await handleVehicleConnected(event as VehicleConnectedEvent);
          break;
        case 'diagnostic.session.created':
          await handleSessionCreated(event as DiagnosticSessionCreatedEvent);
          break;
        case 'diagnostic.measurement.recorded':
          await handleMeasurementRecorded(event as DiagnosticMeasurementRecordedEvent);
          break;
        case 'diagnostic.technician_result.entered':
          await handleTechnicianResult(event as DiagnosticTechnicianResultEnteredEvent);
          break;
      }
    },
  );
}

async function handleVehicleConnected(event: VehicleConnectedEvent): Promise<void> {
  // Future: trigger ECU discovery sequence via DiagnosticOrchestrator
  console.log('[DiagOrch] vehicle connected', { vehicleId: event.vehicleId, hardware: event.hardwareType });
}

async function handleSessionCreated(event: DiagnosticSessionCreatedEvent): Promise<void> {
  // Future: auto-start baseline scan for new sessions
  console.log('[DiagOrch] session created', { sessionId: event.diagnosticSessionId });
}

async function handleMeasurementRecorded(event: DiagnosticMeasurementRecordedEvent): Promise<void> {
  // Future: feed measurement into orchestrator — may trigger re-reasoning
  console.log('[DiagOrch] measurement recorded', {
    sessionId: event.diagnosticSessionId,
    type: event.measurementType,
    passOrFail: event.passOrFail,
  });
}

async function handleTechnicianResult(event: DiagnosticTechnicianResultEnteredEvent): Promise<void> {
  // Future: advance orchestrator state machine after technician confirms test result
  console.log('[DiagOrch] tech result entered', {
    sessionId: event.diagnosticSessionId,
    outcome: event.outcome,
  });
}
