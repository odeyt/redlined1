/**
 * Finds business records that should have produced a domain event and did not.
 *
 * ## Why this exists
 *
 * The business write and the event write are not one transaction. The domain
 * layer talks to PostgREST, which has no client-side transaction, so the event
 * is inserted immediately AFTER the row it describes. A process that dies
 * between the two, or an emit refused because the shop has no organization,
 * leaves a business record with no event and nothing that records the miss.
 *
 * Sentry sees it. The database does not. This closes that: the authoritative
 * business row is the source of truth, and an event either exists for it or is
 * missing and can be reconstructed deterministically from the same row.
 *
 * ## Safety
 *
 * - DRY RUN by default. --execute is required to write anything.
 * - --since is REQUIRED for --execute. Reconciling with no lower bound would
 *   replay the entire history of the system as fresh events, which is a
 *   different and much larger decision than repairing a gap.
 * - Tenant identity comes from the business row, never from an argument.
 * - Idempotency keys are the SAME strings the live emitters use, so an event
 *   that already exists is skipped, and running twice changes nothing.
 * - A row whose shop has no organization is reported as UNROUTABLE and is not
 *   emitted: rib_events.organization_id is NOT NULL, so it could only die.
 *   Fix the tenancy first, then reconcile.
 *
 * Usage:
 *   npx tsx scripts/reconcile-domain-events.ts --since 2026-08-20
 *   npx tsx scripts/reconcile-domain-events.ts --since 2026-08-20 --execute
 *   npx tsx scripts/reconcile-domain-events.ts --since 2026-08-20 --type invoice.issued
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { RULES } from './reconcileRules';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SVC) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}


async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes('--execute');
  const sinceArg = argv[argv.indexOf('--since') + 1];
  const since = argv.includes('--since') ? sinceArg : null;
  const onlyType = argv.includes('--type') ? argv[argv.indexOf('--type') + 1] : null;

  if (execute && !since) {
    console.error(
      '--execute requires --since. Reconciling with no lower bound would replay the\n' +
      'entire history of the system as fresh events, which is a different decision.',
    );
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SVC);
  const { createDomainContext } = await import('../lib/domain/context');
  const { emitDomainEvent } = await import('../lib/domain/events');

  // Tenancy comes from the shop row, never from an argument.
  const { data: shops } = await db.from('shops').select('id, name, organization_id');
  const shopById = new Map((shops ?? []).map(x => [x.id as string, x]));

  const { data: existing } = await db
    .from('domain_event_outbox')
    .select('idempotency_key')
    .not('idempotency_key', 'is', null);
  const seen = new Set((existing ?? []).map(e => e.idempotency_key as string));

  console.log(execute ? 'MODE: EXECUTE' : 'MODE: DRY RUN');
  console.log('since:', since ?? '(none — dry run over all history)');
  console.log('');

  const totals = { candidates: 0, present: 0, missing: 0, unroutable: 0, ambiguous: 0, emitted: 0, failed: 0 };

  for (const rule of RULES) {
    if (onlyType && rule.eventType !== onlyType) continue;

    let query = db.from(rule.table).select(rule.select);
    if (since) query = query.gte('created_at', since);
    const { data: rows, error } = await query;

    if (error) {
      console.log(rule.eventType.padEnd(20), 'SKIPPED —', error.message.slice(0, 60));
      continue;
    }

    const eligible = (rows ?? []).filter(r => rule.eligible(r as unknown as Record<string, unknown>));
    let present = 0, missing = 0, unroutable = 0, ambiguous = 0, emitted = 0, failed = 0;

    for (const row of eligible) {
      const c = rule.toCandidate(row as unknown as Record<string, unknown>);
      if (seen.has(c.key)) { present++; continue; }

      let shop = c.shopId ? shopById.get(c.shopId) : null;

      // Organization-scoped row: recover the shop only when it is unambiguous.
      if (!shop && rule.scope === 'organization') {
        if (!c.organizationId) { unroutable++; continue; }
        const candidates = (shops ?? []).filter(x => x.organization_id === c.organizationId);
        if (candidates.length !== 1) { ambiguous++; continue; }
        shop = candidates[0];
      }

      if (!shop || !shop.organization_id) { unroutable++; continue; }
      missing++;

      if (!execute) continue;

      const context = createDomainContext({
        organizationId: shop.organization_id as string,
        shopId: shop.id as string,
        shopIds: [shop.id as string],
        // A repair is not a person. Recording it as the operator who happened
        // to run the script would put a false actor on the event.
        actor: { userId: null, type: 'system', role: null },
        capabilities: [],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await emitDomainEvent(db as any, context, {
        eventType: rule.eventType,
        aggregateType: c.aggregateType,
        aggregateId: c.aggregateId,
        payload: { ...c.payload, _reconciled: true },
        idempotencyKey: c.key,
      });
      if (ok) { emitted++; seen.add(c.key); } else { failed++; }
    }

    totals.candidates += eligible.length;
    totals.present += present; totals.missing += missing;
    totals.unroutable += unroutable; totals.ambiguous += ambiguous;
    totals.emitted += emitted; totals.failed += failed;

    console.log(
      rule.eventType.padEnd(20),
      'eligible=' + String(eligible.length).padStart(4),
      'present=' + String(present).padStart(4),
      'missing=' + String(missing).padStart(4),
      'unroutable=' + String(unroutable).padStart(3),
      ambiguous ? 'ambiguous=' + ambiguous : '',
      execute ? 'emitted=' + emitted + ' failed=' + failed : '',
    );
  }

  console.log('\ntotals:', JSON.stringify(totals));
  if (!execute && totals.missing > 0) {
    console.log('\nRe-run with --execute --since <ISO> to emit the missing events.');
  }
  if (totals.ambiguous > 0) {
    console.log(
      '\n' + totals.ambiguous + ' record(s) are organization-scoped in an organization holding\n' +
      'more than one shop. The business row does not record which shop the action\n' +
      'was taken in, so the event cannot be rebuilt without guessing. Left alone.',
    );
  }
  if (totals.unroutable > 0) {
    console.log(
      '\n' + totals.unroutable + ' record(s) belong to a shop with no organization and were NOT\n' +
      'emitted. Apply 2026-08-20_m12_3_shop_organization_backfill.sql first.',
    );
  }
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
