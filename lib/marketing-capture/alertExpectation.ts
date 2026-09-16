/**
 * How many alerts the capture's repair-order walkthrough produces, and which.
 *
 * The number is not assumed. It is derived from the trigger functions' source
 * in supabase/migrations, which lib/marketing-capture/__tests__ reads, parses
 * and EXECUTES against a real PostgreSQL. OWNER START SQL then requires the
 * live production definitions to hash to the same source (md5 of prosrc), so
 * the expectation holds in production only when those hashes match.
 *
 * Node-only (crypto): used by tests and the capture harness, never by the app.
 */
import { createHash } from 'crypto';

export interface Transition { from: string; to: string }

/** The repair-order status changes the walkthrough makes, in order. */
export const RO_WALKTHROUGH_TRANSITIONS: readonly Transition[] = [
  { from: 'Open', to: 'In Progress' },
  { from: 'In Progress', to: 'Pending Parts' },
  { from: 'Pending Parts', to: 'In Progress' },
  { from: 'In Progress', to: 'Pending Approval' },
  { from: 'Pending Approval', to: 'Complete' },
];

export type RoAlertType = 'ro.status_changed' | 'ro.pending_approval';

export interface ExpectedAlert {
  /** 1-based position in the walkthrough, which is also its pg_net request offset. */
  k: number;
  eventType: RoAlertType;
  oldStatus: string;
  newStatus: string;
  title: string;
}

/**
 * The expectation, written out. A test proves it equals what the source
 * functions produce, both by parsing and by executing them.
 */
export const EXPECTED_ALERTS: readonly ExpectedAlert[] = [
  { k: 1, eventType: 'ro.status_changed', oldStatus: 'Open', newStatus: 'In Progress', title: 'RO-DEMO-330 → In Progress' },
  { k: 2, eventType: 'ro.status_changed', oldStatus: 'In Progress', newStatus: 'Pending Parts', title: 'RO-DEMO-330 → Pending Parts' },
  { k: 3, eventType: 'ro.status_changed', oldStatus: 'Pending Parts', newStatus: 'In Progress', title: 'RO-DEMO-330 → In Progress' },
  { k: 4, eventType: 'ro.pending_approval', oldStatus: 'In Progress', newStatus: 'Pending Approval', title: 'RO-DEMO-330 is ready for QA sign-off' },
  { k: 5, eventType: 'ro.status_changed', oldStatus: 'Pending Approval', newStatus: 'Complete', title: 'RO-DEMO-330 → Complete' },
];

export const EXPECTED_ALERT_COUNT = EXPECTED_ALERTS.length;

/**
 * Every function whose live definition decides the alert count or the
 * correlation, and the migration holding its latest source. OWNER START SQL
 * pins each by md5(prosrc).
 */
export const PINNED_FUNCTIONS = [
  { name: 'alert_ro_status_changed', file: 'supabase/migrations/2026-08-13_alert_ro_status_changed.sql' },
  { name: 'alert_ro_pending_approval', file: 'supabase/migrations/2026-08-13_alert_events.sql' },
  { name: 'emit_alert_event', file: 'supabase/migrations/2026-08-13_alert_events.sql' },
  { name: 'record_ro_status_change', file: 'supabase/migrations/2026-08-03_ro_status_events.sql' },
  { name: 'alert_job_assigned', file: 'supabase/migrations/2026-08-16_job_assigned_membership_guard.sql' },
  { name: 'alert_job_work_added', file: 'supabase/migrations/2026-08-16_alert_job_work_added.sql' },
] as const;

/**
 * The text PostgreSQL stores as prosrc: everything between the `$fn$`
 * delimiters of the LAST `CREATE OR REPLACE FUNCTION public.<name>(` in the file.
 * null when absent. Line endings are normalised to LF first.
 */
