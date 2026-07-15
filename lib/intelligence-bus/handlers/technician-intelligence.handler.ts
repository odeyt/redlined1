/**
 * lib/intelligence-bus/handlers/technician-intelligence.handler.ts
 */

import type { RibEventBus } from '../bus';
import type {
  DiagnosticSessionCompletedEvent,
  RepairVerifiedEvent,
  DiagnosticTechnicianResultEnteredEvent,
} from '../event-types';
import type { RibSubscription } from '../subscriber';

export function registerTechnicianIntelligenceHandler(bus: RibEventBus): RibSubscription {
  const subs = [
    bus.subscribe('diagnostic.session.completed', async (event: DiagnosticSessionCompletedEvent) => {
      if (!event.technicianId) return;
      console.log('[TechIntel] session completed — updating scorecard', { technicianId: event.technicianId, sessionId: event.diagnosticSessionId, durationMinutes: event.totalDurationMinutes, confirmedRepair: event.confirmedRepair });
    }),
    bus.subscribe('repair.verified', async (event: RepairVerifiedEvent) => {
      if (!event.technicianId) return;
      console.log('[TechIntel] repair verified — recording first-time fix', { technicianId: event.technicianId, outcome: event.outcomeStatus, dtcCodes: event.dtcCodesFixed, laborMinutes: event.laborMinutes });
    }),
    bus.subscribe('diagnostic.technician_result.entered', async (event: DiagnosticTechnicianResultEnteredEvent) => {
      if (!event.technicianId) return;
      console.log('[TechIntel] technician entered test result', { technicianId: event.technicianId, testId: event.testResultId, outcome: event.outcome });
    }),
  ];
  return { subscriberId: subs[0].subscriberId, unsubscribe: () => subs.forEach((s) => s.unsubscribe()) };
}
