/**
 * lib/intelligence-bus/payload-guard.ts
 *
 * Payload governance middleware for the Redline Intelligence Bus.
 *
 * Enforces:
 *   1. Maximum serialized event size (default 64 KB).
 *   2. Redaction of secrets that must never appear in the event store.
 *
 * Events containing large binary data (waveforms, images, PDFs, CAN traces)
 * must use RibPayloadReference objects pointing to external storage — never
 * embed the raw bytes inline.
 */

import type { RibMiddlewareFn } from './middleware/logging';
import type { RibEvent } from './event-types';

// ---------------------------------------------------------------------------
// Size limit
// ---------------------------------------------------------------------------

/** Maximum allowed serialized event size in bytes (64 KB) */
export const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024;

export class RibPayloadSizeError extends Error {
  constructor(public readonly actualBytes: number, public readonly limitBytes: number) {
    super(
      `RIB event payload exceeds size limit: ${actualBytes} bytes (limit: ${limitBytes} bytes). ` +
      'Large data must use RibPayloadReference, not inline content.',
    );
    this.name = 'RibPayloadSizeError';
  }
}

export const payloadSizeMiddleware: RibMiddlewareFn = async (event, next) => {
  const bytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
  if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
    throw new RibPayloadSizeError(bytes, MAX_EVENT_PAYLOAD_BYTES);
  }
  await next();
};

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

/**
 * Patterns matching field names that must never appear in an event payload.
 * These are checked against the full JSON serialization of the event.
 *
 * The check is conservative: if a key matching these patterns appears anywhere
 * in the event JSON (even nested), the event is rejected.
 */
const SECRET_KEY_PATTERNS: RegExp[] = [
  /\b(api[_-]?key|apikey)\b/i,
  /\b(auth[_-]?token|authtoken)\b/i,
  /\b(access[_-]?token|accesstoken)\b/i,
  /\b(refresh[_-]?token)\b/i,
  /\bpassword\b/i,
  /\b(service[_-]?role|servicerole)\b/i,
  /\b(secret[_-]?key|secretkey)\b/i,
  /\b(private[_-]?key|privatekey)\b/i,
  /\bbearer\b/i,
  /\bcredential(s)?\b/i,
];

export class RibSecretLeakError extends Error {
  constructor(public readonly matchedPattern: string) {
    super(
      `RIB event payload contains a field matching secret pattern '${matchedPattern}'. ` +
      'Never place credentials, tokens, or keys in event payloads.',
    );
    this.name = 'RibSecretLeakError';
  }
}

export function detectSecrets(event: RibEvent): void {
  const json = JSON.stringify(event);
  for (const pattern of SECRET_KEY_PATTERNS) {
    if (pattern.test(json)) {
      throw new RibSecretLeakError(pattern.source);
    }
  }
}

export const secretRedactionMiddleware: RibMiddlewareFn = async (event, next) => {
  detectSecrets(event);
  await next();
};

// ---------------------------------------------------------------------------
// Combined payload guard middleware (size + secrets, in that order)
// ---------------------------------------------------------------------------

export const payloadGuardMiddleware: RibMiddlewareFn = async (event, next) => {
  const bytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
  if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
    throw new RibPayloadSizeError(bytes, MAX_EVENT_PAYLOAD_BYTES);
  }
  detectSecrets(event);
  await next();
};
