'use client';

/**
 * Audit coverage for services that have not been ported to the domain layer.
 *
 * M1 ported three entities — customers, invoices, payments — and they audit
 * properly, through the domain layer, with the write and the audit in one
 * place. The other twenty-five services still hold their own Supabase calls,
 * and porting them all at once would be a very large change to land in one go.
 *
 * So this is the intermediate step: a service keeps its existing write, and
 * adds one line recording what it did. Coverage now; porting later, unchanged
 * in meaning when it happens.
 *
 * ## The deliberate difference from writeAuditEvent
 *
 * This does NOT throw. `writeAuditEvent` does, on purpose: for money, an
 * unaudited write is worse than a failed one, and there are three call sites
 * to reason about. Here there are dozens, added retrospectively to code that
 * has worked for a year, and making every one of them able to block a save
 * because the audit hiccuped is a far larger blast radius than the problem it
 * would solve. A job card that saves without its audit row is a gap in the
 * log; a job card that refuses to save is a technician who cannot work.
 *
 * Failures are reported rather than swallowed — the whole point of today was
 * that a silent gap looked identical to a working system.
 */
import { browserDeps } from './browserAdapter';
import { writeAuditEvent, type AuditEntry } from './audit';

/**
 * Records what a service just did. Never throws.
 *
 * Call it AFTER the write succeeds: an audit row for something that did not
 * happen is worse than a missing one, because it is believed.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { db, context } = await browserDeps();
    await writeAuditEvent(db, context, entry);
  } catch (error) {
    // Loud, but not fatal. If this ever fires in volume it means the audit
    // path is broken and the log is quietly incomplete — which is exactly the
    // state that cost a day, so it must be visible somewhere.
    console.error(
      `[audit] failed to record ${entry.action} on ${entry.entityType} ${entry.entityId}`,
      error,
    );
    try {
      const { alertException } = await import('@/lib/observability/alerts');
      alertException('audit', error, { action: entry.action, entityType: entry.entityType });
    } catch { /* reporting must not be the thing that breaks */ }
  }
}
