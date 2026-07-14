/**
 * lib/intelligence-bus/handlers/predictive-failure.handler.ts
 *
 * Predictive Failure Engine subscriber.
 *
 * Subscribes to:
 *   repair.verified, vehicle.mileage_updated, service.completed, vehicle.health.updated
 */

import type { RibEventBus } from '../bus';
import type {
  RepairVerifiedEvent,
  VehicleMileageUpdatedEvent,
  ServiceCompletedEvent,
  VehicleHealthUpdatedEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerPredictiveFailureHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'predictive_failure',
    'Predictive Failure Engine',
    [
      'repair.verified',
      'vehicle.mileage_updated',
      'service.completed',
      'vehicle.health.updated',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'repair.verified':
          await handleRepairVerified(event as RepairVerifiedEvent);
          break;
        case 'vehicle.mileage_updated':
          await handleMileageUpdated(event as VehicleMileageUpdatedEvent);
          break;
        case 'service.completed':
          await handleServiceCompleted(event as ServiceCompletedEvent);
          break;
        case 'vehicle.health.updated':
          await handleHealthUpdated(event as VehicleHealthUpdatedEvent);
          break;
      }
    },
  );
}

async function handleRepairVerified(event: RepairVerifiedEvent): Promise<void> {
  console.log('[PredFail] repair verified — recalculating failure thresholds', {
    vehicleId: event.vehicleId,
    dtcCodes: event.dtcCodesFixed,
  });
}

async function handleMileageUpdated(event: VehicleMileageUpdatedEvent): Promise<void> {
  console.log('[PredFail] mileage updated — checking component thresholds', {
    vehicleId: event.vehicleId,
    odometerKm: event.currentOdometerKm,
  });
}

async function handleServiceCompleted(event: ServiceCompletedEvent): Promise<void> {
  console.log('[PredFail] service completed — resetting service intervals', {
    vehicleId: event.vehicleId,
    nextDueKm: event.nextServiceDueKm,
  });
}

async function handleHealthUpdated(event: VehicleHealthUpdatedEvent): Promise<void> {
  if (event.criticalSystemsAffected.length > 0) {
    console.log('[PredFail] critical systems degraded — escalating prediction priority', {
      vehicleId: event.vehicleId,
      criticalSystems: event.criticalSystemsAffected,
    });
  }
}
