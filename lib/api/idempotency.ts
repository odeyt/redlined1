/**
 * Idempotency for externally-triggered creates.
 *
 * A network timeout on a POST leaves the caller unable to tell whether the
 * record was created. Retrying without a key creates a second customer;
 * retrying with one returns the first result.
 *
 * This sits ABOVE the domain layer's own idempotency rather than replacing it.
 * The domain and the event outbox key on business identity — an invoice
 * number, a payment id — and they keep doing that. This keys on the caller's
 * request, which is the only thing that can distinguish "the same call again"
 * from "another customer with the same name", something the business data
 * genuinely cannot answer.
 */
import { createHash } from 'crypto';
import { ApiError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

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

export interface Replay { statusCode: number; body: unknown }

/**
 * What a prior request under this key produced, if any.
 *
 * Same key + same body → the stored response, replayed.
 * Same key + different body → IDEMPOTENCY_CONFLICT, because the caller has a
 * bug and quietly returning the first answer would hide it.
 */
export async function findReplay(
  db: Db, keyId: string, endpoint: string, idempotencyKey: string, requestHash: string,
): Promise<Replay | null> {
  const { data } = await db
    .from('api_idempotency')
    .select('request_hash, status_code, response_body')
    .eq('api_key_id', keyId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (!data) return null;
  if (data.request_hash !== requestHash) throw new ApiError('IDEMPOTENCY_CONFLICT');
  return { statusCode: data.status_code, body: data.response_body };
}

export async function recordReplay(
  db: Db, keyId: string, endpoint: string, idempotencyKey: string,
  requestHash: string, statusCode: number, body: unknown,
): Promise<void> {
  // onConflict do-nothing: two concurrent retries both do the work, and the
  // unique index decides which recording stands. The alternative — failing the
  // second — would turn a successful create into an error.
  await db.from('api_idempotency').upsert(
    {
      api_key_id: keyId, endpoint, idempotency_key: idempotencyKey,
      request_hash: requestHash, status_code: statusCode, response_body: body,
    },
    { onConflict: 'api_key_id,endpoint,idempotency_key', ignoreDuplicates: true },
  );
}
