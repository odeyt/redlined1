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

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SVC) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

interface Candidate {
  key: string;
  aggregateType: string;
  aggregateId: string;
  shopId: string | null;
  /** Set instead of shopId for organization-scoped tables. */
  organizationId?: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface Rule {
  eventType: string;
  table: string;
  select: string;
  /**
   * Which tenant column the authoritative row carries.
   *
   * payroll_runs and leave_requests are organization-scoped: they have no
   * shop_id at all. The live emitter still writes one, taken from whichever
   * shop the user happened to be in — a fact the business row does not record.
   * So for an organization holding more than one shop, the shop cannot be
   * recovered and the event is reported AMBIGUOUS rather than guessed. D1
   * Imports has two locations, which is exactly that case.
   */
  scope?: 'shop' | 'organization';
  /** The state that means this event SHOULD exist. Not "every row". */
  eligible: (row: Record<string, unknown>) => boolean;
  toCandidate: (row: Record<string, unknown>) => Candidate;
}

const s = (v: unknown) => (v == null ? '' : String(v));

/**
 * One rule per emitter, mirroring exactly what it fires on and the key it uses.
 * If an emitter changes, this changes with it — the drift test in
 * lib/domain/__tests__/eventsEmitted.test.ts keeps the list of types honest.
 */
const RULES: Rule[] = [
  {
    eventType: 'invoice.issued',
    table: 'invoices',
    select: 'number, shop_id, customer_id, repair_order_id, status, currency, created_at',
    // The emitter fires on create, so existence IS the eligible state.
    eligible: () => true,
    toCandidate: r => ({
      key: 'invoice.issued:' + s(r.number),
      aggregateType: 'invoice',
      aggregateId: s(r.number),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        invoiceNumber: s(r.number), customerId: s(r.customer_id),
        repairOrderId: (r.repair_order_id as string) ?? null,
        status: s(r.status), currency: s(r.currency),
      },
    }),
  },
  {
    eventType: 'payment.recorded',
    table: 'payments',
    select: 'id, shop_id, invoice_number, amount, currency, method, entry_type, created_at',
    eligible: r => r.entry_type === 'payment',
    toCandidate: r => ({
      key: 'payment.recorded:' + s(r.id),
      aggregateType: 'payment',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        invoiceNumber: s(r.invoice_number), amount: Number(r.amount ?? 0),
        currency: s(r.currency), method: s(r.method),
      },
    }),
  },
  {
    eventType: 'payment.reversed',
    table: 'payments',
    select: 'id, shop_id, invoice_number, amount, currency, method, entry_type, reverses_payment_id, reason, created_at',
    eligible: r => r.entry_type === 'reversal' && Boolean(r.reverses_payment_id),
    toCandidate: r => ({
      // Keyed on the ORIGINAL payment, matching the emitter.
      key: 'payment.reversed:' + s(r.reverses_payment_id),
      aggregateType: 'payment',
      aggregateId: s(r.reverses_payment_id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        reversalId: s(r.id), invoiceNumber: s(r.invoice_number),
        amount: Number(r.amount ?? 0), currency: s(r.currency),
        method: s(r.method), reason: s(r.reason),
      },
    }),
  },
  {
    eventType: 'expense.approved',
    table: 'expenses',
    select: 'id, shop_id, status, amount, currency, created_at',
    eligible: r => r.status === 'Approved',
    toCandidate: r => ({
      key: 'expense.approved:' + s(r.id),
      aggregateType: 'expense',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: { amount: Number(r.amount ?? 0), currency: s(r.currency) },
    }),
  },
  {
    eventType: 'leave.approved',
    table: 'leave_requests',
    scope: 'organization',
    select: 'id, organization_id, employee_id, status, start_date, end_date, created_at',
    eligible: r => r.status === 'Approved',
    toCandidate: r => ({
      key: 'leave.approved:' + s(r.id),
      aggregateType: 'leave_request',
      aggregateId: s(r.id),
      shopId: null,
      organizationId: (r.organization_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        employeeId: s(r.employee_id),
        startDate: s(r.start_date), endDate: s(r.end_date),
      },
    }),
  },
  {
    eventType: 'cash_day.closed',
    table: 'cash_days',
    select: 'id, shop_id, status, closed_at, created_at',
    eligible: r => Boolean(r.closed_at),
    toCandidate: r => ({
      key: 'cash_day.closed:' + s(r.id),
      aggregateType: 'cash_day',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.closed_at || r.created_at),
      payload: { status: s(r.status) },
    }),
  },
  {
    eventType: 'payroll.finalised',
    table: 'payroll_runs',
    scope: 'organization',
    select: 'id, organization_id, status, finalised_at, created_at',
    eligible: r => Boolean(r.finalised_at),
    toCandidate: r => ({
      key: 'payroll.finalised:' + s(r.id),
      aggregateType: 'payroll_run',
      aggregateId: s(r.id),
      shopId: null,
      organizationId: (r.organization_id as string) ?? null,
      createdAt: s(r.finalised_at || r.created_at),
      payload: { status: s(r.status) },
    }),
  },
];

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
