/**
 * lib/intelligence-bus/handlers/predictive-failure.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  VehicleMileageUpdatedEvent,
  ServiceCompletedEvent,
  VehicleHealthUpdatedEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerPredictiveFailureHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
      console.log('[PredFail] repair verified — recalculating failure thresholds', { vehicleId: event.vehicleId, dtcCodes: event.dtcCodesFixed });
    }),
    bus.subscribe('vehicle.mileage_updated', async (event: VehicleMileageUpdatedEvent) => {
      console.log('[PredFail] mileage updated — checking component thresholds', { vehicleId: event.vehicleId, odometerKm: event.currentOdometerKm });
    }),
    bus.subscribe('service.completed', async (event: ServiceCompletedEvent) => {
      console.log('[PredFail] service completed — resetting service intervals', { vehicleId: event.vehicleId, nextDueKm: event.nextServiceDueKm });
    }),
    bus.subscribe('vehicle.health.updated', async (event: VehicleHealthUpdatedEvent) => {
      if (event.criticalSystemsAffected.length > 0) {
        console.log('[PredFail] critical systems degraded — escalating prediction priority', { vehicleId: event.vehicleId, criticalSystems: event.criticalSystemsAffected });
      }
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
