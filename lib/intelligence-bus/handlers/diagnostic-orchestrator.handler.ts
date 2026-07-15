/**
 * lib/intelligence-bus/handlers/diagnostic-orchestrator.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  VehicleConnectedEvent,
  DiagnosticSessionCreatedEvent,
  DiagnosticMeasurementRecordedEvent,
  DiagnosticTechnicianResultEnteredEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerDiagnosticOrchestratorHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('vehicle.connected', async (event: VehicleConnectedEvent) => {
      console.log('[DiagOrch] vehicle connected', { vehicleId: event.vehicleId, hardware: event.hardwareType });
    }),
    bus.subscribe('diagnostic.session.created', async (event: DiagnosticSessionCreatedEvent) => {
      console.log('[DiagOrch] session created', { sessionId: event.diagnosticSessionId });
    }),
    bus.subscribe('diagnostic.measurement.recorded', async (event: DiagnosticMeasurementRecordedEvent) => {
      console.log('[DiagOrch] measurement recorded', { sessionId: event.diagnosticSessionId, type: event.measurementType, passOrFail: event.passOrFail });
    }),
    bus.subscribe('diagnostic.technician_result.entered', async (event: DiagnosticTechnicianResultEnteredEvent) => {
      console.log('[DiagOrch] tech result entered', { sessionId: event.diagnosticSessionId, outcome: event.outcome });
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
