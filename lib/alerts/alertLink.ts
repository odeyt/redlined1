/**
 * Where an alert points.
 *
 * A push notification that opens the app at whatever screen it was last on is
 * a notification you have to act on twice: read it, then go and find the thing
 * it was about. On a phone, in a workshop, that second step does not happen.
 *
 * The app is a single page with a module in reducer state rather than a route
 * per screen, so the deep link is a query parameter the shell consumes on
 * load and then strips from the URL. Kept as one parameter, `alert`, holding
 * `entityType:entityId`, so a stale or hand-edited link either resolves to a
 * known module or is ignored — never a half-applied state.
 *
 * Entity types are the ones the alert triggers actually write. Anything else
 * (or a missing id) falls back to opening the app plainly, which is what
 * happens today for every alert.
 */

/** entity_type on alert_events → the module key used by AppShell's views map. */
export const ALERT_ENTITY_MODULE: Readonly<Record<string, string>> = {
  job_card:     'job-cards',
  repair_order: 'repair-orders',
  invoice:      'invoices',
  inspection:   'inspections',
  estimate:     'estimates',
  parts_order:  'parts-orders',
};

export interface AlertTarget {
  entityType: string;
  entityId: string;
  module: string;
}

/**
 * The URL a push notification should open. Absolute path, because a service
 * worker resolves it against the origin, not the page.
 */
export function alertPath(entityType: string | null, entityId: string | null): string {
  if (!entityType || !entityId) return '/';
  if (!ALERT_ENTITY_MODULE[entityType]) return '/';
  // encodeURIComponent, not a bare join: invoice numbers and job card ids are
  // free text in this schema, and one '&' in an id would silently truncate the
  // link.
  return `/?alert=${encodeURIComponent(`${entityType}:${entityId}`)}`;
}

/** Reads the parameter back. Returns null for anything it does not recognise. */
export function parseAlertParam(value: string | null | undefined): AlertTarget | null {
  if (!value) return null;
  const sep = value.indexOf(':');
  if (sep <= 0) return null;
  const entityType = value.slice(0, sep);
  // slice, not split: job card ids and invoice numbers may themselves contain
  // a colon, and only the first one separates the two halves.
  const entityId = value.slice(sep + 1);
  if (!entityId) return null;
  const module = ALERT_ENTITY_MODULE[entityType];
  if (!module) return null;
  return { entityType, entityId, module };
}
