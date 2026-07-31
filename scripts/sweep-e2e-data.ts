/**
 * Removes synthetic E2E accounts and shops left behind by runs that crashed
 * before teardown. Matches only the reserved `.invalid` domain, so it can never
 * touch a real account.
 *
 * Usage: npm run test:sweep
 */
import { config as loadDotenv } from 'dotenv';
import path from 'path';

loadDotenv({ path: path.resolve(__dirname, '../.env.local') });

import { sweepAbandonedSyntheticUsers } from '../tests/helpers/e2e-cleanup';

async function main() {
  const result = await sweepAbandonedSyntheticUsers();

  if (!result.ran) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — nothing swept.');
    process.exit(1);
  }

  console.log(`Swept synthetic E2E data — shops: ${result.shopsDeleted}, users: ${result.usersDeleted}`);
  if (result.errors.length > 0) {
    console.log('Reported:');
    for (const e of result.errors) console.log('  -', e);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
