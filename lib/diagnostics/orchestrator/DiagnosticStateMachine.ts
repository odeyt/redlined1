/**
 * lib/diagnostics/orchestrator/DiagnosticStateMachine.ts
 *
 * Defines valid state transitions for a diagnostic session.
 * The orchestrator always validates against this before persisting a status change.
 */

import type { DiagnosticSessionStatus } from '../types';

// Each state maps to the set of states it can transition to
const TRANSITIONS: Record<DiagnosticSessionStatus, DiagnosticSessionStatus[]> = {
  CASE_CREATED:            ['VEHICLE_IDENTIFIED'],
  VEHICLE_IDENTIFIED:      ['INPUT_VALIDATED'],
  INPUT_VALIDATED:         ['BASELINE_SCAN_COMPLETE'],
  BASELINE_SCAN_COMPLETE:  ['SYSTEM_CLASSIFIED'],
  SYSTEM_CLASSIFIED:       ['EVIDENCE_RETRIEVED'],
  EVIDENCE_RETRIEVED:      ['HYPOTHESES_GENERATED'],
  HYPOTHESES_GENERATED:    ['SAFETY_REVIEWED'],
  SAFETY_REVIEWED:         ['NEXT_TEST_SELECTED'],
  NEXT_TEST_SELECTED:      ['AWAITING_TEST_RESULT'],
  AWAITING_TEST_RESULT:    ['TEST_RESULT_RECORDED'],
  TEST_RESULT_RECORDED:    ['HYPOTHESES_UPDATED'],
  HYPOTHESES_UPDATED:      ['FAULT_CONFIRMED', 'NEXT_TEST_SELECTED', 'EVIDENCE_RETRIEVED'],
  FAULT_CONFIRMED:         ['REPAIR_RECOMMENDED'],
  REPAIR_RECOMMENDED:      ['REPAIR_PERFORMED'],
  REPAIR_PERFORMED:        ['POST_REPAIR_SCAN_COMPLETE'],
  POST_REPAIR_SCAN_COMPLETE: ['REPAIR_VERIFIED'],
  REPAIR_VERIFIED:         ['CASE_CLOSED'],
  CASE_CLOSED:             [],
};

export function canTransition(
  from: DiagnosticSessionStatus,
  to: DiagnosticSessionStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: DiagnosticSessionStatus,
  to: DiagnosticSessionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid diagnostic state transition: ${from} → ${to}`,
    );
  }
}

export function getNextStates(from: DiagnosticSessionStatus): DiagnosticSessionStatus[] {
  return TRANSITIONS[from] ?? [];
}
