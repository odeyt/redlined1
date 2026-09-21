/**
 * lib/admin/concurrency.ts
 * Pure. Promise.allSettled with a ceiling on how many calls are in flight.
 *
 * The owner portal looks up auth users one id at a time (auth.admin.getUserById
 * has no batch form). Firing hundreds of those at once on a page load invites
 * rate limiting from the auth service and slow, bursty renders. This keeps the
 * same result shape as Promise.allSettled, in input order, so callers only swap
 * the call.
 */

/** Auth lookups allowed in flight at once. Small on purpose: these are per-page-load reads. */
export const AUTH_LOOKUP_CONCURRENCY = 8;

export async function allSettledLimited<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
