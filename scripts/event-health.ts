/**
 * Event-system health, as one machine-readable object.
 *
 * Detection, never repair. This is what the scheduled job runs: it looks for
 * business records that should have produced an event and did not, and says so
 * loudly. It does not emit anything, so a scheduled task can never quietly
 * replay history at 3am — that decision stays with a person.
 *
 * Exit codes are the scheduling contract:
 *   0  nothing actionable
 *   1  actionable problems found (missing post-emitter events, unroutable
 *      records, dead events, or orphaned shops)
 *   2  the check itself could not run
 *
 * ## Why "post-emitter" is the number that matters
 *
 * A business row older than its emitter is not a missed event; it is history
 * from before the feature existed. Counting those as failures would mean the
 * alert is red forever and therefore ignored. Only rows created after their
 * emitter shipped represent something that should have fired and did not.
 *
 * Usage:
 *   npx tsx scripts/event-health.ts
 *   npx tsx scripts/event-health.ts --json
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * The Redlined1 Supabase project. A scheduled job holding a service-role key
 * must not be able to point at anything else, so this is asserted rather than
 * assumed — a wrong ref in the environment stops the run instead of reading
 * (or worse, repairing) another product's database.
 */
const EXPECTED_PROJECT_REF = 'ldjrlvjkmzrcdqhetqoh';

/**
 * When each emitter first existed in production, UTC.
 *
 * invoice.issued, payment.reversed and leave.approved were added on
 * 2026-08-20 in commit 96a5a3a — they were declared in M12 but never fired.
 * The other four shipped with M12 itself in f3efda7.
 */
const EMITTER_SINCE: Record<string, string> = {
  'invoice.issued':    '2026-08-20T10:20:00Z',
  'payment.reversed':  '2026-08-20T10:20:00Z',
  'leave.approved':    '2026-08-20T10:20:00Z',
  'payment.recorded':  '2026-08-20T04:56:00Z',
  'cash_day.closed':   '2026-08-20T04:56:00Z',
  'expense.approved':  '2026-08-20T04:56:00Z',
  'payroll.finalised': '2026-08-20T04:56:00Z',
};

export interface HealthReport {
  environment: string;
  project: string;
  checkedAt: string;
  shopsWithoutOrganization: number;
  deadEvents: number;
  totals: { eligible: number; present: number; missing: number; missingPostEmitter: number; unroutable: number; ambiguous: number; errors: number };
  byEventType: Record<string, { eligible: number; present: number; missing: number; missingPostEmitter: number; unroutable: number; ambiguous: number; error?: string }>;
  actionable: boolean;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.replace(/^https?:\/\//, '').split('.')[0];

  if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(2); }
  if (ref !== EXPECTED_PROJECT_REF) {
    console.error(
      'Refusing to run: expected the Redlined1 project (' + EXPECTED_PROJECT_REF + ') ' +
      'but the environment points at "' + ref + '".',
    );
    process.exit(2);
  }

  const db = createClient(url, key);
  const { RULES, classify } = await import('./reconcileRules');

  const { data: shops } = await db.from('shops').select('id, name, organization_id');
  const orphanShops = (shops ?? []).filter(s => !s.organization_id);

  const { count: deadEvents } = await db
    .from('domain_event_outbox').select('*', { count: 'exact', head: true }).eq('status', 'dead');

  const { data: existing } = await db
    .from('domain_event_outbox').select('idempotency_key').not('idempotency_key', 'is', null);
  const seen = new Set((existing ?? []).map(e => e.idempotency_key as string));

  const report: HealthReport = {
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'local',
    project: ref,
    checkedAt: new Date().toISOString(),
    shopsWithoutOrganization: orphanShops.length,
    deadEvents: deadEvents ?? 0,
    totals: { eligible: 0, present: 0, missing: 0, missingPostEmitter: 0, unroutable: 0, ambiguous: 0, errors: 0 },
    byEventType: {},
    actionable: false,
  };

  for (const rule of RULES) {
    const counts = await classify(db, rule, shops ?? [], seen, EMITTER_SINCE[rule.eventType]);
    report.byEventType[rule.eventType] = counts;
    report.totals.eligible += counts.eligible;
    report.totals.present += counts.present;
    report.totals.missing += counts.missing;
    report.totals.missingPostEmitter += counts.missingPostEmitter;
    report.totals.unroutable += counts.unroutable;
    report.totals.ambiguous += counts.ambiguous;
    if (counts.error) report.totals.errors += 1;
  }

  report.actionable =
    report.totals.missingPostEmitter > 0 ||
    report.totals.unroutable > 0 ||
    report.totals.errors > 0 ||
    report.shopsWithoutOrganization > 0 ||
    report.deadEvents > 0;

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('project        :', report.project, '(' + report.environment + ')');
    console.log('orphaned shops :', report.shopsWithoutOrganization);
    console.log('dead events    :', report.deadEvents);
    console.log('');
    for (const [type, c] of Object.entries(report.byEventType)) {
      console.log(
        '  ' + type.padEnd(20),
        'eligible=' + String(c.eligible).padStart(4),
        'present=' + String(c.present).padStart(4),
        'missing=' + String(c.missing).padStart(4),
        '(post-emitter ' + c.missingPostEmitter + ')',
        c.unroutable ? 'unroutable=' + c.unroutable : '',
        c.ambiguous ? 'ambiguous=' + c.ambiguous : '',
        c.error ? 'ERROR ' + c.error : '',
      );
    }
    console.log('\ntotals:', JSON.stringify(report.totals));
    console.log('actionable:', report.actionable);
  }

  if (report.actionable) {
    // Identifiers and counts only — never a payload.
    try {
      const { alertException } = await import('../lib/observability/alerts');
      alertException('events.health', new Error('domain event health check found actionable problems'), {
        missingPostEmitter: report.totals.missingPostEmitter,
        unroutable: report.totals.unroutable,
        ambiguous: report.totals.ambiguous,
        deadEvents: report.deadEvents,
        shopsWithoutOrganization: report.shopsWithoutOrganization,
        errors: report.totals.errors,
        environment: report.environment,
      });
    } catch { /* reporting must not be the thing that breaks the check */ }
    process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exit(2); });
