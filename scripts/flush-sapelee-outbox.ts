/**
 * Phase E Part 1, Part 7 — manual/external-cron trigger for the Sapelee
 * event outbox flush. Matching this repo's own script convention
 * (recalculate-shop-intelligence.ts, rebuild-business-memory.ts, etc.).
 *
 * Usage:
 *   npm run sapelee:flush
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SVC) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function main() {
  const { flushSapeleeOutbox } = await import('../lib/sapelee/flush');
  const db = createClient(SUPABASE_URL, SUPABASE_SVC);
  const result = await flushSapeleeOutbox(db);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[sapelee:flush] fatal error', err);
  process.exit(1);
});
