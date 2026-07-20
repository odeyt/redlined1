/**
 * Server-owned repair-stage state machine for job_cards.repair_stage.
 *
 * Stage vocabulary is intentionally the existing 6-value list from
 * REPAIR_STAGES (lib/schemas.ts) — NOT the 8-stage example graph some specs
 * describe (Waiting/Diagnosing/Awaiting Authorization/Approved/Repair In
 * Progress/Quality Control/Ready/Completed). The existing 6 values are
 * already integrated everywhere: this schema's job_cards.repair_stage
 * column, the web UI, and the REDLINED1 mobile app (a separate repo this
 * task must not modify) all read/write exactly these 6 strings. Introducing
 * a different vocabulary here would silently break the already-shipped
 * mobile app's stage display and validation without touching its code.
 * The requirement this satisfies — explicit server-side ordering, reject
 * skip-ahead, reject backward, reject transitions off a terminal stage — is
 * fully expressed using the real stage list.
 */
import { REPAIR_STAGES, type RepairStageSchema } from './schemas';
import type { z } from 'zod';

export type RepairStage = z.infer<typeof RepairStageSchema>;

export const REPAIR_STAGE_ORDER: readonly RepairStage[] = REPAIR_STAGES;

function stageIndex(stage: string): number {
  return REPAIR_STAGE_ORDER.indexOf(stage as RepairStage);
}

/** True only for the single immediate-successor step in the ordered stage list — no skips, no backward moves, no self-loops. */
export function isValidTransition(from: string, to: string): boolean {
  const fromIdx = stageIndex(from);
  const toIdx = stageIndex(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx === fromIdx + 1;
}

/** The only stage a caller could legally be advancing FROM to reach `to` — undefined if `to` is the first stage (no predecessor) or not a real stage. */
export function predecessorOf(to: string): RepairStage | undefined {
  const toIdx = stageIndex(to);
  if (toIdx <= 0) return undefined;
  return REPAIR_STAGE_ORDER[toIdx - 1];
}

/** True if `stage` is further along the ordered list than `than` — used to distinguish "already at target" (idempotent replay) from "moved past target" (JOB_ALREADY_UPDATED) from a genuine conflict. */
export function isAfter(stage: string, than: string): boolean {
  const a = stageIndex(stage);
  const b = stageIndex(than);
  if (a === -1 || b === -1) return false;
  return a > b;
}