export function functionBody(sql: string, name: string): string | null {
  const text = sql.replace(/\r/g, '');
  const header = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const at = text.lastIndexOf(header);
  if (at === -1) return null;
  const open = text.indexOf('$fn$', at);
  if (open === -1) return null;
  const close = text.indexOf('$fn$', open + 4);
  if (close === -1) return null;
  return text.slice(open + 4, close);
}

export const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

/** md5(prosrc), exactly as OWNER START SQL computes it. */
export const prosrcMd5 = (body: string) => md5(body);

/**
 * Whitespace-insensitive fingerprint, the same as
 * md5(btrim(regexp_replace(prosrc, '[ \t\n\r\f\v]+', ' ', 'g'))). A match on this
 * alone is REVIEW, never PASS: it proves nothing about comments or literals.
 */
export const normalizedProsrcMd5 = (body: string) => md5(body.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ | $/g, ''));

/** What the two repair-order alert triggers do, read from their source. */
export interface RoAlertModel {
  /** Statuses ro.status_changed stays silent for. */
  statusChangedSkips: string[];
  /** The status that raises ro.pending_approval. */
  pendingApprovalStatus: string;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/**
 * Parses the two trigger bodies. Returns null unless each has exactly the
 * reviewed shape: one emit_alert_event call, one status condition. Anything
 * else fails closed, so a changed trigger cannot silently keep the old count.
 */
export function roAlertModelFromSource(statusChangedBody: string, pendingApprovalBody: string): RoAlertModel | null {
  const sc = statusChangedBody;
  if (count(sc, /emit_alert_event\s*\(/g) !== 1 || count(sc, /INSERT\s+INTO/gi) !== 0) return null;
  if (!/IF NEW\.status IS DISTINCT FROM OLD\.status THEN/.test(sc)) return null;
  const skips = [...sc.matchAll(/IF NEW\.status <> '([^']+)' THEN/g)].map(m => m[1]);
  // No condition other than the distinct-status test and the skips.
  if (count(sc, /\bIF\b/g) - count(sc, /\bEND IF\b/g) !== skips.length + 1) return null;
  if (!/emit_alert_event\(\s*NEW\.shop_id, 'ro\.status_changed', NULL,\s*COALESCE\(NEW\.ro_number, 'A repair order'\) \|\| ' → ' \|\| NEW\.status,/.test(sc)) return null;

  const pa = pendingApprovalBody;
  if (count(pa, /emit_alert_event\s*\(/g) !== 1 || count(pa, /INSERT\s+INTO/gi) !== 0) return null;
  const on = pa.match(/IF NEW\.status = '([^']+)' AND NEW\.status IS DISTINCT FROM OLD\.status THEN/);
  if (!on) return null;
  if (!/emit_alert_event\(\s*NEW\.shop_id, 'ro\.pending_approval', NULL,\s*COALESCE\(NEW\.ro_number, 'A repair order'\) \|\| ' is ready for QA sign-off',/.test(pa)) return null;

  return { statusChangedSkips: skips, pendingApprovalStatus: on[1] };
}

/** The alerts one status change raises under a model. */
export function alertsForTransition(model: RoAlertModel, t: Transition, roNumber: string): Omit<ExpectedAlert, 'k'>[] {
  const out: Omit<ExpectedAlert, 'k'>[] = [];
  if (t.from === t.to) return out;
  // Trigger order on repair_orders is by name: ..._pending_approval before ..._status_changed.
  if (t.to === model.pendingApprovalStatus) {
    out.push({ eventType: 'ro.pending_approval', oldStatus: t.from, newStatus: t.to, title: `${roNumber} is ready for QA sign-off` });
  }
  if (!model.statusChangedSkips.includes(t.to)) {
    out.push({ eventType: 'ro.status_changed', oldStatus: t.from, newStatus: t.to, title: `${roNumber} → ${t.to}` });
  }
  return out;
}

export function expectedAlertsFor(model: RoAlertModel, transitions: readonly Transition[], roNumber: string): ExpectedAlert[] {
  return transitions.flatMap(t => alertsForTransition(model, t, roNumber)).map((a, i) => ({ k: i + 1, ...a }));
}
