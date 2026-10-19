/**
 * Encrypts the Cloud API access token before it is stored.
 *
 * The token lives in public.whatsapp_connection_secrets, a service-role-only
 * table. Encrypting it as well means a database read path — a backup, a
 * mis-granted role, a queued pg_net request (see
 * docs/security-hold-remediation-plan.md) — does not hand anyone a token that
 * can message D1's customers. The key is WHATSAPP_TOKEN_ENCRYPTION_KEY
 * (32 bytes, base64), server env only, never in the database.
 *
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>", AES-256-GCM.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class TokenKeyMissingError extends Error {
  constructor() {
    super('WHATSAPP_TOKEN_ENCRYPTION_KEY is not set (32 random bytes, base64).');
    this.name = 'TokenKeyMissingError';
  }
}

function key(): Buffer {
  const raw = (process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '').trim();
  if (!raw) throw new TokenKeyMissingError();
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new TokenKeyMissingError();
  return buf;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptToken(stored: string): string {
  const [v, ivB64, tagB64, encB64] = stored.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !encB64) throw new Error('unrecognised token format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
}
