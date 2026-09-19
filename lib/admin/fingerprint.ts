/**
 * lib/admin/fingerprint.ts
 * SERVER ONLY. A stable, one-way display reference for an internal identifier.
 *
 * A raw id prefix (e.g. its first 8 characters) is not safe to show: the owner
 * directory API returns full shop ids, so a prefix can simply be matched back to
 * one. This is an HMAC of the id under a server-side secret that never leaves the
 * server, so the reference can be compared with itself (the same account always
 * gets the same one) but cannot be reversed or matched to an id from another
 * response without that secret.
 *
 * The key is the service-role key the server already holds for its data reads —
 * no new secret and no environment change. Without it the value is still a hash
 * (not a prefix) but no longer secret, which only happens in an environment that
 * cannot read any data anyway.
 */
import 'server-only';
import { createHmac } from 'crypto';

const DOMAIN = 'redlined1-owner-portal-ref:v1:';

export function accountFingerprint(id: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return `ref-${createHmac('sha256', key).update(DOMAIN + id).digest('hex').slice(0, 10)}`;
}
