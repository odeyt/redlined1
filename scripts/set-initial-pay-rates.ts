/**
 * Records an opening pay rate for every employee who has none.
 *
 * Written for a one-off: `salary_records` was empty while thirteen people were
 * on the payroll, so payroll could not compute. It is safe to leave in the
 * repo because it refuses to touch anyone who already has a rate.
 *
 * ## Why this does not read technicians.pay_rate
 *
 * That column looked like the obvious source and is not usable. Twenty-two of
 * twenty-five rows read exactly 25/Hourly, which is a default somebody
 * accepted rather than a negotiated wage; the same person disagrees with
 * themselves across the two shops (Don and popeye are Hourly in one and
 * Commission in the other, Wally is Salary 0 in one and Hourly 25 in the
 * other); and 'Commission' and 'Salary' are not pay types this system accepts.
 * Migrating it would have written a fabricated wage for thirteen real people
 * into an append-only table.
 *
 * The figures below came from the operator instead.
 *
 * ## Why it goes through the domain layer
 *
 * A raw insert would skip the pay-type check, the negative-amount check, and
 * the audit row. Salary history is evidence someone reaches for when they
 * dispute a payslip, so every row here is attributable to the person who
 * authorised it.
 *
 * Usage:
 *   npx tsx scripts/set-initial-pay-rates.ts          # report only
 *   npx tsx scripts/set-initial-pay-rates.ts --write  # actually insert
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

/** The D1 Imports organisation, and the shop a write is attributed to. */
const ORGANIZATION_ID = 'faed7805-090a-411e-9a0b-42ff66dc3840';
const SHOP_ID = '38d55fae-741b-4bac-b520-f96eed65bf38';
const SHOP_IDS = [SHOP_ID, '90b72748-bf01-4456-999f-f4ba48091606'];

/** Who authorised these rates. Recorded on every row and every audit entry. */
const ACTOR_USER_ID = '0a6ba4ea-199d-4d10-817f-ace29b84b1fd';

const PAY_TYPE = 'Monthly' as const;
const AMOUNT = 3_000_000;
const CURRENCY = 'LAK';

async function main() {
  const write = process.argv.includes('--write');
  const db = createClient(SUPABASE_URL, SUPABASE_SVC);
  const { createDomainContext } = await import('../lib/domain/context');
  const { createSalaryDomain } = await import('../lib/domain/salary');

  const effectiveFrom = new Date().toISOString().slice(0, 10);

  const { data: employees, error } = await db
    .from('employees')
    .select('id, full_name, employment_status, archived_at')
    .eq('organization_id', ORGANIZATION_ID)
    .is('archived_at', null)
    .order('full_name');
  if (error) throw error;

  const { data: existing } = await db
    .from('salary_records')
    .select('employee_id')
    .eq('organization_id', ORGANIZATION_ID);
  const alreadyHasRate = new Set((existing ?? []).map(r => r.employee_id as string));

  const todo = (employees ?? []).filter(e => !alreadyHasRate.has(e.id as string));

  console.log('effective from   :', effectiveFrom);
  console.log('rate             :', PAY_TYPE, AMOUNT.toLocaleString('en-US'), CURRENCY);
  console.log('employees         :', (employees ?? []).length);
  console.log('already have one  :', alreadyHasRate.size);
  console.log('to be written     :', todo.length);
  console.log('');

  if (!write) {
    for (const e of todo) console.log('  would set', e.full_name);
    console.log('\nReport only. Re-run with --write to insert.');
    return;
  }

  // `role` matters more than it looks. audit.ts sends p_actor_role to
  // record_audit_event, supabase-js drops undefined keys from the body, and
  // PostgREST then cannot match the overload — so the audit write fails with
  // "Could not find the function ... in the schema cache" while the salary row
  // has already been inserted. The browser always sets a role, which is why
  // the app never sees this. Read the real one rather than assuming.
  const { data: membership } = await db
    .from('shop_users')
    .select('role')
    .eq('user_id', ACTOR_USER_ID)
    .eq('shop_id', SHOP_ID)
    .maybeSingle();

  const actorRole = (membership?.role as string) ?? null;
  if (!actorRole) {
    throw new Error(
      'No shop_users row for the actor in ' + SHOP_ID + '. Refusing to write pay ' +
      'without knowing what role authorised it — that is the point of the audit row.',
    );
  }

  const context = createDomainContext({
    organizationId: ORGANIZATION_ID,
    shopId: SHOP_ID,
    shopIds: SHOP_IDS,
    actor: { userId: ACTOR_USER_ID, type: 'user', role: actorRole },
    capabilities: ['salary.manage', 'salary.read_all', 'salary.read_own'],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salary = createSalaryDomain({ db: db as any, context });

  // Repair pass, before writing anything new.
  //
  // The first run of this script inserted all thirteen salary rows and then
  // failed every audit write, for the p_actor_role reason above. writeAuditEvent
  // throws deliberately — for money, an unaudited write is worse than a failed
  // one — so the script reported "written 0 of 13" while the database held
  // thirteen rows. The rows are real and correct; only the audit trail is
  // missing, and salary_records is append-only so they cannot be redone.
  const { data: orphans } = await db
    .from('salary_records')
    .select('id, employee_id, effective_from, pay_type, amount, currency')
    .eq('organization_id', ORGANIZATION_ID);

  const { data: audited } = await db
    .from('audit_events')
    .select('entity_id')
    .eq('entity_type', 'salary_record');
  const hasAudit = new Set((audited ?? []).map(a => a.entity_id as string));

  const needsAudit = (orphans ?? []).filter(r => !hasAudit.has(r.id as string));
  if (needsAudit.length) {
    console.log('repairing', needsAudit.length, 'salary rows with no audit entry');
    for (const r of needsAudit) {
      const { error: auditError } = await db.rpc('record_audit_event', {
        p_shop_id: SHOP_ID,
        p_actor_type: 'user',
        p_actor_role: actorRole,
        p_action: 'salary.set',
        p_entity_type: 'salary_record',
        p_entity_id: r.id,
        p_before: null,
        p_after: {
          employeeId: r.employee_id,
          effectiveFrom: r.effective_from,
          payType: r.pay_type,
          amount: Number(r.amount),
          currency: r.currency,
        },
        p_metadata: { repairedBy: 'scripts/set-initial-pay-rates.ts' },
        p_request_id: null,
      });
      if (auditError) console.error('  audit repair FAILED for', r.id, auditError.message);
    }
    console.log('');
  }

  let written = 0;
  const failures: string[] = [];

  for (const e of todo) {
    try {
      await salary.setSalary({
        employeeId: e.id as string,
        effectiveFrom,
        payType: PAY_TYPE,
        amount: AMOUNT,
        currency: CURRENCY,
        notes: 'Opening rate recorded when salary history was first populated.',
      });
      written += 1;
      console.log('  set', e.full_name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(e.full_name + ': ' + message);
      console.error('  FAILED', e.full_name, '—', message);
    }
  }

  console.log('\nwritten', written, 'of', todo.length);
  if (failures.length) {
    console.error('failures:\n  ' + failures.join('\n  '));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
