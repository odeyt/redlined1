/**
 * AutoPartsAPI (apiprofile.com) — the shapes we accept from the provider.
 *
 * Typed loosely and defensively. This is someone else's payload: a missing
 * field is normal rather than exceptional, and every string that reaches our
 * UI still goes through `safeText` at the normalisation boundary.
 */

/** What a request failed for, in terms a caller can branch on. */
export type AutoPartsErrorKind =
  | 'no_credentials'
  | 'unauthorized'      // 401 / 403
  | 'not_found'         // 404
  | 'rate_limited'      // 429 — free tier is small, so this is expected
  | 'provider_error'    // 5xx
  | 'timeout'
  | 'malformed'         // 2xx with unparseable or unexpected JSON
  | 'bad_request';      // 4xx we did not classify

export class AutoPartsApiError extends Error {
  readonly kind: AutoPartsErrorKind;
  readonly status?: number;

  constructor(kind: AutoPartsErrorKind, status?: number, detail?: string) {
    // The message is for our logs. It NEVER contains the key, and it never
    // reaches a technician — the provider layer maps it to a fixed phrase.
    super(`autopartsapi:${kind}${status ? `:${status}` : ''}${detail ? ` ${detail}` : ''}`);
    this.name = 'AutoPartsApiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Which catalogue locale we are asking in.
 *
 * The provider addresses these as `lang-id` and `country-filter-id`. The
 * example request in the provider dashboard used `lang-id/4` and
 * `country-filter-id/63`, and NEITHER is hard-coded here: an id in an example
 * is not documentation, and guessing that 4 means English or 63 means any
 * particular country is exactly the kind of assumption that produces a
 * catalogue in the wrong language with nobody noticing.
 *
 * `languageId` is resolved at runtime from `/languages/list` by matching the
 * language NAME, and cached. `countryFilterId` is deliberately optional and
 * unset in Phase 1 — see the note in client.ts.
 */
export interface AutoPartsLocale {
  languageId: number;
  countryFilterId?: number;
}

/** A row from `/languages/list`. Field names are tolerated in several forms. */
export interface AutoPartsLanguageRow {
  id?: number | string;
  languageId?: number | string;
  lang_id?: number | string;
  name?: string;
  language?: string;
  title?: string;
  code?: string;
  iso?: string;
}

/**
 * A catalogue article, as far as we are willing to assume.
 *
 * Every field is optional because the real response shape is NOT documented to
 * us yet. Nothing in Phase 1 depends on a field being present; a row that
 * cannot produce a title is dropped rather than shown.
 */
export interface AutoPartsArticle {
  id?: number | string;
  articleId?: number | string;
  name?: string;
  title?: string;
  description?: string;
  brand?: string;
  brandName?: string;
  supplier?: string;
  articleNumber?: string;
  mpn?: string;
  oem?: string | string[];
  oemNumbers?: string[];
  imageUrl?: string;
  image?: string;
  images?: Array<{ url?: string }>;
  [key: string]: unknown;
}
