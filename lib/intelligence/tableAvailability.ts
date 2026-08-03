import { getAdminDb } from '@/lib/supabaseServer';

/**
 * Whether the tables an intelligence feature needs actually exist.
 *
 * Twenty-eight tables are referenced in code and absent from the database. The
 * engines reading them catch their own errors — BusinessMemoryEngine alone has
 * sixteen catch blocks — so a missing table produces an empty result rather
 * than a failure, and the Command Center panels render it as "ALL CLEAR" and
 * "0 CRITICAL".
 *
 * That is worse than an error. A shop with genuine overdue invoices is told
 * everything is fine, and neither they nor we can tell the difference between
 * "nothing to report" and "we never looked".
 *
 * Checking up front is deliberate. Detecting it from the error afterwards was
 * already attempted in /api/intelligence/memory, which matches on 'does not
 * exist' and 'relation' — but PostgREST answers a missing table with
 * "Could not find the table 'public.x' in the schema cache", so that check
 * never fired. Probing beats parsing someone else's error text.
 *
 * Cached per process: the answer changes only when a migration runs, and this
 * sits in front of a dashboard that loads on every visit.
 */
const cache = new Map<string, boolean>();

/** PostgREST codes for a table that is absent rather than merely empty. */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

async function tableExists(name: string): Promise<boolean> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  let exists = true;
  try {
    const { error } = await getAdminDb().from(name).select('*', { head: true, count: 'exact' }).limit(1);
    if (error && MISSING_TABLE_CODES.has(error.code)) exists = false;
    // Any other error — a permission problem, a network blip — is not evidence
    // the table is missing, so the feature is left enabled rather than being
    // switched off by an unrelated fault.
  } catch {
    exists = true;
  }

  cache.set(name, exists);
  return exists;
}

/**
 * True when every named table exists, so the feature can run.
 *
 * Callers should return `{ unavailable: true }` when this is false, and the UI
 * should say so — never render a zero or an "all clear" derived from a table
 * that is not there.
 */
export async function featureTablesReady(...names: string[]): Promise<boolean> {
  const results = await Promise.all(names.map(tableExists));
  return results.every(Boolean);
}

/** Test seam — clears the per-process cache. */
export function resetTableAvailabilityCache(): void {
  cache.clear();
}
