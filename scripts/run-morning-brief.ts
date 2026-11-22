/**
 * One pass of the Redline AI morning-brief emails. Run by
 * .github/workflows/morning-brief.yml, the only scheduler; see
 * lib/morningBrief/runner.ts.
 *
 * DRY RUN unless every launch gate in lib/morningBrief/config.ts passes —
 * then it prints which shops would get a brief at their next local 05:00
 * and sends nothing. Output is JSON with counts, shop names and shortened
 * ids, never email addresses. Exits non-zero if any send failed, so the
 * workflow run shows red.
 *
 * Usage:
 *   npm run morning-brief:run
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const { readMorningBriefConfig } = await import('../lib/morningBrief/config');
  const { runMorningBrief } = await import('../lib/morningBrief/runner');
  const config = readMorningBriefConfig();

  // The real transport exists only when every gate has passed. Shared with
  // trial-tips: same provider, same send classification.
  const transport = config.live
    ? (await import('../lib/trialTips/resendTransport')).resendTransport(config.resendApiKey!)
    : null;

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await runMorningBrief({ db, transport, config });

  console.log(JSON.stringify({
    mode: report.mode,
    audience: report.audience,
    blockers: report.blockers,
    shopsConsidered: report.shopsConsidered,
    outcomes: report.outcomes,
    copies: report.copies,
    items: report.items,
  }, null, 2));

  // Red run for anything a person should look at.
  const attention = report.outcomes.failed + report.outcomes.uncertain + report.outcomes.record_failed;
  if (attention > 0) process.exit(2);
}

main().catch(err => {
  console.error('[morning-brief] run failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
