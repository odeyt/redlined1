/**
 * One pass of the trial-tips emails. Run by .github/workflows/trial-tips.yml,
 * the only scheduler; see lib/trialTips/runner.ts.
 *
 * DRY RUN unless every launch gate in lib/trialTips/config.ts passes — then it
 * prints who is due and sends nothing. Output is JSON with counts and short
 * ids, never email addresses. Exits non-zero if any send failed, so the
 * workflow run shows red.
 *
 * Usage:
 *   npm run trial-tips:run
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

  const { readTrialTipsConfig } = await import('../lib/trialTips/config');
  const { runTrialTips } = await import('../lib/trialTips/runner');
  const config = readTrialTipsConfig();

  // The real transport exists only when every gate has passed.
  const transport = config.live
    ? (await import('../lib/trialTips/resendTransport')).resendTransport(config.resendApiKey!)
    : null;

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await runTrialTips({ db, transport, config });

  console.log(JSON.stringify({
    mode: report.mode,
    audience: report.audience,
    blockers: report.blockers,
    due: report.due,
    outcomes: report.outcomes,
    byStep: report.byStep,
    items: report.items,
    needsReview: report.needsReview,
    // Compare with the web app's value (see docs) — never the secret itself.
    unsubscribeSecretFingerprint: report.unsubscribeSecretFingerprint,
  }, null, 2));

  // Red run for anything a person should look at.
  const attention = report.outcomes.failed + report.outcomes.uncertain
    + report.outcomes.record_failed + report.needsReview.length;
  if (attention > 0) process.exit(2);
}

main().catch(err => {
  console.error('[trial-tips] run failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
