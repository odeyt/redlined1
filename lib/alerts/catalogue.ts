/**
 * What each role gets alerted about.
 *
 * One list, used by the settings screen, the live toasts and (later) push, so
 * a role's alerts cannot mean one thing in settings and another in delivery.
 *
 * Roles are the ones the app already enforces in getBlockedModules: owner,
 * manager, advisor, technician. An event names the roles it is FOR — a
 * technician does not want to hear that an invoice was paid, and an owner does
 * not want every job assignment in two locations.
 *
 * Preferences are stored as the DISABLED ids per role, not the enabled ones.
 * That is what makes "everything on by default" hold for events added later:
 * a new event is absent from every stored list, so it is on for everyone
 * without touching a single shop's settings.
 */

export type AlertRole = 'owner' | 'manager' | 'advisor' | 'technician';

export const ALERT_ROLES: readonly AlertRole[] = ['owner', 'manager', 'advisor', 'technician'];

export interface AlertEvent {
  id: string;
  /** Shown in settings. Written from the recipient's side, not the system's. */
  label: string;
  /** One line of why it matters, for the settings screen. */
  detail: string;
  roles: readonly AlertRole[];
  /**
   * Whether the event is actually produced yet. The catalogue is the plan as
   * well as the wiring: listing an event that nothing emits would put a
   * switch in settings that does nothing, which is worse than an absent
   * feature because it looks like it works.
   */
  source: 'live' | 'planned';
}

export const ALERT_EVENTS: readonly AlertEvent[] = [
  {
    id: 'ro.status_changed',
    label: 'Repair order status changes',
    detail: 'A job moves to In Progress, Pending Parts, Complete and so on.',
    roles: ['owner', 'manager', 'advisor', 'technician'],
    source: 'live',
  },
  {
    id: 'ro.pending_approval',
    label: 'Work waiting for QA sign-off',
    detail: 'A repair order is finished and needs approving before it can be billed.',
    roles: ['owner', 'manager', 'advisor'],
    source: 'live',
  },
  {
    id: 'job.assigned',
    label: 'A job is assigned to you',
    detail: 'You are added to a job card as a technician. Needs their Employees record linked to a login.',
    roles: ['technician'],
    source: 'live',
  },
  {
    id: 'job.work_added',
    label: 'Work added to your job',
    detail: 'The service, notes, hours or parts change on a job you are already on. Not sent for your own edits.',
    roles: ['technician'],
    source: 'live',
  },
  {
    id: 'inspection.completed',
    label: 'An inspection is completed',
    detail: 'A technician finishes a DVI, so the findings can go to the customer.',
    roles: ['owner', 'manager', 'advisor'],
    source: 'live',
  },
  {
    id: 'estimate.approved',
    label: 'A customer approves an estimate',
    detail: 'Approved work can be scheduled and ordered.',
    roles: ['owner', 'manager', 'advisor'],
    source: 'live',
  },
  {
    id: 'parts.received',
    label: 'Parts arrive',
    detail: 'An order is marked received, so the job it was blocking can continue.',
    roles: ['owner', 'manager', 'advisor', 'technician'],
    source: 'live',
  },
  {
    id: 'invoice.paid',
    label: 'An invoice is paid',
    detail: 'Payment is recorded against an invoice.',
    roles: ['owner', 'manager'],
    source: 'live',
  },
];

/** The events a role can receive at all, whatever their preferences say. */
export function eventsForRole(role: AlertRole): AlertEvent[] {
  return ALERT_EVENTS.filter(e => e.roles.includes(role));
}

/** Disabled ids per role. Absent role or absent id both mean enabled. */
export type AlertPreferences = Partial<Record<AlertRole, string[]>>;

export function isAlertEnabled(
  prefs: AlertPreferences | null | undefined,
  role: AlertRole,
  eventId: string,
): boolean {
  const event = ALERT_EVENTS.find(e => e.id === eventId);
  // An event this role is not a recipient of is never enabled for them, no
  // matter what a stale stored preference says.
  if (!event || !event.roles.includes(role)) return false;
  return !(prefs?.[role] ?? []).includes(eventId);
}

/** Flips one switch, returning new preferences. */
export function setAlertEnabled(
  prefs: AlertPreferences,
  role: AlertRole,
  eventId: string,
  enabled: boolean,
): AlertPreferences {
  const current = new Set(prefs[role] ?? []);
  if (enabled) current.delete(eventId);
  else current.add(eventId);
  return { ...prefs, [role]: [...current] };
}
