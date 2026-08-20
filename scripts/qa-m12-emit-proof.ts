/**
 * M12 acceptance proof: does a real business action put an event on the outbox?
 *
 * Creates ONE disposable invoice through the domain layer — the same
 * createInvoiceDomain().create() that services/invoiceService.ts wraps — then
 * reports what reached domain_event_outbox. It does not insert an event by
 * hand; that would prove nothing except that INSERT works.
 *
 * The invoice is zero-value with no lines, so it cannot affect receivables,
 * aging or any total, and it is deleted again at the end. The EVENT is left in
 * place deliberately: the outbox is the artefact under test.
 *
 * Known limitation, stated rather than hidden: this exercises the domain
 * service path from Node, not the browser. Two things therefore remain
 * unproven by this script and are checked separately —
 *   - the browser's audit implementation (auditFromBrowser) rather than audit.ts
 *   - the outbox RLS INSERT policy, because service_role bypasses RLS
 *
 * Usage:
 *   npx tsx scripts/qa-m12-emit-proof.ts            # baseline only
 *   npx tsx scripts/qa-m12-emit-proof.ts --run      # create, observe, clean up
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

const ORGANIZATION_ID = 'faed7805-090a-411e-9a0b-42ff66dc3840';
const SHOP_ID = '38d55fae-741b-4bac-b520-f96eed65bf38';
const OTHER_SHOP_ID = '90b72748-bf01-4456-999f-f4ba48091606';
const ACTOR_USER_ID = '0a6ba4ea-199d-4d10-817f-ace29b84b1fd';

async function main() {
  const run = process.argv.includes('--run');
  const db = createClient(SUPABASE_URL, SUPABASE_SVC);
  const { createDomainContext } = await import('../lib/domain/context');
  const { createInvoiceDomain } = await import('../lib/domain/invoices');

  const countOf = async (t: string) => {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
    return error ? -1 : (count ?? 0);
  };

  const before = {
    outbox: await countOf('domain_event_outbox'),
    ribEvents: await countOf('rib_events'),
    invoices: await countOf('invoices'),
  };

  const { data: membership } = await db
    .from('shop_users').select('role').eq('user_id', ACTOR_USER_ID).eq('shop_id', SHOP_ID).maybeSingle();
  const actorRole = (membership?.role as string) ?? null;

  const invoiceNumber = 'QA-M12-' + Date.now();

  console.log('PHASE 3 — baseline before the action');
  console.log('  shop_id            :', SHOP_ID);
  console.log('  actor_user_id      :', ACTOR_USER_ID);
  console.log('  actor role         :', actorRole);
  console.log('  action             : invoice.create (domain layer)');
  console.log('  expected event     : invoice.issued');
  console.log('  expected aggregate :', invoiceNumber);
  console.log('  domain_event_outbox:', before.outbox);
  console.log('  rib_events         :', before.ribEvents);
  console.log('  invoices           :', before.invoices);

  if (!run) { console.log('\nBaseline only. Re-run with --run to perform the action.'); return; }
  if (!actorRole) throw new Error('No shop_users role for the actor; refusing to write.');

  const context = createDomainContext({
    organizationId: ORGANIZATION_ID,
    shopId: SHOP_ID,
    shopIds: [SHOP_ID, OTHER_SHOP_ID],
    actor: { userId: ACTOR_USER_ID, type: 'user', role: actorRole },
    capabilities: ['invoices.manage', 'invoices.read'],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = createInvoiceDomain({ db: db as any, context });

  console.log('\nPHASE 4 — performing the action');
  const created = await invoices.create({
    invoiceNumber,
    customerName: '[QA] M12 emit proof — safe to delete',
    customerId: '',
    vehicle: '',
    jobCardId: '',
    status: 'Draft',
    lines: [],
    discount: 0,
    shopSupplies: 0,
    taxRate: 0,
    notes: 'Created by scripts/qa-m12-emit-proof.ts to prove M12 event emission.',
    dueDate: '',
    paidDate: null,
    currency: 'USD',
  });
  console.log('  invoice created    :', created.invoiceNumber);

  const { data: events } = await db
    .from('domain_event_outbox')
    .select('*')
    .eq('aggregate_id', invoiceNumber);

  console.log('\n  outbox rows for this aggregate:', (events ?? []).length);
  for (const e of events ?? []) {
    console.log('    id             :', e.id);
    console.log('    event_type     :', e.event_type);
    console.log('    event_version  :', e.event_version);
    console.log('    status         :', e.status);
    console.log('    shop_id        :', e.shop_id, e.shop_id === SHOP_ID ? '(correct)' : '(WRONG)');
    console.log('    organization_id:', e.organization_id, e.organization_id === ORGANIZATION_ID ? '(correct)' : '(WRONG)');
    console.log('    actor_user_id  :', e.actor_user_id, e.actor_user_id === ACTOR_USER_ID ? '(correct)' : '(WRONG)');
    console.log('    actor_type     :', e.actor_type);
    console.log('    aggregate      :', e.aggregate_type + '/' + e.aggregate_id);
    console.log('    idempotency_key:', e.idempotency_key);
    console.log('    payload        :', JSON.stringify(e.payload));
  }

  console.log('\nPHASE 5 — idempotency');
  const { emitDomainEvent, DOMAIN_EVENTS } = await import('../lib/domain/events');
  const second = await emitDomainEvent(db as never, context, {
    eventType: DOMAIN_EVENTS.invoiceIssued,
    aggregateType: 'invoice',
    aggregateId: invoiceNumber,
    payload: { invoiceNumber },
    idempotencyKey: 'invoice.issued:' + invoiceNumber,
  });
  const { count: afterDup } = await db
    .from('domain_event_outbox').select('*', { count: 'exact', head: true }).eq('aggregate_id', invoiceNumber);
  console.log('  re-emit with the same idempotency key returned:', second, '(false = refused)');
  console.log('  outbox rows for this aggregate now            :', afterDup, afterDup === 1 ? '(no duplicate)' : '(DUPLICATED)');

  console.log('\nCleanup — removing the QA invoice; the event stays, it is the artefact.');
  await invoices.remove(invoiceNumber);
  const after = { invoices: await countOf('invoices'), outbox: await countOf('domain_event_outbox') };
  console.log('  invoices           :', before.invoices, '->', after.invoices);
  console.log('  domain_event_outbox:', before.outbox, '->', after.outbox);
}

main().catch(err => { console.error(err); process.exit(1); });
