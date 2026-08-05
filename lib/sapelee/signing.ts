import { createHmac, randomUUID } from 'node:crypto'

/**
 * Phase E Part 1, Part 6 — mirrors Sapelee's verify-signature.ts scheme
 * exactly: canonicalString = `${timestamp}.${nonce}.${rawBody}`, hex HMAC-SHA256.
 *
 * SERVER-ONLY. This module reads/uses the raw shared secret and must never
 * be imported from a client component — it is only imported by
 * app/api/sapelee/flush/route.ts and scripts/flush-sapelee-outbox.ts, both
 * server-side execution contexts. Structural isolation is enforced by
 * lib/sapelee/__tests__/signing-isolation.test.ts, same pattern Sapelee
 * uses for its own service-role client.
 */

export interface SignedRequestHeaders {
  'X-Sapelee-Key-Id': string
  'X-Sapelee-Timestamp': string
  'X-Sapelee-Nonce': string
  'X-Sapelee-Signature': string
}

export function signRequest(
  keyId: string,
  secret: string,
  rawBody: string
): SignedRequestHeaders {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomUUID()
  const canonicalString = `${timestamp}.${nonce}.${rawBody}`
  const signature = createHmac('sha256', secret).update(canonicalString, 'utf8').digest('hex')

  return {
    'X-Sapelee-Key-Id': keyId,
    'X-Sapelee-Timestamp': timestamp,
    'X-Sapelee-Nonce': nonce,
    'X-Sapelee-Signature': signature,
  }
}
