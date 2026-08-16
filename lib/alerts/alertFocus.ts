/**
 * The record a tapped notification asked for, held until its screen can open
 * it.
 *
 * The shell knows which module to show the moment the app loads, but the
 * record itself cannot be opened then: the module has not mounted, and its
 * list arrives from Supabase a moment later. So the target is parked here and
 * claimed by whichever view owns that entity type once it has its data.
 *
 * A module-level value rather than context or reducer state, because it is
 * consumed exactly once by exactly one component and must survive that
 * component mounting after the shell has already handled the URL. Reading it
 * clears it — a second render, or coming back to the screen later, must not
 * re-open a drawer somebody has closed.
 */
import type { AlertTarget } from './alertLink';

let pending: AlertTarget | null = null;

export function setAlertFocus(target: AlertTarget | null): void {
  pending = target;
}

/**
 * Takes the pending id for this entity type, if there is one, and clears it.
 * Returns null when the parked target belongs to a different screen, so an
 * unrelated view cannot swallow it.
 */
export function consumeAlertFocus(entityType: string): string | null {
  if (!pending || pending.entityType !== entityType) return null;
  const id = pending.entityId;
  pending = null;
  return id;
}

/** Test seam. Nothing in the app should need to reset without consuming. */
export function clearAlertFocus(): void {
  pending = null;
}
