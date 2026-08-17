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

/**
 * The staging project, when one is configured.
 *
 * Read from the environment rather than hardcoded: this file is the safety
 * anchor, and the one value it must never be wrong about is which ref is
 * production. Naming staging here too would mean editing the guard every time
 * the second project is rebuilt, and a guard people edit routinely is a guard
 * people eventually edit carelessly.
 *
 * Set STAGING_PROJECT_REF in .env.development.local alongside the staging URL.
 */
export const STAGING_REF = process.env.STAGING_PROJECT_REF ?? '';

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
  if (isProductionDb()) return `${ref} (PRODUCTION)`;
  if (STAGING_REF && ref === STAGING_REF) return `${ref} (staging)`;
  return `${ref} (unrecognised project)`;
}

/**
 * Throws when about to write synthetic data into production.
 * Set ALLOW_PROD_E2E=true to proceed deliberately — e.g. the audit suite, which
 * is read-only against production by design.
 */
export function assertSafeToSeed(): void {
  if (!isProductionDb()) {
    // Not production, but not the project this machine was told to expect
    // either. Usually a half-applied env change — .env.development.local
    // filled in while the shell still holds an older value. Seeding a
    // database nobody meant to target is how test rows end up somewhere
    // nobody thinks to look for them.
    if (STAGING_REF && currentProjectRef() !== STAGING_REF) {
      console.warn(
        `[db-target] Target is ${describeTarget()}, but STAGING_PROJECT_REF is ${STAGING_REF}. ` +
        `Seeding anyway — it is not production — but check which database you are pointed at.`,
      );
    }
    return;
  }
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
