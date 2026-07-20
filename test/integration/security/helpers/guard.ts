/**
 * Hard safety gate for the security integration suite. This suite runs
 * real authenticated requests against a real Supabase project and must
 * NEVER be able to accidentally target production — the confirmation
 * string is deliberately awkward to type/set by accident, and every check
 * below fails CLOSED (skip everything) rather than open.
 */
export type TestCredentials = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

const REQUIRED_CONFIRMATION = 'REDLINED1_STAGING_ONLY';

export function getTestCredentials(): TestCredentials | null {
  if (process.env.TEST_DATABASE_CONFIRMATION !== REQUIRED_CONFIRMATION) return null;

  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;

  // Never run against anything that looks like the production project —
  // this is a heuristic, not a substitute for using an actually-separate
  // staging project, but it catches the "pasted the wrong .env" mistake.
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (prodUrl && url === prodUrl) {
    throw new Error(
      'SUPABASE_TEST_URL is identical to NEXT_PUBLIC_SUPABASE_URL (production). ' +
      'Refusing to run — this suite must only ever target a separate staging project.',
    );
  }

  return { url, anonKey, serviceRoleKey };
}

/**
 * Wraps a describe block so it runs normally when staging credentials and
 * the exact confirmation string are present, and skips cleanly (not a
 * failure) otherwise — this is what makes `npm run test:integration:security`
 * safe to run in any environment, including CI or a laptop with no staging
 * access configured at all.
 */
export function describeIntegration(name: string, fn: (creds: TestCredentials) => void): void {
  const creds = getTestCredentials();
  if (!creds) {
    describe.skip(`${name} (skipped — set SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEY/SUPABASE_TEST_SERVICE_ROLE_KEY and TEST_DATABASE_CONFIRMATION=${REQUIRED_CONFIRMATION} to run)`, () => {
      it('skipped', () => {});
    });
    return;
  }
  describe(name, () => fn(creds));
}
