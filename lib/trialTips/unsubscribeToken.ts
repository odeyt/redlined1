/**
 * Signed unsubscribe links.
 *
 * The link carries the user id and an HMAC of it. Nothing is stored: the
 * signature proves the link came from us, so nobody can unsubscribe someone
 * else by guessing an id, and nobody needs to be signed in to unsubscribe
 * themselves — which is the point of an unsubscribe link.
 *
 * The token reveals nothing about the person beyond an opaque id.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const PURPOSE = 'trial-tips-unsubscribe:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(PURPOSE + userId.toLowerCase()).digest('base64url');
}

export function unsubscribeToken(userId: string, secret: string): string {
  return sign(userId, secret);
}

/** True only for a well-formed user id with its own valid signature. */
export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!UUID.test(userId) || typeof token !== 'string' || token.length === 0 || token.length > 128) return false;
  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(appUrl: string, userId: string, secret: string): string {
  const url = new URL('/api/trial-tips/unsubscribe', appUrl);
  url.searchParams.set('u', userId);
  url.searchParams.set('t', unsubscribeToken(userId, secret));
  return url.toString();
}
