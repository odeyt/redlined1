/**
 * Idempotency for externally-triggered creates.
 *
 * A network timeout on a POST leaves the caller unable to tell whether the
 * record was created. Retrying without a key creates a second customer;
 * retrying with one returns the first result.
 *
 * ## Reserve first, then work
 *
 * The first version of this checked for a prior response and, finding none,
 * did the work and recorded the result afterwards. Three concurrent requests
 * with the same key all found nothing, all created a vehicle, and the unique
 * index then de-duplicated the BOOKKEEPING while three rows sat in the
 * database. Proven, not theorised: the M13.2 matrix created three.
 *
 * So the insert happens first, as a reservation. The unique index on
 * (api_key_id, endpoint, idempotency_key) decides which request proceeds —
 * one winner, atomically, no read-then-write window. The losers see the
 * reservation and either replay its stored response or, if it is still in
 * flight, are told to retry.
 *
 * This sits ABOVE the domain layer's own idempotency rather than replacing it.
 * The domain and the event outbox key on business identity — an invoice
 * number, a payment id — and they keep doing that. This keys on the caller's
 * request, which is the only thing that can distinguish "the same call again"
 * from "another vehicle that happens to look identical".
 */
import { createHash } from 'crypto';
import { ApiError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** status_code on a reservation that has not finished yet. */
const IN_FLIGHT = 0;

export function hashRequest(body: unknown): string {
  // Stable stringify: key order must not change the hash, or a caller whose
  // JSON serialiser reorders fields would see a spurious conflict.
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).sort().reduce((acc, k) => {
        acc[k] = stable((value as Record<string, unknown>)[k]);
        return acc;
      }, {} as Record<string, unknown>);
    }
    return value;
  };
  return createHash('sha256').update(JSON.stringify(stable(body)), 'utf8').digest('hex');
}

export type Reservation =
  /** This request won the key. Do the work, then call `completeReservation`. */
  | { mode: 'proceed' }
  /** A previous request under this key already finished. Return its response. */
  | { mode: 'replay'; statusCode: number; body: unknown };

/**
 * Claim the key, or discover who already has it.
 *
 * Throws IDEMPOTENCY_CONFLICT when the same key arrives with a different body
 * — the caller has a bug, and quietly returning the first answer would hide
 * it. Throws CONFLICT when an identical request is still running, which is a
 * retryable condition rather than a mistake.
 */
export async function reserveIdempotency(
  db: Db, keyId: string, endpoint: string, idempotencyKey: string, requestHash: string,
): Promise<Reservation> {
  const { error } = await db.from('api_idempotency').insert({
    api_key_id: keyId,
    endpoint,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
    status_code: IN_FLIGHT,
    response_body: {},
  });

  if (!error) return { mode: 'proceed' };

  // 23505 — somebody else holds this key. Read what they left.
  if ((error as { code?: string }).code !== '23505') throw new ApiError('INTERNAL_ERROR');

  const { data } = await db
    .from('api_idempotency')
    .select('request_hash, status_code, response_body')
    .eq('api_key_id', keyId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (!data) throw new ApiError('INTERNAL_ERROR');
  if (data.request_hash !== requestHash) throw new ApiError('IDEMPOTENCY_CONFLICT');

  if (data.status_code === IN_FLIGHT) {
    throw new ApiError('CONFLICT', {
      reason: 'A request with this Idempotency-Key is still in progress. Retry shortly.',
    });
  }

  return { mode: 'replay', statusCode: data.status_code, body: data.response_body };
}

/** Record what the winning request produced, so later retries replay it. */
export async function completeReservation(
  db: Db, keyId: string, endpoint: string, idempotencyKey: string,
  statusCode: number, body: unknown,
): Promise<void> {
  await db
    .from('api_idempotency')
    .update({ status_code: statusCode, response_body: body })
    .eq('api_key_id', keyId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey);
}

/**
 * Release a reservation whose work failed.
 *
 * Without this, a create that fails validation would leave a reservation that
 * never completes, and every retry of the corrected request would be told
 * "still in progress" until it was cleaned up by hand.
 */
export async function releaseReservation(
  db: Db, keyId: string, endpoint: string, idempotencyKey: string,
): Promise<void> {
  await db
    .from('api_idempotency')
    .delete()
    .eq('api_key_id', keyId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey)
    .eq('status_code', IN_FLIGHT);
}
