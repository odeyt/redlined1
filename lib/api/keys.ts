/**
 * API key issuing and listing for the owner's Settings → API Keys screen
 * (docs/api/PLAN.md phase 6). Same key format and storage as
 * scripts/api-key.ts: the secret is returned once and never stored; the
 * database keeps sha256 of it and a short non-secret prefix.
 *
 * Keys issued here are always SHOP-scoped to the owner's shop. A key that
 * spans an organization's shops cannot write anyway, and a screen that hands
 * out cross-shop access by accident is the mistake to design out.
 */
import 'server-only';
import { randomBytes } from 'crypto';
import { API_KEY_PREFIX, hashApiKey } from './principal';

export * from './keyCatalog';

export interface IssuedSecret {
  secret: string;
  prefix: string;
  keyHash: string;
}

export function generateApiKey(): IssuedSecret {
  const secret = API_KEY_PREFIX + randomBytes(24).toString('hex');
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX.length + 8), keyHash: hashApiKey(secret) };
}
