/**
 * Paged, filtered reads of estimates and invoices, shared by both domains.
 *
 * Added for API v1 (docs/api/PLAN.md phase 3). The staff screens keep using
 * `list()`, which loads everything; a machine caller polling a shop with
 * thousands of documents gets a page from the database instead.
 *
 * Provenance (who created a document) comes from columns added by
 * 2026-11-25_api_v1_documents.sql. Until that migration runs, the columns are
 * absent from `select('*')` and every document reads as made in the app,
 * which is true.
 */

export interface DocumentPageQuery {
  /** The stored status value (e.g. 'Draft'), not the API's lower-case name. */
  status?: string;
  customerId?: string;
  /** ISO timestamp; documents created at or after it. */
  createdSince?: string;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface DocumentPage<T> {
  rows: T[];
  /** Matching documents across all pages. */
  total: number;
}

export interface DocumentProvenance {
  /** 'api' when an API key created it; null for everything made in the app. */
  createdVia: 'api' | 'ui' | null;
  createdByApiKeyId: string | null;
}

export function provenanceOf(row: Record<string, unknown>): DocumentProvenance {
  const via = row.created_via;
  return {
    createdVia: via === 'api' || via === 'ui' ? via : null,
    createdByApiKeyId: typeof row.created_by_api_key_id === 'string' ? row.created_by_api_key_id : null,
  };
}

/** Zero-based inclusive range for PostgREST `.range()`. */
export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (Math.max(1, Math.floor(page)) - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/**
 * A draft rule refused the operation. The API maps every reason to 409
 * CONFLICT except NOT_FOUND (404). Thrown only by API-path operations.
 */
export type DocumentStateReason =
  | 'NOT_FOUND'
  | 'NOT_DRAFT'
  | 'NOT_APPROVED'
  | 'ALREADY_CONVERTED'
  | 'LINES_HAVE_COST_DATA';

export class DocumentStateError extends Error {
  readonly reason: DocumentStateReason;
  readonly details?: Record<string, unknown>;
  constructor(reason: DocumentStateReason, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DocumentStateError';
    this.reason = reason;
    this.details = details;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** The filters both tables share. Tenancy is applied by the caller. */
export function applyDocumentFilters(query: Query, q: DocumentPageQuery): Query {
  let out = query;
  if (q.status) out = out.eq('status', q.status);
  if (q.customerId) out = out.eq('customer_id', q.customerId);
  if (q.createdSince) out = out.gte('created_at', q.createdSince);
  return out;
}
