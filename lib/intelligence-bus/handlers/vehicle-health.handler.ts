/**
 * lib/intelligence-bus/handlers/vehicle-health.handler.ts
 *
 * Vehicle Health Score Engine subscriber.
 * Uses derivedFrom() to correctly propagate causality envelope fields,
 * preventing the loop detection false-positive that the original version caused.
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticLiveDataCapturedEvent,
  RepairVerifiedEvent,
  DiagnosticDtcReadEvent,
  DiagnosticFreezeFrameCapturedEvent,
} from '../event-types';
import type { RibSubscription } from '../event-dispatcher';
import { publish } from '../publisher';
import { derivedFrom } from '../loop-guard';

export function registerVehicleHealthHandler(bus: RibEventBus): RibSubscription {
  const dtcSub = bus.subscribe('diagnostic.dtc.read', async (event: DiagnosticDtcReadEvent) => {
    if (!event.vehicleId) return;
    console.log('[VehicleHealth] DTC read — updating health score', {
      vehicleId: event.vehicleId,
      dtcCode: event.dtcCode,
    });
    await publish(bus, 'vehicle.health.updated', {
      ...derivedFrom(event, 'vehicle_health'),
      vehicleId: event.vehicleId,
      technicianId: event.technicianId,
      diagnosticSessionId: event.diagnosticSessionId,
      overallScore: 70,
      previousScore: null,
      systemScores: {},
      criticalSystemsAffected: [],
    });
  });

  const liveDataSub = bus.subscribe('diagnostic.live_data.captured', async (event: DiagnosticLiveDataCapturedEvent) => {
    console.log('[VehicleHealth] live data captured', {
      vehicleId: event.vehicleId,
      pids: event.pidCodes,
      samples: event.sampleCount,
    });
  });

  const freezeFrameSub = bus.subscribe('diagnostic.freeze_frame.captured', async (event: DiagnosticFreezeFrameCapturedEvent) => {
    console.log('[VehicleHealth] freeze frame captured for', event.dtcCode);
  });

  const repairSub = bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
    if (!event.vehicleId) return;
    console.log('[VehicleHealth] repair verified — recalculating full health score', {
      vehicleId: event.vehicleId,
      outcome: event.outcomeStatus,
    });
    await publish(bus, 'vehicle.health.updated', {
      ...derivedFrom(event, 'vehicle_health'),
      vehicleId: event.vehicleId,
      technicianId: event.technicianId,
      diagnosticSessionId: event.diagnosticSessionId,
      overallScore: event.outcomeStatus === 'resolved' ? 85 : 60,
      previousScore: null,
      systemScores: {},
      criticalSystemsAffected: [],
    });
  });

  // Return a composite subscription that unregisters all four subscriptions
  return {
    subscriberId: dtcSub.subscriberId,
    unsubscribe: () => {
      dtcSub.unsubscribe();
      liveDataSub.unsubscribe();
      freezeFrameSub.unsubscribe();
      repairSub.unsubscribe();
    },
  };
}
