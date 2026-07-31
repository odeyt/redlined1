/**
 * Guard rail: identifies which Supabase project the current run is pointed at,
 * and refuses to create synthetic test data in production unless explicitly
 * overridden.
 *
 * The local E2E harness provisions and deletes real rows. That is safe in a
 * staging project and merely *mostly* safe in production — a cleanup bug there
 * has a real blast radius. This makes the target an explicit, visible decision
 * instead of whatever happens to be in the environment.
 */

/** Production Supabase project ref for redlined1. */
export const PRODUCTION_REF = 'ldjrlvjkmzrcdqhetqoh';

export function currentProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return url.match(/https?:\/\/([^.]+)\.supabase\./)?.[1] ?? '';
}

export function isProductionDb(): boolean {
  return currentProjectRef() === PRODUCTION_REF;
}

export function describeTarget(): string {
  const ref = currentProjectRef();
  if (!ref) return 'unknown (NEXT_PUBLIC_SUPABASE_URL not set)';
  return isProductionDb() ? `${ref} (PRODUCTION)` : `${ref} (non-production)`;
}

/**
 * Throws when about to write synthetic data into production.
 * Set ALLOW_PROD_E2E=true to proceed deliberately — e.g. the audit suite, which
 * is read-only against production by design.
 */
export function assertSafeToSeed(): void {
  if (!isProductionDb()) return;
  if (process.env.ALLOW_PROD_E2E === 'true') {
    console.warn(`[db-target] Seeding synthetic data into PRODUCTION (${PRODUCTION_REF}) — ALLOW_PROD_E2E=true`);
    return;
  }
  throw new Error(
    `[db-target] Refusing to create test data in the PRODUCTION database (${PRODUCTION_REF}).\n` +
    `  Point local dev at staging: copy .env.development.local.example to\n` +
    `  .env.development.local and fill in your redlined1-staging values.\n` +
    `  To override deliberately, set ALLOW_PROD_E2E=true.`,
  );
}
