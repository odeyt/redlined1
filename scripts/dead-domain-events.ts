/**
 * Operator worklist for domain events that could not be delivered.
 *
 * Not a user-facing screen and should not become one: the outbox spans every
 * tenant, so a shop user must never see it. `authenticated` has no grant on
 * the table at all, and this connects with the service role deliberately.
 *
 * Reading a dead event tells you which of two things happened:
 *
 *   - the tenancy was wrong (no organization_id). Fix the shop, then run
 *     scripts/reconcile-domain-events.ts — the business record is the source
 *     of truth and the event is rebuilt from it. Do NOT resurrect the dead row.
 *   - delivery genuinely failed. The row can be requeued once the cause is
 *     fixed, because the idempotency key stops a double delivery.
 *
 * Usage:
 *   npx tsx scripts/dead-domain-events.ts
 *   npx tsx scripts/dead-domain-events.ts --requeue <event-id>
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

async function main() {
  const db = createClient(SUPABASE_URL, SUPABASE_SVC);
  const requeueId = process.argv.includes('--requeue')
    ? process.argv[process.argv.indexOf('--requeue') + 1]
    : null;

  if (requeueId) {
    const { data: row } = await db
      .from('domain_event_outbox')
      .select('id, event_type, status, organization_id, shop_id')
      .eq('id', requeueId)
      .maybeSingle();

    if (!row) { console.error('No such event: ' + requeueId); process.exit(1); }
    if (row.status !== 'dead') { console.error('Not dead (status ' + row.status + '); nothing to requeue.'); process.exit(1); }
    if (!row.organization_id || !row.shop_id) {
      console.error(
        'This event still has no routing identity, so requeueing would only kill it\n' +
        'again. Fix shops.organization_id first, then reconcile from the business\n' +
        'record rather than requeueing this row.',
      );
      process.exit(1);
    }

    const { error } = await db
      .from('domain_event_outbox')
      .update({ status: 'pending', attempts: 0, last_error: null, claimed_at: null, claimed_by: null })
      .eq('id', requeueId)
      .eq('status', 'dead');
    if (error) { console.error('Requeue failed: ' + error.message); process.exit(1); }
    console.log('Requeued ' + row.event_type + ' ' + requeueId + '. Run npm run events:relay.');
    return;
  }

  const { data: dead, error } = await db
    .from('domain_event_outbox')
    .select('id, event_type, aggregate_type, aggregate_id, shop_id, organization_id, attempts, last_error, created_at, updated_at')
    .eq('status', 'dead')
    .order('created_at', { ascending: false });
  if (error) throw error;

  if (!dead?.length) { console.log('No dead events.'); return; }

  const { data: shops } = await db.from('shops').select('id, name');
  const shopName = (id: string | null) => (shops ?? []).find(s => s.id === id)?.name ?? String(id ?? '—');

  console.log(dead.length + ' dead event(s):\n');
  for (const d of dead) {
    console.log('  ' + d.event_type + '  ' + d.id);
    console.log('    tenant    : ' + shopName(d.shop_id) + (d.organization_id ? '' : '  (NO ORGANIZATION)'));
    console.log('    aggregate : ' + d.aggregate_type + '/' + d.aggregate_id);
    console.log('    attempts  : ' + d.attempts);
    console.log('    error     : ' + d.last_error);
    console.log('    created   : ' + d.created_at + '   updated: ' + (d.updated_at ?? '—'));
    console.log('');
  }

  const orphaned = dead.filter(d => !d.organization_id).length;
  if (orphaned) {
    console.log(
      orphaned + ' of these have no organization. Apply\n' +
      '2026-08-20_m12_3_shop_organization_backfill.sql, then reconcile from the\n' +
      'business records — do not requeue these rows.',
    );
  }
}

main().catch(err => { console.error(err); process.exit(1); });
