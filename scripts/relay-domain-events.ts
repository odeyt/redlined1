/**
 * Drains the domain event outbox into the bus store.
 *
 * Follows the convention of the other scripts here (flush-sapelee-outbox.ts,
 * recalculate-shop-intelligence.ts): connect directly with the service role,
 * do the work, print JSON, exit non-zero if anything failed.
 *
 * Connecting directly rather than through an HTTP route is deliberate — it
 * sidesteps the app's session-gated middleware entirely, which is what makes
 * this runnable from a scheduled job with no user.
 *
 * Usage:
 *   npm run events:relay
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
  const { relayOnce } = await import('../lib/events/relay');
  const db = createClient(SUPABASE_URL, SUPABASE_SVC);

  // A worker name, so `claimed_by` says which run holds a row when two
  // overlap. Without it every claim reads 'relay' and a stuck row tells you
  // nothing about who stuck it.
  const worker = process.env.GITHUB_RUN_ID
    ? 'gha-' + process.env.GITHUB_RUN_ID
    : 'local-' + process.pid;

  const result = await relayOnce(db, { worker });
  console.log(JSON.stringify(result, null, 2));

  // Alert on events that reached `dead` in THIS pass.
  //
  // Narrow on purpose. Alerting inside relayOnce would fire on every retry of
  // an event that succeeds on attempt three; alerting on a scan of all dead
  // rows would re-fire the same events on every run until someone cleared
  // them, which is how an alert channel becomes noise nobody reads.
  if (result.settledFailures.length) {
    const { data: dead } = await db
      .from('domain_event_outbox')
      .select('id, event_type, shop_id, organization_id, attempts, last_error, correlation_id')
      .in('id', result.settledFailures)
      .eq('status', 'dead');

    for (const row of dead ?? []) {
      // Identifiers and the error only. The payload can hold customer detail
      // and an alert channel is the wrong place for it.
      const { alertException } = await import('../lib/observability/alerts');
      alertException('events.relay', new Error('domain event is dead: ' + row.last_error), {
        eventId: row.id,
        eventType: row.event_type,
        shopId: row.shop_id,
        organizationId: row.organization_id,
        attempts: row.attempts,
        correlationId: row.correlation_id,
        worker,
      });
      console.error(
        '[relay] DEAD ' + row.event_type + ' id=' + row.id +
        ' shop=' + row.shop_id + ' attempts=' + row.attempts + ' — ' + row.last_error,
      );
    }
    if ((dead ?? []).length) process.exitCode = 1;
  }

  // Unroutable events are a data problem, not a relay failure — they are
  // reported and marked dead, and the run itself succeeded.
  if (result.failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
