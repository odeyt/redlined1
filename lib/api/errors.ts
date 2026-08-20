/**
 * The stable error vocabulary for API v1.
 *
 * These strings are a contract. An integration will branch on them, so a code
 * may be added but never renamed or repurposed inside v1.
 *
 * Nothing here carries a database message. A Postgres error, an RLS policy
 * name or a Supabase internal tells an attacker the shape of the schema and
 * tells a legitimate caller nothing they can act on. The internal detail goes
 * to the log with the request id; the caller gets a code and a sentence.
 */
export const API_ERRORS = {
  AUTH_REQUIRED:        { status: 401, message: 'An API key is required.' },
  INVALID_API_KEY:      { status: 401, message: 'That API key is not valid.' },
  API_KEY_REVOKED:      { status: 401, message: 'That API key has been revoked.' },
  FORBIDDEN:            { status: 403, message: 'This key may not perform that operation.' },
  SCOPE_REQUIRED:       { status: 403, message: 'This key is missing a required scope.' },
  SHOP_NOT_ACCESSIBLE:  { status: 403, message: 'That shop is not accessible to this key.' },
  VALIDATION_FAILED:    { status: 422, message: 'The request body failed validation.' },
  NOT_FOUND:            { status: 404, message: 'No such resource.' },
  CONFLICT:             { status: 409, message: 'That conflicts with the current state.' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'That Idempotency-Key was used with a different request body.' },
  RATE_LIMITED:         { status: 429, message: 'Too many requests.' },
  ENTITLEMENT_DENIED:   { status: 402, message: 'The plan for this organization does not include that.' },
  INTERNAL_ERROR:       { status: 500, message: 'Something went wrong on our side.' },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

/** Thrown anywhere under an API route; the handler turns it into a response. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, details?: unknown) {
    super(API_ERRORS[code].message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}
