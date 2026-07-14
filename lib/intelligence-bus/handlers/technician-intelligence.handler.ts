/**
 * lib/intelligence-bus/handlers/technician-intelligence.handler.ts
 *
 * Technician Performance Engine subscriber.
 *
 * Subscribes to:
 *   diagnostic.session.completed, repair.verified,
 *   diagnostic.technician_result.entered
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticSessionCompletedEvent,
  RepairVerifiedEvent,
  DiagnosticTechnicianResultEnteredEvent,
  RibEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerTechnicianIntelligenceHandler(bus: RibEventBus): RibSubscription {
  return bus.subscribe(
    'technician_intelligence',
    'Technician Performance Engine',
    [
      'diagnostic.session.completed',
      'repair.verified',
      'diagnostic.technician_result.entered',
    ],
    async (event: RibEvent) => {
      switch (event.eventType) {
        case 'diagnostic.session.completed':
          await handleSessionCompleted(event as DiagnosticSessionCompletedEvent);
          break;
        case 'repair.verified':
          await handleRepairVerified(event as RepairVerifiedEvent);
          break;
        case 'diagnostic.technician_result.entered':
          await handleTechnicianResult(event as DiagnosticTechnicianResultEnteredEvent);
          break;
      }
    },
  );
}

async function handleSessionCompleted(event: DiagnosticSessionCompletedEvent): Promise<void> {
  if (!event.technicianId) return;
  console.log('[TechIntel] session completed — updating scorecard', {
    technicianId: event.technicianId,
    sessionId: event.diagnosticSessionId,
    durationMinutes: event.totalDurationMinutes,
    confirmedRepair: event.confirmedRepair,
  });
}

async function handleRepairVerified(event: RepairVerifiedEvent): Promise<void> {
  if (!event.technicianId) return;
  console.log('[TechIntel] repair verified — recording first-time fix', {
    technicianId: event.technicianId,
    outcome: event.outcomeStatus,
    dtcCodes: event.dtcCodesFixed,
    laborMinutes: event.laborMinutes,
  });
}

async function handleTechnicianResult(event: DiagnosticTechnicianResultEnteredEvent): Promise<void> {
  if (!event.technicianId) return;
  console.log('[TechIntel] technician entered test result', {
    technicianId: event.technicianId,
    testId: event.testResultId,
    outcome: event.outcome,
  });
}
