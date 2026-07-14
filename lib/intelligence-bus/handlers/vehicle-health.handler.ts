/**
 * lib/intelligence-bus/handlers/vehicle-health.handler.ts
 *
 * Vehicle Health Score Engine subscriber.
 *
 * Subscribes to:
 *   diagnostic.live_data.captured, repair.verified,
 *   diagnostic.dtc.read, diagnostic.freeze_frame.captured
 *
 * After processing, publishes vehicle.health.updated back to the bus
 * so downstream subscribers (Copilot, Fleet, Predictive) receive the new score.
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticLiveDataCapturedEvent,
  RepairVerifiedEvent,
  DiagnosticDtcReadEvent,
  DiagnosticFreezeFrameCapturedEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';
import { publish } from '../publisher';

export function registerVehicleHealthHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'vehicle_health',
    'Vehicle Health Score Engine',
    [
      'diagnostic.live_data.captured',
      'repair.verified',
      'diagnostic.dtc.read',
      'diagnostic.freeze_frame.captured',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'diagnostic.dtc.read':
          await handleDtcRead(bus, event as DiagnosticDtcReadEvent);
          break;
        case 'diagnostic.live_data.captured':
          await handleLiveData(event as DiagnosticLiveDataCapturedEvent);
          break;
        case 'diagnostic.freeze_frame.captured':
          await handleFreezeFrame(event as DiagnosticFreezeFrameCapturedEvent);
          break;
        case 'repair.verified':
          await handleRepairVerified(bus, event as RepairVerifiedEvent);
          break;
      }
    },
  );
}

async function handleDtcRead(bus: RibEventBus, event: DiagnosticDtcReadEvent): Promise<void> {
  if (!event.vehicleId) return;
  // Stub: future implementation calls VehicleHealthScoreEngine.process()
  console.log('[VehicleHealth] DTC read — updating health score', {
    vehicleId: event.vehicleId,
    dtcCode: event.dtcCode,
  });
  // Publish updated health event so downstream modules get notified
  // (stub scores — real scores come from VehicleHealthScoreEngine)
  await publish(bus, 'vehicle.health.updated', {
    organizationId: event.organizationId,
    shopId: event.shopId,
    vehicleId: event.vehicleId,
    technicianId: event.technicianId,
    diagnosticSessionId: event.diagnosticSessionId,
    correlationId: event.correlationId,
    overallScore: 70,
    previousScore: null,
    systemScores: {},
    criticalSystemsAffected: [],
  });
}

async function handleLiveData(event: DiagnosticLiveDataCapturedEvent): Promise<void> {
  console.log('[VehicleHealth] live data captured', {
    vehicleId: event.vehicleId,
    pids: event.pidCodes,
    samples: event.sampleCount,
  });
}

async function handleFreezeFrame(event: DiagnosticFreezeFrameCapturedEvent): Promise<void> {
  console.log('[VehicleHealth] freeze frame captured for', event.dtcCode);
}

async function handleRepairVerified(bus: RibEventBus, event: RepairVerifiedEvent): Promise<void> {
  if (!event.vehicleId) return;
  console.log('[VehicleHealth] repair verified — recalculating full health score', {
    vehicleId: event.vehicleId,
    outcome: event.outcomeStatus,
  });
  await publish(bus, 'vehicle.health.updated', {
    organizationId: event.organizationId,
    shopId: event.shopId,
    vehicleId: event.vehicleId,
    technicianId: event.technicianId,
    diagnosticSessionId: event.diagnosticSessionId,
    correlationId: event.correlationId,
    overallScore: event.outcomeStatus === 'resolved' ? 85 : 60,
    previousScore: null,
    systemScores: {},
    criticalSystemsAffected: [],
  });
}
