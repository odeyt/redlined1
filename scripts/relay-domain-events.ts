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

  // Unroutable events are a data problem, not a relay failure — they are
  // reported and marked dead, and the run itself succeeded.
  if (result.failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
